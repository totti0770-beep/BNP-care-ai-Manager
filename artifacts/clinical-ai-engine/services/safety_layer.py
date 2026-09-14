"""
Safety Layer — enforces BNP rules:
  1. Reject if retrieval confidence is below threshold
  2. Reject if no citations found
  3. Reject generated answers containing unverified speculation
  4. Reject a dose figure the approved formulary did not produce
  5. Flag high-risk content

The checks are split because they run at different points: retrieval is
validated before an answer is generated, and the generated answer is validated
after. The speculation rule previously ran pre-generation against an empty
string, so it never inspected any model output.

Rule 4 exists because rule 3 was the only thing ever inspecting `answer`, and it
looks for hedging words rather than for numbers. The model is asked to write
from retrieved PDF prose and has never been shown the formulary, so it could
state a milligram figure in `answer` while the `dose` field beneath it said no
pharmacist had signed a number off. The structured field was protected; the
sentence a nurse actually reads was not.
"""
import re
from typing import List, Optional
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


# ── Rule 4: a stated dose must come from the approved path ───────────────────
#
# The figures are compared, not the prose. A model that reformats "15 to 20
# mg/kg" as "15–20 mg/kg" is quoting, not inventing, and a literal string check
# would refuse it; comparing the numbers and their units survives rewording
# while still catching arithmetic the model did itself.

_UNIT_ALIASES = {
    "mcg": "mcg", "microgram": "mcg", "micrograms": "mcg", "µg": "mcg",
    "mg": "mg", "milligram": "mg", "milligrams": "mg",
    "g": "g", "gram": "g", "grams": "g",
    "unit": "unit", "units": "unit", "iu": "unit", "i.u.": "unit",
    "mmol": "mmol", "meq": "meq",
    "ml": "ml", "millilitre": "ml", "millilitres": "ml",
    "milliliter": "ml", "milliliters": "ml",
    # Arabic
    "ملغم": "mg", "مليغرام": "mg", "ملجم": "mg",
    "مكغم": "mcg", "ميكروغرام": "mcg",
    "غرام": "g", "جرام": "g",
    "وحدة": "unit", "وحدات": "unit",
    "مليلتر": "ml", "مل": "ml",
}

_FIGURE_RE = re.compile(
    r"(?<![\w/.])(\d+(?:[.,]\d+)?)\s*"
    r"(mcg|micrograms?|µg|mg|milligrams?|g|grams?|units?|iu|i\.u\.|mmol|meq"
    r"|ml|millilitres?|milliliters?"
    r"|ملغم|مليغرام|ملجم|مكغم|ميكروغرام|غرام|جرام|وحدات|وحدة|مليلتر|مل)"
    r"(?![\w])"
    # "5 mg/mL" states the strength of the product, not an amount to give.
    # "15 mg/kg" is a dose expression and stays.
    r"(?!\s*/\s*(?:ml|l|millilitres?|milliliters?|مل)\b)",
    re.IGNORECASE,
)


def dose_figures(text: str) -> set:
    """Every `(value, canonical unit)` a piece of prose states."""
    if not text:
        return set()
    found = set()
    for value, unit in _FIGURE_RE.findall(text):
        canonical = _UNIT_ALIASES.get(unit.lower())
        if canonical is None:
            continue
        try:
            found.add((float(value.replace(",", ".")), canonical))
        except ValueError:
            continue
    return found


def check_dose_is_grounded(
    answer: str,
    confidence: float,
    *,
    approved_dose: Optional[str] = None,
    approved_text: Optional[str] = None,
    enforced: bool = True,
) -> SafetyCheckResult:
    """
    A dosing answer may state only figures the approved path produced or quoted.

    `approved_dose` is `DrugDoseResult.calculated_dose` — what
    `drug_calculator` derived from the pharmacist-signed row. `approved_text` is
    the approved record itself (the reference regimen and the dose result), so a
    figure the source states verbatim is grounded even when nothing was
    computed: quoting the hospital's own manual is the intended behaviour, and
    doing arithmetic on it is not.

    `enforced` is False for intents where a number is not a dose instruction —
    a preparation volume or an infusion concentration — so this gate does not
    manufacture refusals on questions it was not written for.
    """
    if not enforced:
        return SafetyCheckResult(
            is_safe=True, rejection_reason=None, has_citations=True, confidence=confidence
        )

    grounded = dose_figures(approved_dose or "") | dose_figures(approved_text or "")
    ungrounded = dose_figures(answer) - grounded

    if ungrounded:
        return SafetyCheckResult(
            is_safe=False,
            rejection_reason=(
                "The answer stated a dose the approved formulary did not "
                "produce — rejected by the safety layer."
            ),
            has_citations=True,
            confidence=confidence,
        )

    return SafetyCheckResult(
        is_safe=True, rejection_reason=None, has_citations=True, confidence=confidence
    )


def is_high_risk(question: str, answer: str) -> bool:
    """Returns True if the content triggers any high-risk pattern (SAFETY ALERT)."""
    combined = (question + " " + answer).lower()
    return any(re.search(pat, combined, re.IGNORECASE) for pat in HIGH_RISK_PATTERNS)
