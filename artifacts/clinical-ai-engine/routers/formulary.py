"""
Formulary administration: import, review, and the pharmacist sign-off packet.

Everything here is admin-only. Importing decides what figures the system will
quote to a nurse, and approving decides whether it quotes them at all — both are
at least as privileged as uploading a clinical document.

Every import and every review decision is appended to the tamper-evident audit
chain, so "who approved this dose, from which source, and when" is evidence
rather than a claim.
"""
import io
import logging
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from models.database import db_cursor
from models.formulary import ReviewStatus
from routers.auth import require_admin
from services.audit_events import record_formulary_event
from services.formulary import get_formulary
from services.formulary_import import (
    FormularyFileError,
    ImportReport,
    import_formulary,
    load_mapping,
)

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB — a formulary is a spreadsheet


# ── Listing ───────────────────────────────────────────────────────────────────

LIST_SQL = """
    SELECT drug_id, generic_name, name_ar, unit, auto_calculate, dose_per_kg,
           adult_flat_min, adult_flat_max, adult_max_dose, adult_max_daily,
           pediatric_min_per_kg, pediatric_max_per_kg,
           overdose_threshold_absolute, overdose_threshold_per_kg,
           frequency, route, antidote, reference_regimen, high_risk,
           source_name, source_edition, source_ref,
           imported_from_file, imported_at, imported_by,
           review_status, reviewed_by, reviewer_license, reviewed_at,
           review_note, version, updated_at
    FROM bnp_drug_formulary
    WHERE retired_at IS NULL
      AND (%(status)s IS NULL OR review_status = %(status)s)
    ORDER BY high_risk DESC, generic_name
    LIMIT %(limit)s OFFSET %(offset)s
"""


@router.get("")
@router.get("/")
def list_drugs(
    status: Optional[str] = Query(
        default=None, pattern="^(pending|approved|rejected)$"
    ),
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_admin),
):
    """The review queue. Defaults to every live drug, highest risk first."""
    with db_cursor() as (cur, _):
        cur.execute(LIST_SQL, {"status": status, "limit": limit, "offset": offset})
        rows = [dict(r) for r in cur.fetchall()]
    return {"summary": get_formulary().counts(), "drugs": rows}


@router.get("/summary")
def summary(_admin: dict = Depends(require_admin)):
    formulary = get_formulary()
    return {
        "version": formulary.version(),
        "review_status": formulary.review_summary(),
        "counts": formulary.counts(),
        "available": formulary.is_available,
    }


# ── Import ────────────────────────────────────────────────────────────────────

async def _read_upload(upload: UploadFile) -> bytes:
    content = b""
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        content += chunk
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds {MAX_FILE_SIZE // (1024 * 1024)} MB.",
            )
    return content


@router.post("/import")
async def import_file(
    request: Request,
    file: UploadFile = File(...),
    mapping: Optional[UploadFile] = File(default=None),
    dry_run: bool = Form(default=True),
    admin: dict = Depends(require_admin),
):
    """
    Validate a formulary file, and apply it only when explicitly asked to.

    `dry_run` defaults to true. An import silently rewriting clinical figures on
    a first attempt would be the wrong shape of tool: the operator should read
    the rejection report first.

    A row is rejected rather than repaired. Guessing at a missing unit or an
    ambiguous threshold is how the defects this system was built to remove got
    in originally.
    """
    content = await _read_upload(file)
    if not content:
        raise HTTPException(status_code=400, detail="The file is empty.")

    column_map = {}
    if mapping is not None:
        column_map = load_mapping((await _read_upload(mapping)).decode("utf-8", "replace"))

    try:
        report = import_formulary(
            content=content,
            file_name=file.filename or "formulary",
            mapping=column_map,
            actor=admin.get("username") or str(admin.get("sub")),
            dry_run=dry_run,
        )
    except FormularyFileError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not dry_run:
        _record_import(report, admin, request)
        # Republish the in-memory formulary so the change takes effect without
        # a restart. Built from the database, so a failure here leaves the
        # previous snapshot serving rather than a half-applied one.
        get_formulary().reload()

    return report.to_dict()


def _record_import(report: ImportReport, admin: dict, request: Request) -> None:
    summary = report.to_dict()["summary"]
    detail = (
        f"file={report.file_name} sha256={report.sha256} "
        f"inserted={summary['inserted']} updated={summary['updated']} "
        f"unchanged={summary['unchanged']} rejected={summary['rejected']}"
    )
    changed = [r.generic_name for r in report.rows if r.action == "updated"]
    if changed:
        detail += f" reset_to_pending={','.join(sorted(changed))}"

    record_formulary_event(
        user_id=int(admin["sub"]),
        username=admin.get("username") or str(admin["sub"]),
        action="formulary.import",
        detail=detail,
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


# ── Review ────────────────────────────────────────────────────────────────────

class ReviewDecision(BaseModel):
    decision: ReviewStatus
    reviewed_by: str = Field(min_length=2, max_length=200)
    reviewer_license: str = Field(min_length=2, max_length=100)
    note: Optional[str] = Field(default=None, max_length=2000)
    source_name: Optional[str] = Field(default=None, max_length=300)
    source_edition: Optional[str] = Field(default=None, max_length=100)
    source_ref: Optional[str] = Field(default=None, max_length=300)


REVIEW_SQL = """
    UPDATE bnp_drug_formulary SET
        review_status = %(decision)s,
        reviewed_by = %(reviewed_by)s,
        reviewer_license = %(reviewer_license)s,
        reviewed_at = NOW(),
        review_note = %(note)s,
        source_name = COALESCE(%(source_name)s, source_name),
        source_edition = COALESCE(%(source_edition)s, source_edition),
        source_ref = COALESCE(%(source_ref)s, source_ref),
        updated_at = NOW()
    WHERE drug_id = %(drug_id)s AND retired_at IS NULL
    RETURNING generic_name, version
"""


@router.post("/{drug_id}/review")
def review_drug(
    drug_id: str,
    body: ReviewDecision,
    request: Request,
    admin: dict = Depends(require_admin),
):
    """
    Record a pharmacist's decision on one drug.

    The reviewer's name and licence number are required and stored: an approval
    that cannot be attributed to a licensed person is not an approval. Only an
    approved drug produces a dose — see `models/formulary.CoverageStatus`.
    """
    params = body.model_dump()
    params["decision"] = body.decision.value
    params["drug_id"] = drug_id

    with db_cursor() as (cur, _):
        try:
            cur.execute(REVIEW_SQL, params)
        except Exception as e:  # invalid UUID, constraint violation
            raise HTTPException(status_code=400, detail=str(e))
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="No such drug in the formulary.")

    record_formulary_event(
        user_id=int(admin["sub"]),
        username=admin.get("username") or str(admin["sub"]),
        action=f"formulary.review.{body.decision.value}",
        detail=(
            f"drug={row['generic_name']} version={row['version']} "
            f"reviewer={body.reviewed_by} licence={body.reviewer_license} "
            f"note={body.note or ''}"
        ),
        drug_id=drug_id,
        rejected=body.decision is ReviewStatus.REJECTED,
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    get_formulary().reload()
    return {
        "drug": row["generic_name"],
        "review_status": body.decision.value,
        "summary": get_formulary().counts(),
    }


# ── Review packet ─────────────────────────────────────────────────────────────

PACKET_FIELDS = [
    ("unit", "Unit the figures are in"),
    ("dose_per_kg", "Dose per kg"),
    ("adult_flat_min", "Adult dose, lower bound"),
    ("adult_flat_max", "Adult dose, upper bound"),
    ("adult_max_dose", "Maximum single dose"),
    ("adult_max_daily", "Maximum daily dose"),
    ("adult_max_daily_elderly", "Maximum daily dose, elderly"),
    ("pediatric_min_per_kg", "Pediatric dose per kg, lower bound"),
    ("pediatric_max_per_kg", "Pediatric dose per kg, upper bound"),
    ("overdose_threshold_absolute", "Overdose threshold, absolute total"),
    ("overdose_threshold_per_kg", "Overdose threshold, per kg"),
    ("frequency", "Frequency"),
    ("route", "Route"),
    ("antidote", "Antidote"),
    ("reference_regimen", "Regimen (uncalculated drugs)"),
]


@router.get("/review-packet.xlsx")
def review_packet(
    status: Optional[str] = Query(
        default="pending", pattern="^(pending|approved|rejected|all)$"
    ),
    _admin: dict = Depends(require_admin),
):
    """
    One row per clinical value, for a pharmacist or a P&T committee.

    Per value rather than per drug on purpose: 17 drugs is about 170 figures,
    and a sign-off recorded against a whole drug says nothing about which of
    its numbers were actually checked.
    """
    from openpyxl import Workbook

    where = "" if status == "all" else "AND review_status = %(status)s"
    with db_cursor() as (cur, _):
        cur.execute(
            f"""
            SELECT * FROM bnp_drug_formulary
            WHERE retired_at IS NULL {where}
            ORDER BY high_risk DESC, generic_name
            """,
            {"status": status},
        )
        drugs = [dict(r) for r in cur.fetchall()]

    wb = Workbook()
    ws = wb.active
    ws.title = "Formulary review"
    ws.append([
        "Drug", "High alert", "Field", "What it is", "Current value",
        "Source on file", "Source (pharmacist)", "Approve / amend to",
        "Reviewer", "Licence no.", "Date", "Note",
    ])
    for drug in drugs:
        for field_name, description in PACKET_FIELDS:
            value = drug.get(field_name)
            if value is None:
                continue
            ws.append([
                drug["generic_name"],
                "YES" if drug["high_risk"] else "",
                field_name,
                description,
                str(value),
                " · ".join(
                    p for p in (
                        drug.get("source_name"),
                        drug.get("source_edition"),
                        drug.get("source_ref"),
                    ) if p
                ),
                "", "", "", "", "", "",
            ])

    for column, width in zip("ABCDEFGHIJKL", (18, 10, 28, 34, 18, 34, 30, 22, 22, 16, 12, 30)):
        ws.column_dimensions[column].width = width
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": 'attachment; filename="formulary-review.xlsx"'
        },
    )
