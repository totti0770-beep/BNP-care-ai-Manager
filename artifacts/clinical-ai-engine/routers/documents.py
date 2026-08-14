"""Document upload and management router."""
import uuid
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from models.database import db_cursor
from models.schemas import DocumentMeta
from services.pdf_processor import process_pdf
from services.embeddings import get_retriever
from services.metrics import metrics
from routers.auth import get_current_user, require_admin

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin),
):
    """
    Upload a PDF document:
    1. Extract text page-by-page
    2. Chunk into ~500-token segments
    3. Store chunk metadata in PostgreSQL
    4. Add chunks to FAISS + BM25 hybrid index

    Admin-only. Anything indexed here becomes a source that clinical answers are
    generated from, so upload is as privileged as delete.
    """
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
                "INSERT INTO bnp_documents (id, filename, uploaded_by, chunk_count) VALUES (%s, %s, %s, %s)",
                (document_id, file.filename, user_id, len(chunks)),
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

    # Index in hybrid retriever
    retriever = get_retriever()
    retriever.add_chunks(chunks, document_id, file.filename)

    metrics.incr("bnp_documents_indexed_total")
    logger.info(f"Uploaded '{file.filename}' → {len(chunks)} chunks by user {user_id}")

    return {
        "document_id": document_id,
        "filename": file.filename,
        "chunks_indexed": len(chunks),
        "message": f"Document processed and indexed successfully ({len(chunks)} chunks).",
    }


@router.get("/", response_model=list)
def list_documents(current_user: dict = Depends(get_current_user)):
    """List all uploaded documents."""
    with db_cursor() as (cur, _):
        cur.execute(
            """
            SELECT d.id, d.filename, d.upload_date, d.chunk_count,
                   u.username as uploaded_by
            FROM bnp_documents d
            LEFT JOIN bnp_users u ON d.uploaded_by = u.id
            WHERE d.deleted_at IS NULL
            ORDER BY d.upload_date DESC
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
    _admin: dict = Depends(require_admin),
):
    """
    Return the exact passage behind a citation.

    This is the point of recording chunk_id on every citation: an incident
    review can ask "what text produced this recommendation?" and get the answer,
    including for documents that have since been retired — which is why deletion
    is soft.
    """
    with db_cursor() as (cur, _):
        cur.execute(
            """
            SELECT c.chunk_id, c.content, c.page_number, c.chunk_index,
                   c.document_id, c.deleted_at AS chunk_retired_at,
                   d.filename, d.deleted_at AS document_retired_at
            FROM bnp_chunks c
            JOIN bnp_documents d ON c.document_id = d.id
            WHERE c.chunk_id = %s
            """,
            (chunk_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Chunk not found")

    return {
        **row,
        # A retired source is still valid evidence for a past answer; it is just
        # no longer used for new ones.
        "retired": row["document_retired_at"] is not None
        or row["chunk_retired_at"] is not None,
    }
