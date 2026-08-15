"""
Main Clinical Query Router
Pipeline:
  1. Auth check
  2. Clinical classification (drug / protocol / general)
  3. Hybrid search (semantic + keyword)
  4. Context Validation Layer — reliability, completeness, conflict detection
  5. SafetyEngine: contraindications, interactions, high-risk, overdose hard block
  6. Drug dose calculation
  7. Safety layer validation
  8. GPT-4o response generation (6-section structured output)
  9. Confidence scoring (High / Medium / Low)
 10. Audit log
"""
import time
import uuid
import json
import hashlib
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from models.schemas import QueryRequest, QueryResponse, QueryType, Citation
from models.database import db_cursor
from services.clinical_router import classify_query
from services.drug_calculator import (
    calculate_dose,
    extract_weight,
    extract_age,
    SafetyEngine,
)
from services.formulary import get_formulary
from models.formulary import CoverageStatus
from services.safety_layer import check_retrieval, check_answer, is_high_risk
from services.embeddings import get_retriever, EmbeddingsUnavailable
from services.metrics import metrics
from services.context_validator import validate_context
from services.response_generator import (
    generate_response,
    parse_bnp_sections,
    parse_nursing_notes_list,
    parse_contraindications_list,
)
from routers.auth import get_current_user
from services.arabic_translator import translate_for_search

logger = logging.getLogger(__name__)
router = APIRouter()

ENGINE_VERSION = "1.0.0"
RESPONSE_MODEL = "gpt-4o"

# Anchors the first row so an attacker cannot truncate the log to nothing and
# start a fresh, internally consistent chain.
GENESIS_HASH = "bnp-audit-genesis"


def canonical_json(value) -> str:
    """
    Stable serialisation for hashing.

    Citations are stored in a JSONB column, which preserves neither key order
    nor whitespace, so re-serialising a row read back from the database would
    not reproduce the string that was hashed on write. Both sides canonicalise
    instead.
    """
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return value
    return json.dumps(value or [], sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_chain_hash(
    *,
    prev_hash: str,
    session_id: str,
    username: str,
    query: str,
    answer: str,
    rejected: bool,
    citations,
) -> str:
    """
    sha256 over the previous chain hash and this row's clinically meaningful
    content. Editing any covered field, or removing a row, breaks every hash
    after it — which is what makes tampering detectable rather than merely
    discouraged.
    """
    payload = "\x1f".join([
        prev_hash,
        session_id,
        username or "",
        query,
        answer or "",
        "1" if rejected else "0",
        canonical_json(citations),
    ])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

import re as _re
_ARABIC_RE = _re.compile(r'[\u0600-\u06FF]')

def _is_arabic(text: str) -> bool:
    """Return True if the text contains Arabic characters."""
    return bool(_ARABIC_RE.search(text))

def _msg(arabic: str, english: str, question: str) -> str:
    return arabic if _is_arabic(question) else english


@router.post("/", response_model=QueryResponse)
def query(
    body: QueryRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    start_ms = int(time.time() * 1000)
    session_id = f"bnp-{uuid.uuid4().hex[:12]}"
    user_id = int(current_user["sub"])

    metrics.incr("bnp_queries_total")
    question = body.question.strip()
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else None)
    )
    user_agent = request.headers.get("user-agent")

    # The formulary decides what may be said about any medication, so a request
    # cannot be served without it. Reporting every drug as "not covered" while
    # the table is unreachable would be a false clinical statement, and one that
    # reads as reassurance.
    formulary = get_formulary()
    if not formulary.is_available:
        logger.error(f"[{session_id}] Formulary unavailable: {formulary.degraded_reason}")
        metrics.incr("bnp_formulary_unavailable_total")
        metrics.incr("bnp_queries_refused_total")
        raise HTTPException(
            status_code=503,
            detail=(
                "The medication formulary is unavailable. No clinical guidance "
                "can be provided until it is restored."
            ),
        )

    # ── Step 1: Clinical classification ──────────────────────────────────────
    query_type = classify_query(question)
    # The question itself is not logged: it may contain patient identifiers.
    # It is recorded in the audit table, which is access-controlled.
    logger.info(f"[{session_id}] Query type: {query_type} | chars={len(question)}")

    # ── Step 1b: Translate Arabic query for FAISS/BM25 search ────────────────
    # Documents are in English — Arabic embeddings won't match English content.
    # We translate drug names and clinical terms to English for retrieval only;
    # the ORIGINAL question is preserved for GPT-4o (so the response is in Arabic).
    search_query = translate_for_search(question)
    if search_query != question:
        logger.info(f"[{session_id}] Arabic query translated for retrieval")

    # ── Step 2: Hybrid retrieval ──────────────────────────────────────────────
    retriever = get_retriever()
    try:
        chunks = retriever.hybrid_search(search_query, top_k=body.top_k)
    except EmbeddingsUnavailable as e:
        # Fail closed: without working retrieval there is no grounded answer to
        # give, and a plausible ungrounded one is the dangerous outcome.
        logger.error(f"[{session_id}] Retrieval unavailable: {e}")
        metrics.incr("bnp_retrieval_unavailable_total")
        metrics.incr("bnp_queries_refused_total")
        raise HTTPException(
            status_code=503,
            detail=(
                "The clinical knowledge base is unavailable. "
                "No clinical guidance can be provided until it is restored."
            ),
        )

    citations = [
        Citation(
            document_name=c["document_name"],
            page_number=c["page_number"],
            relevance_score=c["relevance_score"],
            excerpt=c["content"][:200] + ("…" if len(c["content"]) > 200 else ""),
            chunk_id=c.get("chunk_id"),
            document_id=c.get("document_id"),
        )
        for c in chunks
    ]

    top_confidence = chunks[0]["relevance_score"] if chunks else 0.0

    def audit(
        *,
        answer: str = "",
        dose: Optional[str] = None,
        rejected: bool = False,
        rejection_reason: Optional[str] = None,
        alerts: Optional[List[str]] = None,
        label: Optional[str] = None,
    ) -> None:
        """
        Record this exchange, or refuse to answer.

        The audit write used to be best-effort: a failure was logged and the
        clinical advice returned anyway, leaving no record that it was ever
        given. In a regulated setting that is the wrong trade — an unrecorded
        recommendation is worse than no recommendation.
        """
        try:
            _log_query(
                user_id, current_user["username"], session_id, question,
                query_type, top_confidence, rejected,
                answer=answer, dose=dose, citations=citations,
                safety_alerts=alerts, confidence_label=label,
                rejection_reason=rejection_reason,
                client_ip=client_ip, user_agent=user_agent,
            )
        except Exception as e:
            logger.error(f"[{session_id}] AUDIT WRITE FAILED: {e}")
            metrics.incr("bnp_audit_write_failures_total")
            metrics.incr("bnp_queries_refused_total")
            raise HTTPException(
                status_code=503,
                detail=(
                    "The clinical audit trail could not be recorded, so this "
                    "request was refused. Contact your system administrator."
                ),
            )

    # ── Step 3: Context Validation Layer ─────────────────────────────────────
    ctx_validation = validate_context(chunks, question, top_confidence)
    confidence_label = ctx_validation.confidence_label
    context_validation_msg = ctx_validation.message

    logger.info(
        f"[{session_id}] Context validation: valid={ctx_validation.is_valid} "
        f"label={confidence_label} sources={ctx_validation.source_count} "
        f"conflict={ctx_validation.has_conflict}"
    )

    if not ctx_validation.is_valid:
        insufficient_msg = _msg(
            "لم يُعثر على معلومات كافية في قاعدة المعرفة للإجابة على هذا السؤال. "
            "يرجى رفع البروتوكول السريري أو الوثيقة الدوائية المناسبة.",
            "Insufficient clinical data — the knowledge base does not contain "
            "reliable information to answer this question. "
            "Please upload the relevant clinical protocol or pharmacology document.",
            question,
        )
        # This is a refusal: no answer, no citations. It previously recorded
        # rejected=False, so a query for refused requests — the thing an
        # auditor actually looks for — would not have found it.
        audit(answer=insufficient_msg, rejected=True, label="Low",
              rejection_reason=context_validation_msg or "Insufficient clinical data")
        elapsed = int(time.time() * 1000) - start_ms
        return QueryResponse(
            session_id=session_id,
            query_type=query_type,
            answer=_msg(
                "لم يُعثر على معلومات كافية في قاعدة المعرفة للإجابة على هذا السؤال. "
                "يرجى رفع البروتوكول السريري أو الوثيقة الدوائية المناسبة.",
                "Insufficient clinical data — the knowledge base does not contain "
                "reliable information to answer this question. "
                "Please upload the relevant clinical protocol or pharmacology document.",
                question,
            ),
            citations=[],
            confidence=top_confidence,
            confidence_label="Low",
            rejected=True,
            rejection_reason=context_validation_msg or "Insufficient clinical data",
            context_validation=context_validation_msg,
            processing_time_ms=elapsed,
        )

    # ── Step 4: Safety check (retrieval-only; the answer is re-checked at
    # step 6b, once it exists) ───────────────────────────────────────────────
    safety = check_retrieval(citations, top_confidence)

    if not safety.is_safe:
        audit(
            answer=_msg(
                "لم يُعثر على المعلومات في المصادر الطبية المتاحة.",
                "Not found in provided medical sources.",
                question,
            ),
            rejected=True,
            rejection_reason=safety.rejection_reason,
            label=confidence_label,
        )
        elapsed = int(time.time() * 1000) - start_ms
        return QueryResponse(
            session_id=session_id,
            query_type=query_type,
            answer=_msg(
                "لم يُعثر على المعلومات في المصادر الطبية المتاحة.",
                "Not found in provided medical sources.",
                question,
            ),
            citations=[],
            confidence=top_confidence,
            confidence_label=confidence_label,
            rejected=True,
            rejection_reason=_msg(
                "لم يُعثر على مصادر طبية كافية للإجابة على هذا الاستعلام.",
                safety.rejection_reason or "Not found in provided medical sources.",
                question,
            ),
            safety_alert=False,
            processing_time_ms=elapsed,
        )

    # ── Step 5: SafetyEngine (contraindications, interactions, high-risk) ─────
    safety_alerts: list = []
    contraindications: list = []
    interactions: list = []
    nursing_notes: list = []
    dose_str = None
    safety_warning = None
    indication = None
    hard_blocked = False

    if query_type == QueryType.DRUG:
        drug_name_raw = (body.drug_name or "").strip().lower()
        entry = None
        if drug_name_raw:
            entry = formulary.get(drug_name_raw)
        else:
            # The formulary matches its own Arabic names and aliases, so a drug
            # imported tomorrow is findable in both languages without a code
            # change. The original question is searched too, because the
            # translator only knows the drug names that were hardcoded into it.
            entry = formulary.find_in_text(search_query) or formulary.find_in_text(
                question
            )
            if entry:
                drug_name_raw = entry.generic_name

        weight = body.patient_weight_kg or extract_weight(question)
        age = body.age if body.age is not None else extract_age(question)

        coverage = entry.coverage if entry else CoverageStatus.NOT_IN_FORMULARY

        # State the coverage boundary explicitly. An empty contraindication list
        # reads as "none known", which is the opposite of the truth, and a
        # figure nobody signed off reads as a hospital-approved dose.
        # Localised, because these are the sentences that explain to a nurse why
        # no number is shown. An Arabic-only reader who cannot read the reason
        # is left with a blank dose field and no explanation for it.
        drug_label = drug_name_raw.title()
        if drug_name_raw and coverage is CoverageStatus.NOT_IN_FORMULARY:
            safety_alerts.append(_msg(
                f"⚠️ {drug_label} غير مدرج في دستور الأدوية — لم تُجرَ أي فحوص "
                "لموانع الاستعمال أو التداخلات أو الجرعة. تحقّق من دستور المنشأة.",
                f"⚠️ {drug_label} is not in the medication formulary — no "
                "contraindication, interaction, or dose checks were performed. "
                "Verify against the formulary.",
                question,
            ))
        elif coverage is CoverageStatus.PENDING_REVIEW:
            safety_alerts.append(_msg(
                f"⚠️ {drug_label} مدرج في الدستور لكن بياناته قيد مراجعة الصيدلي "
                f"— لم تُحسب أي جرعة. المصدر المسجَّل: {entry.provenance}.",
                f"⚠️ {drug_label} is in the formulary but its entry is pending "
                "pharmacist review — no dose is calculated. "
                f"Source on file: {entry.provenance}.",
                question,
            ))
        elif coverage is CoverageStatus.REJECTED:
            safety_alerts.append(_msg(
                f"⛔ بيانات {drug_label} في الدستور روجعت ورُفضت من صيدلي — "
                "لم تُحسب أي جرعة. استخدم دستور أدوية المنشأة.",
                f"⛔ {drug_label}'s formulary entry was reviewed and rejected by "
                "a pharmacist — no dose is calculated. Use the hospital "
                "formulary.",
                question,
            ))

        if entry is not None:
            safety_alerts += SafetyEngine.high_risk_flag(entry)

            if body.conditions:
                c_alerts = SafetyEngine.check_contraindications(entry, body.conditions)
                safety_alerts += c_alerts
                contraindications = SafetyEngine.get_contraindications_list(entry)

            if body.other_drugs:
                i_alerts = SafetyEngine.check_interactions(entry, body.other_drugs)
                safety_alerts += i_alerts
                interactions = SafetyEngine.get_interactions_list(entry)

            # Only an approved entry can hard-block. Blocking on figures nobody
            # has signed off manufactures false alarms, and alarm fatigue is a
            # patient-safety hazard in its own right. Refusing to quote a number
            # is the fail-closed action here; refusing to let a nurse proceed on
            # unverified data is not.
            if weight:
                _, overdose_alerts = SafetyEngine.calculate_dose_kg(entry, weight)
                if overdose_alerts:
                    safety_alerts += overdose_alerts
                    hard_blocked = True
                    metrics.incr("bnp_overdose_blocks_total")

            has_interactions = len([a for a in safety_alerts if "Interaction" in a]) > 0
            nursing_notes = SafetyEngine.get_nursing_notes(entry, has_interactions)

        drug_result = calculate_dose(entry, question, weight, age)
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

    # ── Step 6: GPT-4o response generation ───────────────────────────────────
    if hard_blocked:
        answer = _msg(
            "❌ تم اكتشاف جرعة غير آمنة — تم إيقاف الصرف. "
            "الجرعة المحسوبة تتجاوز الحد الأقصى الآمن. تواصل فوراً مع الطبيب المعالج.",
            "❌ Unsafe dosage detected. Administration blocked. "
            "Calculated dose exceeds maximum safe limit — contact the prescribing physician immediately.",
            question,
        )
        logger.warning(f"[{session_id}] HARD BLOCK: Overdose detected for: {question[:80]}")
    else:
        raw_response = generate_response(question, chunks, query_type, citations)
        sections = parse_bnp_sections(raw_response)

        answer = sections["answer"]
        indication = sections.get("indication")

        if not dose_str:
            dose_str = sections.get("dose")
        if not safety_warning:
            safety_warning = sections.get("safety_warning")

        # Merge GPT contraindications/nursing notes with SafetyEngine (deduplicate)
        gpt_contras = parse_contraindications_list(sections.get("contraindications_text"))
        gpt_notes = parse_nursing_notes_list(sections.get("nursing_notes_text"))

        if gpt_contras and not contraindications:
            contraindications = gpt_contras
        if gpt_notes:
            existing = set(nursing_notes)
            nursing_notes = nursing_notes + [n for n in gpt_notes if n not in existing]

        # ── Step 6b: Validate the generated answer ───────────────────────────
        answer_check = check_answer(answer, top_confidence)
        if not answer_check.is_safe:
            logger.warning(f"[{session_id}] Answer rejected: {answer_check.rejection_reason}")
            audit(
                answer=answer,
                rejected=True,
                rejection_reason=answer_check.rejection_reason,
                alerts=safety_alerts,
                label=confidence_label,
            )
            elapsed = int(time.time() * 1000) - start_ms
            return QueryResponse(
                session_id=session_id,
                query_type=query_type,
                answer=_msg(
                    "تعذّر التحقق من الإجابة من المصادر الطبية المتاحة.",
                    "The generated answer could not be verified against the "
                    "indexed clinical sources.",
                    question,
                ),
                citations=citations,
                confidence=top_confidence,
                confidence_label=confidence_label,
                rejected=True,
                rejection_reason=answer_check.rejection_reason,
                safety_alert=True,
                processing_time_ms=elapsed,
            )

    # ── Step 7: Safety alert detection ───────────────────────────────────────
    safety_alert = hard_blocked or bool(safety_alerts) or is_high_risk(question, answer)

    # ── Step 8: Audit log ─────────────────────────────────────────────────────
    audit(
        answer=answer,
        dose=dose_str,
        rejected=hard_blocked,
        rejection_reason=(
            "Overdose detected — dose exceeds maximum safe limit"
            if hard_blocked else None
        ),
        alerts=safety_alerts,
        label=confidence_label,
    )

    elapsed = int(time.time() * 1000) - start_ms
    metrics.observe_latency(elapsed / 1000)
    metrics.incr("bnp_queries_refused_total" if hard_blocked else "bnp_queries_answered_total")
    if safety_alerts:
        metrics.incr("bnp_safety_alerts_total", len(safety_alerts))
    logger.info(
        f"[{session_id}] Done in {elapsed}ms | confidence={top_confidence:.3f} "
        f"({confidence_label}) | safety_alerts={len(safety_alerts)} "
        f"| hard_block={hard_blocked} | conflict={ctx_validation.has_conflict}"
    )

    return QueryResponse(
        session_id=session_id,
        query_type=query_type,
        answer=answer,
        dose=dose_str,
        indication=indication,
        safety_warning=safety_warning,
        safety_alert=safety_alert,
        confidence_label=confidence_label,
        citations=citations,
        confidence=top_confidence,
        rejected=hard_blocked,
        rejection_reason="Overdose detected — dose exceeds maximum safe limit" if hard_blocked else None,
        processing_time_ms=elapsed,
        contraindications=contraindications,
        interactions=interactions,
        nursing_notes=nursing_notes,
        safety_alerts=safety_alerts,
        context_validation=context_validation_msg,
    )


def _log_query(
    user_id,
    username,
    session_id,
    query,
    query_type,
    confidence,
    rejected,
    *,
    answer: str = "",
    dose: Optional[str] = None,
    citations: Optional[List[Citation]] = None,
    safety_alerts: Optional[List[str]] = None,
    confidence_label: Optional[str] = None,
    rejection_reason: Optional[str] = None,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
):
    """
    Record what the system was asked and what it answered.

    Raises on failure. An unaudited clinical recommendation is not an acceptable
    outcome — the caller turns this into a 503 rather than returning advice that
    leaves no trace. The answer hash lets a stored answer be shown to have not
    been altered after the fact.
    """
    answer_hash = hashlib.sha256(answer.encode("utf-8")).hexdigest() if answer else None
    citation_json = json.dumps(
        [
            {
                "document_name": c.document_name,
                "page_number": c.page_number,
                "relevance_score": c.relevance_score,
                # Recorded so an incident review can retrieve the exact passage
                # the recommendation was generated from.
                "chunk_id": c.chunk_id,
                "document_id": c.document_id,
            }
            for c in (citations or [])
        ]
    )

    alerts_json = json.dumps(safety_alerts or [])

    with db_cursor() as (cur, _):
        # Lock the tail of the chain so two concurrent writes cannot both build
        # on the same predecessor and fork it.
        cur.execute(
            "SELECT chain_hash FROM bnp_audit_log ORDER BY id DESC LIMIT 1 FOR UPDATE"
        )
        row = cur.fetchone()
        prev_hash = (row["chain_hash"] if row else None) or GENESIS_HASH

        chain_hash = compute_chain_hash(
            prev_hash=prev_hash,
            session_id=session_id,
            username=username,
            query=query,
            answer=answer,
            rejected=rejected,
            citations=citation_json,
        )

        cur.execute(
            """
            INSERT INTO bnp_audit_log
              (session_id, user_id, username, query, query_type, confidence,
               rejected, answer_text, answer_hash, dose_text, citations,
               safety_alerts, confidence_label, rejection_reason,
               client_ip, user_agent, model, drug_db_version, engine_version,
               prev_hash, chain_hash)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                session_id, user_id, username, query, query_type.value, confidence,
                rejected, answer or None, answer_hash, dose, citation_json,
                alerts_json, confidence_label, rejection_reason,
                client_ip, user_agent, RESPONSE_MODEL, get_formulary().version(),
                ENGINE_VERSION,
                prev_hash, chain_hash,
            ),
        )
