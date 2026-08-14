"""
Safety Layer — enforces BNP rules:
  1. Reject if retrieval confidence is below threshold
  2. Reject if no citations found
  3. Reject generated answers containing unverified speculation
  4. Flag high-risk content

The checks are split in two because they run at different points: retrieval is
validated before an answer is generated, and the generated answer is validated
after. The speculation rule previously ran pre-generation against an empty
string, so it never inspected any model output.
"""
import re
from typing import List
from models.schemas import SafetyCheckResult, Citation

# Retrieval scores are absolute cosine/BM25 blends (see services/embeddings.py),
# so this is a meaningful floor rather than a formality.
CONFIDENCE_THRESHOLD = 0.25

UNSAFE_PATTERNS = [
    r"\b(i think|i believe|in my opinion|probably|perhaps)\b",
    r"\b(not sure|uncertain|might be|could be|might work)\b",
]

HIGH_RISK_PATTERNS = [
    r"\b(overdose|toxic|letal|lethal|death|cardiac arrest|anaphylaxis|respiratory arrest)\b",
    r"\b(emergency|urgent|immediate|stat|code blue|rapid response)\b",
    r"\b(contraindicated|severe allergy|anaphylactic)\b",
    r"\b(جرعة زائدة|طوارئ|حرج|خطر|وفاة)\b",
]


def check_retrieval(
    citations: List[Citation],
    confidence: float,
) -> SafetyCheckResult:
    """Validate retrieved context before an answer is generated."""
    if confidence < CONFIDENCE_THRESHOLD:
        return SafetyCheckResult(
            is_safe=False,
            rejection_reason="Not found in provided medical sources.",
            has_citations=bool(citations),
            confidence=confidence,
        )

    if not citations:
        return SafetyCheckResult(
            is_safe=False,
            rejection_reason="Cannot verify answer — no source documents available.",
            has_citations=False,
            confidence=confidence,
        )

    return SafetyCheckResult(
        is_safe=True,
        rejection_reason=None,
        has_citations=True,
        confidence=confidence,
    )


def check_answer(answer: str, confidence: float) -> SafetyCheckResult:
    """Validate a generated answer. Speculative language is not clinical advice."""
    lowered = answer.lower()
    for pat in UNSAFE_PATTERNS:
        if re.search(pat, lowered):
            return SafetyCheckResult(
                is_safe=False,
                rejection_reason="Response contains unverified speculation — rejected by safety layer.",
                has_citations=True,
                confidence=confidence,
            )

    return SafetyCheckResult(
        is_safe=True,
        rejection_reason=None,
        has_citations=True,
        confidence=confidence,
    )


def is_high_risk(question: str, answer: str) -> bool:
    """Returns True if the content triggers any high-risk pattern (SAFETY ALERT)."""
    combined = (question + " " + answer).lower()
    return any(re.search(pat, combined, re.IGNORECASE) for pat in HIGH_RISK_PATTERNS)
