"""
Context Validation Layer — validates retrieved chunks before GPT generation.

Checks:
  1. Source reliability  — minimum relevance score threshold
  2. Data completeness   — sufficient content to answer the question
  3. Source conflicts    — contradictory values across documents
  4. Source diversity    — multi-document reasoning readiness

Returns a ContextValidationResult with is_valid, issues, confidence_label,
and a human-readable message displayed in the UI.
"""
import re
import logging
from typing import List
from models.schemas import ContextValidationResult

logger = logging.getLogger(__name__)

CONFIDENCE_HIGH = 0.65
CONFIDENCE_MEDIUM = 0.40
MIN_CONTENT_TOKENS = 30

_DOSE_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*(?:mg|mcg|g|units?|IU)\s*(?:/\s*(?:kg|dose|day|hour))?",
    re.IGNORECASE,
)


def _label_confidence(score: float) -> str:
    if score >= CONFIDENCE_HIGH:
        return "High"
    if score >= CONFIDENCE_MEDIUM:
        return "Medium"
    return "Low"


def _detect_conflict(chunks: List[dict]) -> bool:
    """
    Lightweight conflict detector: flag if two chunks from DIFFERENT documents
    mention materially different dose numbers for the same query.
    """
    if len(chunks) < 2:
        return False

    per_source: dict[str, list] = {}
    for c in chunks:
        src = c.get("document_name", "")
        doses = _DOSE_PATTERN.findall(c.get("content", ""))
        if doses:
            per_source.setdefault(src, []).extend([float(d[0]) for d in doses])

    sources = list(per_source.values())
    if len(sources) < 2:
        return False

    for i in range(len(sources)):
        for j in range(i + 1, len(sources)):
            for a in sources[i]:
                for b in sources[j]:
                    if a > 0 and abs(a - b) / max(a, b) > 0.5:
                        return True
    return False


def validate_context(
    chunks: List[dict],
    question: str,
    top_confidence: float,
) -> ContextValidationResult:
    """
    Validate the retrieved context before sending to GPT.
    Returns a ContextValidationResult.
    """
    issues: List[str] = []
    label = _label_confidence(top_confidence)

    # ── Check 1: No sources retrieved ────────────────────────────────────────
    if not chunks:
        return ContextValidationResult(
            is_valid=False,
            confidence_label="Low",
            issues=["No relevant sources found in the knowledge base."],
            message="Insufficient clinical data — no matching sources found. "
                    "Please upload the relevant clinical document.",
            source_count=0,
            has_conflict=False,
        )

    # ── Check 2: Confidence too low ───────────────────────────────────────────
    if top_confidence < CONFIDENCE_MEDIUM:
        issues.append(
            f"Source relevance is very low ({top_confidence:.0%}) — "
            "the retrieved context may not address this question."
        )

    # ── Check 3: Content too short / incomplete ───────────────────────────────
    total_tokens = sum(len(c.get("content", "").split()) for c in chunks)
    if total_tokens < MIN_CONTENT_TOKENS:
        issues.append(
            f"Retrieved content is insufficient ({total_tokens} words) "
            "to generate a reliable clinical answer."
        )

    # ── Check 4: Source conflict detection ────────────────────────────────────
    has_conflict = _detect_conflict(chunks)
    if has_conflict:
        issues.append(
            "Conflicting dosage values detected across source documents. "
            "Verify with the prescribing physician."
        )

    # ── Determine validity ────────────────────────────────────────────────────
    is_valid = top_confidence >= CONFIDENCE_MEDIUM or (
        top_confidence >= 0.20 and total_tokens >= MIN_CONTENT_TOKENS
    )

    if not is_valid:
        msg = (
            "Insufficient clinical data — the knowledge base does not contain "
            "reliable information to answer this question. "
            "Please upload the relevant clinical protocol or pharmacology document."
        )
    elif has_conflict:
        msg = "⚠️ Conflicting values detected across sources. Answer provided with caution — verify independently."
    elif issues:
        msg = f"⚠️ Low confidence ({label}): {issues[0]}"
    else:
        msg = None

    logger.info(
        f"Context validation: valid={is_valid} label={label} "
        f"sources={len(chunks)} conflict={has_conflict} issues={len(issues)}"
    )

    return ContextValidationResult(
        is_valid=is_valid,
        confidence_label=label,
        issues=issues,
        message=msg,
        source_count=len(chunks),
        has_conflict=has_conflict,
    )
