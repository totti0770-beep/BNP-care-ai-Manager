"""Document upload and management router."""
import uuid
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from models.database import db_cursor
from models.schemas import DocumentApproval, DocumentMeta
from services.pdf_processor import process_pdf
from services.embeddings import get_retriever, is_currently_valid
from services.metrics import metrics
from routers.auth import get_current_user, require_admin

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def _parse_optional_date(value: Optional[str], field: str) -> Optional[date]:
    """
    A clinical validity date is either a real date or absent. A malformed one
    must be rejected at the door rather than stored as NULL, because NULL here
    means "no limit" — silently turning a typo into a document that never
    expires.
    """
    if value is None or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"{field} must be an ISO date (YYYY-MM-DD).",
        )


@router.post("/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    effective_date: Optional[str] = Form(default=None),
    expiry_date: Optional[str] = Form(default=None),
    source_note: Optional[str] = Form(default=None),
    current_user: dict = Depends(require_admin),
):
    """
    Stage a PDF document for review:
    1. Extract text page-by-page
    2. Chunk into ~500-token segments
    3. Store chunk metadata in PostgreSQL, with the document `pending`

    The document is NOT indexed here, and nothing in it can be retrieved, cited
    or shown to a nurse until an admin approves it through
    `POST /documents/{id}/approve`.

    Uploading and publishing used to be the same act: a PDF became a source that
    clinical answers were generated from the moment it finished processing, so
    the engine could not distinguish a P&T-approved manual from a draft someone
    uploaded by mistake. Separating them is the point of this endpoint.

    Admin-only, as it has always been.
    """
    effective = _parse_optional_date(effective_date, "effective_date")
    expires = _parse_optional_date(expiry_date, "expiry_date")
    if effective and expires and expires <= effective:
        raise HTTPException(
            status_code=422,
            detail="expiry_date must be after effective_date.",
        )
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Read incrementally so an oversized upload cannot exhaust memory before
    # the size limit is applied.
    chunks_read: list[bytes] = []
    total = 0
    while True:
        block = await file.read(1024 * 1024)
        if not block:
            break
        total += len(block)
        if total > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File exceeds 50 MB limit.")
        chunks_read.append(block)
    content = b"".join(chunks_read)

    if not content.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=400,
            detail="File is not a valid PDF (bad magic bytes).",
        )

    document_id = str(uuid.uuid4())

    # Process PDF
    try:
        chunks = process_pdf(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")

    # Persist document metadata
    user_id = int(current_user["sub"])
    try:
        with db_cursor() as (cur, _):
            cur.execute(
                """
                INSERT INTO bnp_documents
                    (id, filename, uploaded_by, chunk_count,
                     status, effective_date, expiry_date, source_note)
                VALUES (%s, %s, %s, %s, 'pending', %s, %s, %s)
                """,
                (
                    document_id, file.filename, user_id, len(chunks),
                    effective, expires, (source_note or "").strip() or None,
                ),
            )
            for chunk in chunks:
                # Minted once and carried into the index, so a citation can be
                # joined back to this row. The index used to generate its own
                # separate uuid4 for the same chunk.
                chunk["chunk_id"] = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO bnp_chunks (chunk_id, document_id, content, page_number, chunk_index) VALUES (%s,%s,%s,%s,%s)",
                    (chunk["chunk_id"], document_id, chunk["content"], chunk["page_number"], chunk["chunk_index"]),
                )
    except Exception as e:
        logger.error(f"DB error: {e}")
        raise HTTPException(status_code=500, detail="Database error during upload.")

    # Deliberately not indexed. The document is staged, and approval is what
    # publishes it — see POST /documents/{id}/approve.
    metrics.incr("bnp_documents_staged_total")
    logger.info(
        f"Staged '{file.filename}' → {len(chunks)} chunks by user {user_id} "
        "(pending approval, not indexed)"
    )

    return {
        "document_id": document_id,
        "filename": file.filename,
        "status": "pending",
        "chunks_extracted": len(chunks),
        "chunks_indexed": 0,
        "message": (
            f"Document processed ({len(chunks)} chunks) and is pending approval. "
            "It is not searchable and cannot be cited until an administrator "
            "approves it."
        ),
    }


@router.post("/{document_id}/approve")
def approve_document(
    document_id: str,
    decision: DocumentApproval,
    current_user: dict = Depends(require_admin),
):
    """
    Approve a staged document, and index it.

    This is the moment a PDF becomes clinical knowledge the engine will answer
    from, so it is the moment that gets a name attached to it. The approver is
    recorded on the row and the event goes onto the tamper-evident audit chain,
    the same way a formulary review decision does.
    """
    approver = (decision.approved_by or "").strip()
    if not approver:
        raise HTTPException(
            status_code=422,
            detail="approved_by is required: an approval with no name is not one.",
        )

    with db_cursor() as (cur, _):
        cur.execute(
            """
            SELECT id, filename, status, version, effective_date, expiry_date
              FROM bnp_documents
             WHERE id = %s AND deleted_at IS NULL
            """,
            (document_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Document not found")
        if row["status"] == "approved":
            raise HTTPException(
                status_code=409, detail="Document is already approved."
            )
        if row["status"] in ("retired", "superseded"):
            raise HTTPException(
                status_code=409,
                detail=f"A {row['status']} document cannot be approved.",
            )

        cur.execute(
            """
            UPDATE bnp_documents
               SET status      = 'approved',
                   approved_by = %s,
                   approved_at = NOW(),
                   source_note = COALESCE(%s, source_note)
             WHERE id = %s AND deleted_at IS NULL
            """,
            (approver, (decision.source_note or "").strip() or None, document_id),
        )

        cur.execute(
            """
            SELECT chunk_id, content, page_number, chunk_index
              FROM bnp_chunks
             WHERE document_id = %s AND deleted_at IS NULL
             ORDER BY chunk_index ASC
            """,
            (document_id,),
        )
        chunks = [dict(c) for c in cur.fetchall()]

    if not chunks:
        raise HTTPException(
            status_code=409,
            detail="Document has no live chunks to index.",
        )

    retriever = get_retriever()
    retriever.add_chunks(
        chunks,
        document_id,
        row["filename"],
        document_status="approved",
        document_version=row["version"],
        effective_date=row["effective_date"],
        expiry_date=row["expiry_date"],
    )

    metrics.incr("bnp_documents_indexed_total")
    logger.info(
        f"Approved '{row['filename']}' ({document_id}) by {approver} — "
        f"{len(chunks)} chunks indexed"
    )

    return {
        "document_id": document_id,
        "filename": row["filename"],
        "status": "approved",
        "approved_by": approver,
        "chunks_indexed": len(chunks),
    }


@router.post("/{document_id}/supersede")
def supersede_document(
    document_id: str,
    replacement_id: str,
    _admin: dict = Depends(require_admin),
):
    """
    Record that one document replaces another, and stop serving the old one.

    Retiring the old document alone would lose *why* it was withdrawn. A
    superseded row keeps pointing at what replaced it, so an incident review
    reading a citation from last year can follow the trail forward.
    """
    if replacement_id == document_id:
        raise HTTPException(
            status_code=422, detail="A document cannot supersede itself."
        )

    with db_cursor() as (cur, _):
        cur.execute(
            "SELECT id, status FROM bnp_documents WHERE id = %s AND deleted_at IS NULL",
            (replacement_id,),
        )
        replacement = cur.fetchone()
        if replacement is None:
            raise HTTPException(
                status_code=404, detail="Replacement document not found"
            )

        cur.execute(
            """
            UPDATE bnp_documents
               SET status = 'superseded', superseded_by = %s
             WHERE id = %s AND deleted_at IS NULL AND status <> 'superseded'
            """,
            (replacement_id, document_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(
                status_code=404, detail="Document not found or already superseded"
            )

    # The text stays in the database for the audit trail; only the vectors go.
    get_retriever().remove_document(document_id)
    metrics.incr("bnp_documents_retired_total")
    logger.info(f"Document {document_id} superseded by {replacement_id}")

    return {
        "document_id": document_id,
        "status": "superseded",
        "superseded_by": replacement_id,
    }


@router.get("/", response_model=list)
def list_documents(current_user: dict = Depends(get_current_user)):
    """List all uploaded documents."""
    with db_cursor() as (cur, _):
        cur.execute(
            """
            SELECT d.id, d.filename, d.upload_date, d.chunk_count,
                   d.status, d.version, d.effective_date, d.expiry_date,
                   d.approved_by, d.approved_at, d.superseded_by, d.source_note,
                   u.username as uploaded_by
            FROM bnp_documents d
            LEFT JOIN bnp_users u ON d.uploaded_by = u.id
            WHERE d.deleted_at IS NULL
            -- Pending first: a document waiting on approval is the one that
            -- needs a human, and it is invisible to search until it gets one.
            ORDER BY (d.status = 'pending') DESC, d.upload_date DESC
            """,
        )
        return cur.fetchall()


@router.delete("/{document_id}", status_code=204)
def delete_document(
    document_id: str,
    _admin: dict = Depends(require_admin),
):
    """
    Retire a document: it stops being retrievable, and its text is preserved.

    This used to hard-delete, cascading to bnp_chunks — so the passage a past
    clinical recommendation was generated from disappeared, while the audit row
    still cited it by name and page. An audit trail that cannot produce its own
    evidence is not an audit trail.
    """
    with db_cursor() as (cur, _):
        cur.execute(
            """
            UPDATE bnp_documents
               SET deleted_at = NOW()
             WHERE id = %s AND deleted_at IS NULL
            """,
            (document_id,),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Document not found")
        cur.execute(
            "UPDATE bnp_chunks SET deleted_at = NOW() WHERE document_id = %s AND deleted_at IS NULL",
            (document_id,),
        )

    retriever = get_retriever()
    retriever.remove_document(document_id)
    metrics.incr("bnp_documents_retired_total")
    logger.info(f"Retired document {document_id} (text preserved for audit)")
    return None


@router.get("/chunks/{chunk_id}")
def get_chunk(
    chunk_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Return the exact passage behind a citation.

    This is the point of recording chunk_id on every citation: an incident
    review can ask "what text produced this recommendation?" and get the answer,
    including for documents that have since been retired — which is why deletion
    is soft.

    Two readers, two rules. An administrator may read any passage, retired or
    not, because that is what an incident review needs. A nurse may read only a
    passage the engine would cite today — an approved, in-date, non-retired
    document — which is exactly what they already saw an excerpt of in the
    assistant. The rule is applied here, not in a client, and it is the same
    `is_currently_valid` the retriever uses, so the two cannot disagree.
    """
    with db_cursor() as (cur, _):
        cur.execute(
            """
            SELECT c.chunk_id, c.content, c.page_number, c.chunk_index,
                   c.document_id, c.deleted_at AS chunk_retired_at,
                   d.filename, d.deleted_at AS document_retired_at,
                   d.status AS document_status, d.version AS document_version,
                   d.effective_date, d.expiry_date,
                   d.approved_by, d.approved_at
            FROM bnp_chunks c
            JOIN bnp_documents d ON c.document_id = d.id
            WHERE c.chunk_id = %s
            """,
            (chunk_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Chunk not found")

    row = dict(row)
    # A retired source is still valid evidence for a past answer; it is just
    # no longer used for new ones.
    retired = (
        row["document_retired_at"] is not None
        or row["chunk_retired_at"] is not None
    )
    currently_valid = not retired and is_currently_valid(
        {
            "document_status": row.get("document_status"),
            "effective_date": row.get("effective_date"),
            "expiry_date": row.get("expiry_date"),
        }
    )

    if current_user.get("role") != "admin" and not currently_valid:
        # 403, not 404: the passage exists, and saying otherwise would tell a
        # nurse the citation they are holding never happened.
        raise HTTPException(
            status_code=403,
            detail=(
                "This passage belongs to a document that is not currently "
                "approved for clinical use. An administrator can still review it."
            ),
        )

    return {
        **row,
        "retired": retired,
        "currently_valid": currently_valid,
    }
