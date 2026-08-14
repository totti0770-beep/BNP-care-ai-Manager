from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class QueryType(str, Enum):
    DRUG = "drug"
    PROTOCOL = "protocol"
    GENERAL = "general"


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


class DrugDoseResult(BaseModel):
    drug_name: str
    patient_weight_kg: Optional[float]
    calculated_dose: Optional[str]
    safe_range: str
    overdose_threshold: Optional[str]
    warnings: List[str]


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
