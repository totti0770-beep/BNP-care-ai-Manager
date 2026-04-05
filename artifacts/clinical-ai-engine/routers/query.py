"""
Main Clinical Query Router
Pipeline:
  1. Auth check
  2. Clinical classification (drug / protocol / general)
  3. Hybrid search (semantic + keyword)
  4. SafetyEngine: contraindications, interactions, high-risk, overdose hard block
  5. Drug dose calculation
  6. Safety layer validation
  7. GPT response generation (with BNP system prompt)
  8. Audit log
"""
import time
import uuid
import logging
from fastapi import APIRouter, Depends
from models.schemas import QueryRequest, QueryResponse, QueryType, Citation
from models.database import db_cursor
from services.clinical_router import classify_query
from services.drug_calculator import calculate_dose, extract_weight, SafetyEngine, DRUG_DB
from services.safety_layer import check_safety, is_high_risk
from services.embeddings import get_retriever
from services.response_generator import generate_response, parse_bnp_sections
from routers.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=QueryResponse)
def query(
    body: QueryRequest,
    current_user: dict = Depends(get_current_user),
):
    start_ms = int(time.time() * 1000)
    session_id = f"bnp-{uuid.uuid4().hex[:12]}"
    user_id = int(current_user["sub"])

    question = body.question.strip()

    # ── Step 1: Clinical classification ──────────────────────────────────────
    query_type = classify_query(question)
    logger.info(f"[{session_id}] Query type: {query_type} | Q: {question[:80]}")

    # ── Step 2: Hybrid retrieval ──────────────────────────────────────────────
    retriever = get_retriever()
    chunks = retriever.hybrid_search(question, top_k=body.top_k)

    citations = [
        Citation(
            document_name=c["document_name"],
            page_number=c["page_number"],
            relevance_score=c["relevance_score"],
            excerpt=c["content"][:200] + ("…" if len(c["content"]) > 200 else ""),
        )
        for c in chunks
    ]

    top_confidence = chunks[0]["relevance_score"] if chunks else 0.0

    # ── Step 3: Safety check (pre-generation) ────────────────────────────────
    safety = check_safety("", citations, top_confidence, question)

    if not safety.is_safe:
        _log_query(user_id, current_user["username"], session_id, question,
                   query_type, top_confidence, rejected=True)
        elapsed = int(time.time() * 1000) - start_ms
        return QueryResponse(
            session_id=session_id,
            query_type=query_type,
            answer="Not found in provided medical sources.",
            citations=[],
            confidence=top_confidence,
            rejected=True,
            rejection_reason=safety.rejection_reason,
            safety_alert=False,
            processing_time_ms=elapsed,
        )

    # ── Step 4: SafetyEngine (contraindications, interactions, high-risk) ─────
    safety_alerts: list = []
    contraindications: list = []
    interactions: list = []
    nursing_notes: list = []
    dose_str = None
    safety_warning = None
    hard_blocked = False

    if query_type == QueryType.DRUG:
        # Resolve drug name: explicit field > extract from question
        drug_name_raw = (body.drug_name or "").strip().lower()
        if not drug_name_raw:
            # Try to find drug name from question text
            for dn in DRUG_DB:
                if dn in question.lower():
                    drug_name_raw = dn
                    break
                for alias in DRUG_DB[dn].get("aliases", []):
                    if alias in question.lower():
                        drug_name_raw = dn
                        break

        weight = body.patient_weight_kg or extract_weight(question)

        if drug_name_raw and drug_name_raw in DRUG_DB:
            # High-risk flag
            safety_alerts += SafetyEngine.high_risk_flag(drug_name_raw)

            # Contraindications check
            if body.conditions:
                c_alerts = SafetyEngine.check_contraindications(drug_name_raw, body.conditions)
                safety_alerts += c_alerts
                contraindications = SafetyEngine.get_contraindications_list(drug_name_raw)

            # Drug-drug interactions check
            if body.other_drugs:
                i_alerts = SafetyEngine.check_interactions(drug_name_raw, body.other_drugs)
                safety_alerts += i_alerts
                interactions = SafetyEngine.get_interactions_list(drug_name_raw)

            # Overdose check (HARD BLOCK)
            if weight:
                _, overdose_alerts = SafetyEngine.calculate_dose_kg(drug_name_raw, weight)
                if overdose_alerts:
                    safety_alerts += overdose_alerts
                    hard_blocked = True

            # Nursing notes
            has_interactions = len([a for a in safety_alerts if "Interaction" in a]) > 0
            nursing_notes = SafetyEngine.get_nursing_notes(drug_name_raw, has_interactions)

        # Standard dose calculation (more detailed than SafetyEngine.calculate_dose_kg)
        drug_result = calculate_dose(question, weight)
        if drug_result:
            dose_parts = []
            if drug_result.calculated_dose:
                dose_parts.append(drug_result.calculated_dose)
            dose_parts.append(f"Safe range: {drug_result.safe_range}")
            if drug_result.overdose_threshold:
                dose_parts.append(f"Overdose threshold: {drug_result.overdose_threshold}")
            dose_str = "\n".join(dose_parts)

            if drug_result.warnings:
                safety_warning = "\n".join(f"• {w}" for w in drug_result.warnings)

    # ── Step 5: GPT response generation ──────────────────────────────────────
    if hard_blocked:
        answer = "❌ Unsafe dosage detected. Administration blocked. Calculated dose exceeds maximum safe limit — contact the prescribing physician immediately."
        logger.warning(f"[{session_id}] HARD BLOCK: Overdose detected for query: {question[:80]}")
    else:
        raw_response = generate_response(question, chunks, query_type, citations)
        sections = parse_bnp_sections(raw_response)
        answer = sections["answer"]
        if not dose_str:
            dose_str = sections.get("dose")
        if not safety_warning:
            safety_warning = sections.get("safety_warning")

    # ── Step 6: Safety alert detection ───────────────────────────────────────
    safety_alert = hard_blocked or bool(safety_alerts) or is_high_risk(question, answer)

    # ── Step 7: Audit log ─────────────────────────────────────────────────────
    _log_query(user_id, current_user["username"], session_id, question,
               query_type, top_confidence, rejected=hard_blocked)

    elapsed = int(time.time() * 1000) - start_ms
    logger.info(
        f"[{session_id}] Done in {elapsed}ms | confidence={top_confidence:.3f} "
        f"| safety_alerts={len(safety_alerts)} | hard_block={hard_blocked}"
    )

    return QueryResponse(
        session_id=session_id,
        query_type=query_type,
        answer=answer,
        dose=dose_str,
        safety_warning=safety_warning,
        safety_alert=safety_alert,
        citations=citations,
        confidence=top_confidence,
        rejected=hard_blocked,
        rejection_reason="Overdose detected — dose exceeds maximum safe limit" if hard_blocked else None,
        processing_time_ms=elapsed,
        contraindications=contraindications,
        interactions=interactions,
        nursing_notes=nursing_notes,
        safety_alerts=safety_alerts,
    )


def _log_query(user_id, username, session_id, query, query_type, confidence, rejected):
    try:
        with db_cursor() as (cur, _):
            cur.execute(
                """
                INSERT INTO bnp_audit_log
                  (session_id, user_id, username, query, query_type, confidence, rejected)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (session_id, user_id, username, query, query_type.value,
                 confidence, rejected),
            )
    except Exception as e:
        logger.error(f"Audit log error: {e}")
