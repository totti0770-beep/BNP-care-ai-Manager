"""
What the nurse actually asked, as distinct from what the question is about.

`clinical_router.classify_query` answers "is this a medication question?" and is
consumed at `routers/query.py` to decide whether the drug-safety layer runs at
all. It is deliberately left alone here: changing its three values would change
which requests get a formulary lookup, a contraindication check and an overdose
gate, and that is not what needed fixing.

What needed fixing is that every medication question then produced the same
payload. "كيف احسب جرعه الvancomycin" and "Tell me everything about vancomycin"
took one path and returned one drug record — for vancomycin, 6,162 characters
across 11 fields, the longest row in the formulary.

So intent is a second, orthogonal axis: `DRUG` says the safety layer runs,
intent says which part of the record answers the question. Nothing here decides
a dose. There are no drug names and no figures in this module by design — every
number continues to come from `drug_calculator` reading the pharmacist-approved
formulary, and this file only ever selects among fields the formulary already
holds.

Arabic follows `clinical_router`'s technique exactly, for the reason its own
comment gives: `\\b` is an ASCII word boundary and does not match around Arabic
characters. ASCII and Arabic patterns are scored separately and summed, so a
mixed question like "كيف احسب جرعه vancomycin" scores on both lists.
"""
import re
from typing import List, Optional, Tuple

from models.formulary import DrugEntry
from models.schemas import ClinicalIntent

# ── Patterns ─────────────────────────────────────────────────────────────────
#
# Order matters where two intents share vocabulary. DOSE_CALCULATION is checked
# before DOSE because "كيف احسب جرعة" contains "جرعة": scored the other way, a
# request to calculate would be answered with a quoted range.

CALCULATION_ASCII = [
    r"\b(calculate|calculation|compute|work out)\b",
    r"(?:how (?:do|would) i (?:calculate|work out|figure out))",
    r"(?:how much .{0,30}(?:for|should i give|do i give))",
    r"\b(mg/kg|per kg|weight.based|by weight)\b",
]
CALCULATION_ARABIC = [
    r"(كيف احسب|كيف أحسب|كيف نحسب|طريقة حساب|احسب|أحسب|احسبي)",
    r"(حساب الجرعة|حساب جرعة|كم الجرعة لمريض|كم جرعة مريض)",
    r"(حسب الوزن|على الوزن|لكل كيلو|لكل كجم)",
]

DOSE_ASCII = [
    r"\b(dose|dosage|dosing)\b",
    r"(?:how much|what dose|safe dose|usual dose|standard dose)",
    r"\b(maximum dose|max dose|minimum dose|loading dose|maintenance dose)\b",
]
DOSE_ARABIC = [
    r"(الجرعة|جرعة|جرعه|جرعت)",
    r"(كم أعطي|كم اعطي|ما الجرعة|ماهي الجرعة|ما هي الجرعة)",
]

PREPARATION_ASCII = [
    r"\b(prepare|preparation|reconstitut|dilut|diluent|mix|admix)\w*\b",
    r"\b(final concentration|concentration|vial|ampoule|ampule)\b",
    r"\b(how do i prepare|how to prepare|how is it prepared)\b",
]
PREPARATION_ARABIC = [
    r"(تحضير|احضر|أحضر|حضّر|حضر|طريقة تحضير|كيفية تحضير|كيف احضر|كيف أحضر)",
    r"(تخفيف|خفف|إذابة|أذيب|ذوب|مذيب|مخفف|محلول|تركيز نهائي|التركيز)",
    r"(فيال|أمبولة|امبولة|عبوة)",
]

ADMINISTRATION_ASCII = [
    # Suffixed forms matter: "how should it be administered" is the natural way
    # to ask, and \badminister\b does not match it.
    r"\b(administer\w*|administration|giv(?:e|en|ing)|infus\w*|push|bolus|titrat\w*)\b",
    r"\b(infusion rate|rate of infusion|over how long|how fast|drip rate)\b",
    r"\b(route|iv push|slow iv|intravenous|intramuscular|subcutaneous)\b",
]
ADMINISTRATION_ARABIC = [
    r"(إعطاء|اعطاء|كيف أعطي|كيف اعطي|كيف تعطى|طريقة الإعطاء|طريقة الاعطاء)",
    r"(تسريب|التسريب|سرعة التسريب|مدة التسريب|على مدى|خلال كم)",
    r"(وريدي|عضلي|تحت الجلد|حقن بطيء|دفعة)",
]

RENAL_ASCII = [
    r"\b(renal|kidney|crcl|creatinine clearance|egfr|gfr|dialysis|haemodialysis|hemodialysis)\b",
    r"\b(renal (?:dose|adjust\w*|impairment|failure))\b",
    r"\b(hepatic|liver) (?:dose|adjust\w*|impairment)\b",
]
RENAL_ARABIC = [
    r"(الكلى|كلوي|كلوية|القصور الكلوي|الفشل الكلوي|غسيل الكلى|الديال)",
    r"(الكرياتينين|تصفية الكرياتينين)",
    r"(الكبد|كبدي|كبدية|القصور الكبدي)",
]

PEDIATRIC_ASCII = [
    r"\b(pediatric|paediatric|child|children|infant|neonate|neonatal|newborn|baby)\b",
    r"\b(months? old|years? old)\b.{0,20}\b(child|infant|baby)\b",
]
PEDIATRIC_ARABIC = [
    r"(طفل|أطفال|اطفال|الأطفال|الاطفال|رضيع|حديث الولادة|خديج|مواليد)",
]

ANTIDOTE_ASCII = [
    r"\b(antidote|reversal|reverse|counteract)\b",
    r"\b(overdose|toxicity|toxic|poisoning)\b",
]
ANTIDOTE_ARABIC = [
    r"(ترياق|مضاد الجرعة|مضاد السموم|علاج التسمم)",
    r"(جرعة زائدة|الجرعة الزائدة|تسمم|التسمم|فرط الجرعة)",
]

MONITORING_ASCII = [
    r"\b(monitor|monitoring|watch for|observe|follow up|check levels?)\b",
    r"\b(trough|peak|serum level|drug level|labs?)\b",
]
MONITORING_ARABIC = [
    r"(مراقبة|أراقب|اراقب|متابعة|أتابع|ماذا أراقب|ماذا اراقب|ما الذي أراقبه)",
    r"(مستوى الدواء|المستوى القاعي|التحاليل|الفحوصات)",
]

FULL_INFO_ASCII = [
    r"\b(everything|all information|full (?:information|monograph|record|details))\b",
    r"\b(tell me (?:everything|all)|complete (?:information|profile))\b",
    r"\b(monograph|drug profile|full profile)\b",
]
FULL_INFO_ARABIC = [
    r"(كل شيء|كل المعلومات|جميع المعلومات|معلومات كاملة|كامل المعلومات)",
    r"(أخبرني كل|اخبرني كل|كل ما يتعلق|نبذة كاملة|الملف الكامل)",
]

# Checked in this order. The first intent to score at least one hit wins, so a
# more specific intent must precede a more general one that shares its words.
_ORDER: Tuple[Tuple[ClinicalIntent, List[str], List[str]], ...] = (
    (ClinicalIntent.FULL_DRUG_INFO, FULL_INFO_ASCII, FULL_INFO_ARABIC),
    (ClinicalIntent.ANTIDOTE, ANTIDOTE_ASCII, ANTIDOTE_ARABIC),
    (ClinicalIntent.DOSE_CALCULATION, CALCULATION_ASCII, CALCULATION_ARABIC),
    (ClinicalIntent.PREPARATION, PREPARATION_ASCII, PREPARATION_ARABIC),
    (ClinicalIntent.RENAL_ADJUSTMENT, RENAL_ASCII, RENAL_ARABIC),
    (ClinicalIntent.PEDIATRIC_DOSING, PEDIATRIC_ASCII, PEDIATRIC_ARABIC),
    (ClinicalIntent.MONITORING, MONITORING_ASCII, MONITORING_ARABIC),
    (ClinicalIntent.ADMINISTRATION, ADMINISTRATION_ASCII, ADMINISTRATION_ARABIC),
    (ClinicalIntent.DOSE, DOSE_ASCII, DOSE_ARABIC),
)


def _score(question: str, ascii_patterns: List[str], arabic_patterns: List[str]) -> int:
    lowered = question.lower()
    hits = sum(1 for p in ascii_patterns if re.search(p, lowered, re.IGNORECASE))
    # No \b for Arabic: Arabic characters are not ASCII word characters, so a
    # bounded pattern never matches. Same reasoning as clinical_router.py:10-12.
    hits += sum(1 for p in arabic_patterns if re.search(p, question))
    return hits


def classify_intent(question: str) -> ClinicalIntent:
    """
    Which part of a drug's record answers this question.

    Falls back to GENERAL_DRUG_INFO rather than to any dosing intent: guessing
    that an unclear question wants a dose is the guess with a clinical cost.
    """
    if not question:
        return ClinicalIntent.GENERAL_DRUG_INFO

    best_intent = ClinicalIntent.GENERAL_DRUG_INFO
    best_score = 0
    for intent, ascii_patterns, arabic_patterns in _ORDER:
        score = _score(question, ascii_patterns, arabic_patterns)
        # Strictly greater, so the tuple order above breaks ties toward the more
        # specific intent.
        if score > best_score:
            best_intent, best_score = intent, score

    return best_intent


# ── Required patient variables ───────────────────────────────────────────────
#
# Named for the request field a caller would set, so the client can map a
# missing variable onto its own input without a second table.

WEIGHT = "patient_weight_kg"
AGE = "age"


def required_variables(
    intent: ClinicalIntent,
    entry: Optional[DrugEntry],
    *,
    weight: Optional[float],
    age: Optional[int],
) -> List[str]:
    """
    What is missing before this question can be answered from approved data.

    Resolved against the entry, not against a fixed list: weight only matters
    where the approved record carries a per-kilogram figure to multiply, and age
    only matters where it carries a separate pediatric range to choose between.
    Asking for a number that would change nothing is noise, and noise in a
    clinical prompt is how real prompts stop being read.
    """
    if entry is None or intent not in (
        ClinicalIntent.DOSE_CALCULATION,
        ClinicalIntent.PEDIATRIC_DOSING,
    ):
        return []

    # Nothing to compute from, so nothing to ask for. The coverage notice or the
    # quoted regimen already explains why there is no number.
    if not entry.auto_calculate or not entry.coverage.may_quote_a_dose:
        return []

    missing: List[str] = []

    if weight is None and (entry.dose_per_kg or entry.pediatric_range):
        missing.append(WEIGHT)

    if intent is ClinicalIntent.PEDIATRIC_DOSING:
        if age is None:
            missing.append(AGE)
    elif age is None and entry.pediatric_range:
        # Both ranges exist and nothing says which patient this is. The old
        # behaviour silently took the adult branch and warned only when a weight
        # happened to be present (drug_calculator.py:418).
        missing.append(AGE)

    return missing


# ── Retrieval ────────────────────────────────────────────────────────────────
#
# The index carries no section labels — chunk metadata is
# {chunk_id, document_id, document_name, page_number, chunk_index} in both write
# paths, and bnp_chunks has no topic column. So this is keyword biasing of the
# query string, exactly as arabic_translator.translate_for_search already
# appends drug names "so BM25 scores them highly". It is NOT metadata filtering,
# and nothing here should be described as such.

_RETRIEVAL_KEYWORDS = {
    ClinicalIntent.DOSE: ("dose", "dosage", "dosing"),
    ClinicalIntent.DOSE_CALCULATION: ("dose", "mg/kg", "weight"),
    ClinicalIntent.PREPARATION: (
        "preparation", "reconstitution", "dilution", "diluent", "concentration",
    ),
    ClinicalIntent.ADMINISTRATION: (
        "administration", "infusion", "rate", "route",
    ),
    ClinicalIntent.RENAL_ADJUSTMENT: (
        "renal", "creatinine clearance", "dose adjustment",
    ),
    ClinicalIntent.PEDIATRIC_DOSING: ("pediatric", "child", "neonate"),
    ClinicalIntent.ANTIDOTE: ("antidote", "overdose", "reversal"),
    ClinicalIntent.MONITORING: ("monitoring", "serum level", "trough"),
    ClinicalIntent.GENERAL_DRUG_INFO: (),
    ClinicalIntent.FULL_DRUG_INFO: (),
}


def retrieval_keywords(intent: ClinicalIntent) -> Tuple[str, ...]:
    """English terms to append to the search string for this intent."""
    return _RETRIEVAL_KEYWORDS.get(intent, ())


# ── Which regimen fields answer which question ───────────────────────────────
#
# These are the labels tools/convert_jsh_workbooks.py writes, and the same
# closed set drug_calculator.split_regimen parses. Selecting among them is not
# truncation: every field still exists, and FULL_DRUG_INFO returns all of them.

_SECTIONS_FOR_INTENT = {
    ClinicalIntent.DOSE: ("Adult dosing", "Pediatric dosing"),
    # When no figure can be computed — every JSH row is protocol-dosed — the
    # dosing guidance is what answers "how do I calculate this".
    ClinicalIntent.DOSE_CALCULATION: (
        "Adult dosing",
        "Pediatric dosing",
        "Renal/hepatic adjustment",
    ),
    ClinicalIntent.PEDIATRIC_DOSING: ("Pediatric dosing",),
    ClinicalIntent.RENAL_ADJUSTMENT: ("Renal/hepatic adjustment",),
    ClinicalIntent.PREPARATION: (
        "Package size / initial strength",
        "Final concentration",
        "Final volume",
        "Diluents",
        "Preparation, administration and stability",
        "Dosage form and strength",
    ),
    ClinicalIntent.ADMINISTRATION: (
        "Administration",
        "Preparation, administration and stability",
        "Final concentration",
    ),
    ClinicalIntent.MONITORING: (),
    ClinicalIntent.ANTIDOTE: (),
    ClinicalIntent.GENERAL_DRUG_INFO: (),
}


def sections_for_intent(intent: ClinicalIntent) -> Optional[Tuple[str, ...]]:
    """
    The regimen labels this intent should show, or None for "all of them".

    An empty tuple means "none of the regimen" — the answer for this intent
    comes from elsewhere in the record (the antidote field, the monitoring
    warning) and a regimen dump would bury it.
    """
    if intent is ClinicalIntent.FULL_DRUG_INFO:
        return None
    return _SECTIONS_FOR_INTENT.get(intent, ())


# The labels the workbook converter writes into the `warnings` column, which the
# importer splits on "|" (services/formulary_import.py:211) — so each entry in
# DrugEntry.warnings already arrives as one "Label: value" string.
MONITORING_WARNING_LABEL = "Monitoring"


def monitoring_note(entry: Optional[DrugEntry]) -> Optional[str]:
    """The approved monitoring text, if the record carries one."""
    if entry is None:
        return None
    prefix = f"{MONITORING_WARNING_LABEL}: "
    for warning in entry.warnings:
        if warning.startswith(prefix):
            return warning[len(prefix):].strip() or None
    return None
