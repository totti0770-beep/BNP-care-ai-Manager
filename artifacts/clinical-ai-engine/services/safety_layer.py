"""
Safety Layer — enforces BNP rules:
  1. Reject if confidence below threshold
  2. Reject if no citations found
  3. Flag high-risk responses (overdose, emergency)
  4. Never allow hallucinated content
"""
import re
from typing import List
from models.schemas import SafetyCheckResult, Citation

CONFIDENCE_THRESHOLD = 0.30  # Minimum cosine similarity to accept

UNSAFE_PATTERNS = [
    r"i think|i believe|in my opinion|probably|maybe|perhaps",
    r"not sure|uncertain|might be|could be|might work",
]

HIGH_RISK_PATTERNS = [
    r"\b(overdose|toxic|letal|lethal|death|cardiac arrest|anaphylaxis|respiratory arrest)\b",
    r"\b(emergency|urgent|immediate|stat|code blue|rapid response)\b",
    r"\b(contraindicated|severe allergy|anaphylactic)\b",
    r"\b(جرعة زائدة|طوارئ|حرج|خطر|وفاة)\b",
]


def check_safety(
    answer: str,
    citations: List[Citation],
    confidence: float,
    question: str,
) -> SafetyCheckResult:
    """
    Returns SafetyCheckResult with is_safe flag and rejection reason if applicable.
    """
    # Rule 1: confidence threshold
    if confidence < CONFIDENCE_THRESHOLD:
        return SafetyCheckResult(
            is_safe=False,
            rejection_reason="Not found in provided medical sources.",
            has_citations=False,
            confidence=confidence,
        )

    # Rule 2: must have at least one citation
    has_citations = len(citations) > 0
    if not has_citations:
        return SafetyCheckResult(
            is_safe=False,
            rejection_reason="Cannot verify answer — no source documents available.",
            has_citations=False,
            confidence=confidence,
        )

    # Rule 3: detect unsafe/speculative language in generated answer
    answer_lower = answer.lower()
    for pat in UNSAFE_PATTERNS:
        if re.search(pat, answer_lower):
            return SafetyCheckResult(
                is_safe=False,
                rejection_reason="Response contains unverified speculation — rejected by safety layer.",
                has_citations=has_citations,
                confidence=confidence,
            )

    return SafetyCheckResult(
        is_safe=True,
        rejection_reason=None,
        has_citations=has_citations,
        confidence=confidence,
    )


def is_high_risk(question: str, answer: str) -> bool:
    """Returns True if the content triggers any high-risk pattern (SAFETY ALERT)."""
    combined = (question + " " + answer).lower()
    return any(re.search(pat, combined, re.IGNORECASE) for pat in HIGH_RISK_PATTERNS)
