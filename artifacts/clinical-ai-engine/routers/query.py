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
from models.schemas import (
    Citation,
    ClinicalIntent,
    QueryRequest,
    QueryResponse,
    QueryType,
)
from models.database import db_cursor
from services.clinical_router import classify_query
from services.clinical_intent import (
    classify_intent,
    monitoring_note,
    required_variables,
    retrieval_keywords,
    sections_for_intent,
)
from services.drug_calculator import (
    calculate_dose,
    extract_weight,
    extract_age,
    SafetyEngine,
)
from services.formulary import get_formulary
from models.formulary import CoverageStatus
from services.safety_layer import (
    check_answer,
    check_dose_is_grounded,
    check_retrieval,
    is_high_risk,
)
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

    # ── Step 1c: Clinical intent ─────────────────────────────────────────────
    # Orthogonal to query_type: DRUG still decides whether the safety layer
    # runs, intent decides which part of the drug's record answers the question.
    intent = classify_intent(question)
    logger.info(f"[{session_id}] Clinical intent: {intent.value}")

    # ── Step 1b: Translate Arabic query for FAISS/BM25 search ────────────────
    # Documents are in English — Arabic embeddings won't match English content.
    # We translate drug names and clinical terms to English for retrieval only;
    # the ORIGINAL question is preserved for GPT-4o (so the response is in Arabic).
    search_query = translate_for_search(question)
    if search_query != question:
        logger.info(f"[{session_id}] Arabic query translated for retrieval")

    # Bias retrieval toward the part of the corpus this intent needs. The index
    # carries no section labels, so this is keyword weighting of the query
    # string for BM25 — the same lever translate_for_search already uses. It is
    # not metadata filtering and must not be described as such.
    intent_terms = retrieval_keywords(intent)
    if intent_terms:
        search_query = f"{search_query} {' '.join(intent_terms)}".strip()

    # ── Step 2: Hybrid retrieval ──────────────────────────────────────────────
    retriever = get_retriever()
    try:
        # A wider FAISS pool than we keep, so the keyword bias has something to
        # act on. `top_confidence` below is still the best score in the result,
        # so this cannot push a query past a safety gate it would have failed.
        chunks = retriever.hybrid_search(
            search_query,
            top_k=body.top_k,
            candidate_k=min(body.top_k * 3, 20) if intent_terms else None,
        )
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
            intent=intent,
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
            intent=intent,
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
    dose_sections = None
    dose_notice = None
    missing_variables: List[str] = []
    approved_dose = None
    coverage_note = None
    drug_result = None
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

        # The model has never seen the formulary, so it cannot know that a drug
        # is unapproved and has, until now, been free to answer as though it
        # were. One line of English, for the prompt only.
        coverage_note = {
            CoverageStatus.NOT_IN_FORMULARY: (
                "This drug is not in the hospital formulary. No dose, "
                "contraindication or interaction check was performed."
            ),
            CoverageStatus.PENDING_REVIEW: (
                "This drug's formulary entry is pending pharmacist review. "
                "No dose has been approved."
            ),
            CoverageStatus.REJECTED: (
                "This drug's formulary entry was reviewed and rejected by a "
                "pharmacist. No dose has been approved."
            ),
        }.get(coverage)

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

        # What this question needs and does not have. Resolved against the entry,
        # so a value that would change nothing is never demanded.
        missing_variables = required_variables(
            intent, entry, weight=weight, age=age
        )

        drug_result = calculate_dose(entry, question, weight, age)
        if drug_result:
            approved_dose = drug_result.calculated_dose

            if missing_variables:
                # Asked for a calculation without the values it needs. Refusing
                # to guess is the point: the previous behaviour took the adult
                # branch silently, and warned only when a weight happened to be
                # present. No figure, and no regimen dump either — the nurse
                # asked for a number, not for the record.
                dose_str = None
                dose_sections = None
                dose_notice = _msg(
                    "لحساب الجرعة بدقة، النظام يحتاج القيم التالية:",
                    "To calculate this dose from approved data, the system needs:",
                    question,
                )
                approved_dose = None
            else:
                # Narrow the regimen to the fields this question asked about.
                # Done here rather than in calculate_dose so the calculator keeps
                # returning the whole record — nothing is lost, and the intent
                # only decides what travels for this one answer.
                dose_sections = _sections_for(drug_result.regimen_sections, intent)

                dose_parts = []
                if drug_result.calculated_dose:
                    dose_parts.append(drug_result.calculated_dose)

                # `safe_range` carries three different things depending on the
                # path, and this caption used to claim all three were a range.
                # The worst case was a 6 KB quoted monograph announced as
                # "Safe range" — and putting the same 6 KB here while the
                # sections were narrowed would only move the wall, not remove it.
                if drug_result.calculated_dose is None:
                    # A coverage notice, which explains itself.
                    dose_parts.append(drug_result.safe_range)
                elif drug_result.regimen_sections:
                    # The regimen travels as the narrowed sections. `dose` gets
                    # the same narrowing rendered flat, because the mobile client
                    # reads only this field and would otherwise see nothing.
                    if dose_sections:
                        dose_parts.append(
                            "\n".join(
                                f"{s.label}: {s.text}" if s.label else s.text
                                for s in dose_sections
                            )
                        )
                else:
                    dose_parts.append(f"Safe range: {drug_result.safe_range}")

                if drug_result.overdose_threshold:
                    dose_parts.append(
                        f"Overdose threshold: {drug_result.overdose_threshold}"
                    )
                dose_str = "\n".join(dose_parts) or None

                if dose_sections:
                    dose_notice = drug_result.calculated_dose

            if drug_result.warnings:
                safety_warning = _warnings_for(drug_result.warnings, intent, entry)

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
    elif missing_variables:
        # A calculation was asked for without the values it needs. The model is
        # not consulted: it has no formulary, so anything it produced here would
        # be the ungrounded figure this path exists to prevent.
        answer = _ask_for_variables(missing_variables, question)
        logger.info(
            f"[{session_id}] Dose calculation needs: {','.join(missing_variables)}"
        )
    else:
        raw_response = generate_response(
            question,
            chunks,
            query_type,
            citations,
            intent=intent,
            # Engine-first: the model is handed the approved figure rather than
            # asked to produce one. None here is an explicit prohibition in the
            # prompt, not an omission.
            approved_dose=approved_dose,
            coverage_note=coverage_note,
        )
        sections = parse_bnp_sections(raw_response)

        answer = sections["answer"]
        indication = sections.get("indication")

        # The model's own Dose section is a fallback for questions the engine
        # could not answer from the formulary — a drug it does not stock, or a
        # protocol question. It must never fill a dose the engine deliberately
        # withheld, which is what a missing-variables answer is.
        if not dose_str and not missing_variables:
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

        if answer_check.is_safe:
            # A dose figure in the prose must have come from the approved path.
            # check_answer looks for hedging words, not for numbers, so until
            # now nothing reconciled what `answer` said against what the
            # formulary allowed — the structured field was protected and the
            # sentence a nurse reads was not.
            answer_check = check_dose_is_grounded(
                answer,
                top_confidence,
                approved_dose=approved_dose,
                approved_text=_approved_text(drug_result, chunks),
                enforced=intent in _DOSE_INTENTS,
            )

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
            intent=intent,
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
        dose_sections=dose_sections,
        dose_notice=dose_notice,
        intent=intent,
        missing_variables=missing_variables,
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


# What to call each missing value when asking a nurse for it.
_VARIABLE_LABELS = {
    "patient_weight_kg": ("وزن المريض بالكيلوغرام", "the patient's weight in kilograms"),
    "age": ("عمر المريض", "the patient's age"),
}


def _ask_for_variables(missing, question: str) -> str:
    """
    The answer when a calculation was asked for without the values it needs.

    Written here rather than left to the model. A request for missing data is
    the one answer that must never be improvised: the model has no formulary,
    and an invented figure is exactly what this path exists to prevent.
    """
    arabic = _is_arabic(question)
    bullets = "\n".join(
        f"• {_VARIABLE_LABELS.get(v, (v, v))[0 if arabic else 1]}" for v in missing
    )
    if arabic:
        return (
            "لحساب الجرعة من البيانات المعتمدة، النظام يحتاج:\n"
            f"{bullets}\n\n"
            "لم تُحسب أي جرعة ولم يُقدَّر أي رقم. زوّد القيم أعلاه وأعد السؤال."
        )
    return (
        "To calculate this dose from approved data, the system needs:\n"
        f"{bullets}\n\n"
        "No dose has been calculated and no figure has been estimated. "
        "Supply the values above and ask again."
    )


# Where a number in the prose is a dose instruction rather than a product
# property. A preparation volume or an infusion concentration is neither, and
# enforcing the gate there would manufacture refusals on correct answers.
_DOSE_INTENTS = frozenset({
    ClinicalIntent.DOSE,
    ClinicalIntent.DOSE_CALCULATION,
    ClinicalIntent.PEDIATRIC_DOSING,
})


def _approved_text(drug_result, chunks) -> str:
    """
    Every figure the approved sources actually state, for grounding an answer.

    Two sources count, and the distinction is the whole rule. The formulary row
    is the pharmacist-signed record. The retrieved chunks are the hospital's own
    indexed documents — quoting a range from the manual the nurse would
    otherwise walk to the shelf for is the intended behaviour.

    What is *not* here is any figure the model produced by doing arithmetic on
    that text, which is what the brief forbids and what this catches: a number
    present in neither the formulary nor any retrieved passage was computed, and
    the model has no formulary to compute from.
    """
    parts = []
    if drug_result is not None:
        parts.append(drug_result.safe_range or "")
        parts += [s.text for s in (drug_result.regimen_sections or [])]
        parts += list(drug_result.warnings or [])
        if drug_result.overdose_threshold:
            parts.append(drug_result.overdose_threshold)
    parts += [c.get("content", "") for c in (chunks or [])]
    return "\n".join(parts)


def _sections_for(sections, intent):
    """
    The regimen fields this intent asked about.

    `None` means "all of them" (FULL_DRUG_INFO); an empty selection means the
    answer lives elsewhere in the record and a regimen dump would bury it. A
    selection that matches nothing falls back to everything rather than showing
    an empty panel — a nurse who asked about preparation and gets silence
    learns nothing, while getting the whole record is merely verbose.
    """
    if not sections:
        return None

    wanted = sections_for_intent(intent)
    if wanted is None:
        return list(sections)
    if not wanted:
        return None

    chosen = [s for s in sections if s.label in wanted]
    return chosen or list(sections)


def _warnings_for(warnings, intent, entry):
    """
    The safety text this intent needs, as a bullet list.

    The workbook converter puts six labelled fields into the `warnings` column
    — cautions, adverse reactions, monitoring, pregnancy, lactation, storage —
    and the importer splits them on "|", so each arrives as its own
    "Label: value" string. Handing all six to every question made a second wall
    of text beside the dose one.

    Cautions and adverse reactions always travel: they are the warning, and an
    intent is not a reason to drop one.
    """
    always = ("Cautions and warnings", "Adverse drug reactions")
    if intent is ClinicalIntent.FULL_DRUG_INFO:
        kept = list(warnings)
    elif intent is ClinicalIntent.MONITORING:
        note = monitoring_note(entry)
        kept = [w for w in warnings if w.startswith(always)]
        if note:
            kept.insert(0, f"Monitoring: {note}")
    else:
        kept = [
            w
            for w in warnings
            # An unlabelled warning is a coverage notice or a seeded string, and
            # those are the ones that explain a missing dose. Never dropped.
            if w.startswith(always) or ": " not in w.split(" | ")[0][:40]
        ]
        if not kept:
            kept = list(warnings)

    return "\n".join(f"• {w}" for w in kept) if kept else None


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
