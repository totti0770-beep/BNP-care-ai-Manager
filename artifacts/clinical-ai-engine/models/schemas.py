from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class QueryType(str, Enum):
    DRUG = "drug"
    PROTOCOL = "protocol"
    GENERAL = "general"


class UserRegister(BaseModel):
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    full_name: str
    role: str = "user"


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
    question: str = Field(..., min_length=3)
    patient_weight_kg: Optional[float] = None
    top_k: int = Field(default=5, ge=1, le=20)
    drug_name: Optional[str] = None
    other_drugs: Optional[List[str]] = []
    conditions: Optional[List[str]] = []
    age: Optional[int] = None


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
