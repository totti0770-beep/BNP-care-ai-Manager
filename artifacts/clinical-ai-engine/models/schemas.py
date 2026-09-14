from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class QueryType(str, Enum):
    DRUG = "drug"
    PROTOCOL = "protocol"
    GENERAL = "general"


class ClinicalIntent(str, Enum):
    """
    What the nurse asked for, orthogonal to `QueryType`.

    `QueryType.DRUG` decides whether the drug-safety layer runs; the intent
    decides which part of the drug's record answers the question. Keeping them
    separate is deliberate: every medication question must keep its formulary
    lookup, contraindication check and overdose gate, whatever was asked.
    """

    DOSE = "dose"
    DOSE_CALCULATION = "dose_calculation"
    PREPARATION = "preparation"
    ADMINISTRATION = "administration"
    RENAL_ADJUSTMENT = "renal_adjustment"
    PEDIATRIC_DOSING = "pediatric_dosing"
    ANTIDOTE = "antidote"
    MONITORING = "monitoring"
    GENERAL_DRUG_INFO = "general_drug_info"
    FULL_DRUG_INFO = "full_drug_info"


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=12, max_length=256)
    full_name: str = Field(..., max_length=200)
    role: UserRole = UserRole.USER


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 3600
    user: dict


class DocumentChunk(BaseModel):
    chunk_id: str
    document_id: str
    content: str
    page_number: int
    chunk_index: int


class DocumentMeta(BaseModel):
    id: str
    filename: str
    upload_date: str
    chunk_count: int
    uploaded_by: str

    # Lifecycle. Optional so a client built against the previous shape still
    # parses a response, and so this model stays usable for a row read before
    # 0004_document_lifecycle ran.
    status: Optional[str] = None
    version: Optional[int] = None
    effective_date: Optional[str] = None
    expiry_date: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    superseded_by: Optional[str] = None
    source_note: Optional[str] = None


class DocumentApproval(BaseModel):
    """
    Accepting a document as clinical knowledge the engine may answer from.

    `approved_by` is required and non-empty for the same reason
    `ck_documents_approver_present` exists in the database: an approval nobody
    is named on cannot be reviewed afterwards, and this event goes onto the
    tamper-evident audit chain.
    """
    approved_by: str = Field(..., min_length=2, max_length=200)
    source_note: Optional[str] = Field(default=None, max_length=2000)


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=4000)
    patient_weight_kg: Optional[float] = Field(default=None, gt=0, le=500)
    top_k: int = Field(default=5, ge=1, le=20)
    drug_name: Optional[str] = Field(default=None, max_length=100)
    other_drugs: Optional[List[str]] = Field(default=[], max_length=50)
    conditions: Optional[List[str]] = Field(default=[], max_length=50)
    age: Optional[int] = Field(default=None, ge=0, le=120)


class Citation(BaseModel):
    document_name: str
    page_number: int
    relevance_score: float
    excerpt: str
    # Resolve a cited passage back to its bnp_chunks row. Without these, an
    # audit entry records only "file X, page N" — and filenames are not unique,
    # so the exact text behind a recommendation could not be recovered.
    chunk_id: Optional[str] = None
    document_id: Optional[str] = None


class RegimenSection(BaseModel):
    """
    One labelled field of a reference regimen.

    `tools/convert_jsh_workbooks.py` assembles a drug's regimen as
    `Label: value | Label: value` from the hospital's workbook columns, which for
    vancomycin runs to 6,162 characters across 11 fields. Flattening that into a
    single string and captioning it "Safe range" is what produced a wall of text
    in the nurse's dose panel. Sending it back apart lets a client show the
    bedside fields and keep the reference ones one click away.

    `primary` marks the fields a nurse needs while preparing a dose. It is never
    a licence to drop the rest: everything the source said still travels.
    """

    label: str
    text: str
    primary: bool


class DrugDoseResult(BaseModel):
    drug_name: str
    patient_weight_kg: Optional[float]
    calculated_dose: Optional[str]
    safe_range: str
    overdose_threshold: Optional[str]
    warnings: List[str]
    # Empty whenever `safe_range` is a computed range or a coverage notice —
    # only a quoted reference regimen has fields to split.
    regimen_sections: List[RegimenSection] = []


class SafetyCheckResult(BaseModel):
    is_safe: bool
    rejection_reason: Optional[str]
    has_citations: bool
    confidence: float


class ContextValidationResult(BaseModel):
    is_valid: bool
    confidence_label: str
    issues: List[str] = []
    message: Optional[str] = None
    source_count: int = 0
    has_conflict: bool = False


class QueryResponse(BaseModel):
    session_id: str
    query_type: QueryType
    answer: str
    dose: Optional[str] = None
    # The same content as `dose`, kept apart. `dose` stays the flat string every
    # existing client reads; a client that understands sections renders these.
    dose_sections: Optional[List[RegimenSection]] = None
    # The one line saying why no number was computed. Sent only alongside
    # `dose_sections`, because a client rendering the sections is not rendering
    # the flat `dose` string that otherwise carries it.
    dose_notice: Optional[str] = None
    # What the question asked for. Advisory to a client: it changes which fields
    # are populated, never whether the safety layer ran.
    intent: Optional[ClinicalIntent] = None
    # Patient values the approved calculation needs and did not have. Non-empty
    # means no dose was computed and none was guessed — the answer asks for
    # these instead. Named for the QueryRequest fields that supply them.
    missing_variables: List[str] = []
    indication: Optional[str] = None
    safety_warning: Optional[str] = None
    safety_alert: bool = False
    confidence_label: str = "Low"
    citations: List[Citation]
    confidence: float
    rejected: bool = False
    rejection_reason: Optional[str] = None
    processing_time_ms: int
    contraindications: List[str] = []
    interactions: List[str] = []
    nursing_notes: List[str] = []
    safety_alerts: List[str] = []
    context_validation: Optional[str] = None


class AuditLogEntry(BaseModel):
    id: int
    session_id: str
    user_id: int
    username: str
    query: str
    query_type: str
    confidence: float
    rejected: bool
    timestamp: datetime

    class Config:
        from_attributes = True
