"""
Dose calculation and the deterministic SafetyEngine.

This module is pure logic. The medication data it operates on lives in
`bnp_drug_formulary` and reaches here as a `DrugEntry` — see
`models/formulary.py` for the safety contract those entries satisfy, and
`services/formulary_import.py` for where it is enforced on the way in.

The one rule that governs everything below: **a number is only ever quoted for
a drug a pharmacist has approved.** An entry that is merely present is not
evidence. Its contraindications, interactions and high-risk flags are still
surfaced, because those are additive warnings and withholding them would be
less safe than showing them — but they are labelled unverified, and no dose,
range or overdose threshold is computed from unapproved figures.
"""
import re
from typing import List, Optional, Tuple

from models.formulary import PEDIATRIC_AGE_LIMIT, DrugEntry
from models.schemas import DrugDoseResult

__all__ = [
    "PEDIATRIC_AGE_LIMIT",
    "SafetyEngine",
    "calculate_dose",
    "extract_age",
    "extract_weight",
]


_STOPWORDS = {"a", "an", "the", "of", "in", "with", "and", "or", "to"}

# Nurse-facing, so bilingual. These sentences are the entire explanation for a
# blank dose field; an Arabic-only reader who cannot read them is left with a
# missing number and no reason for it.
_ARABIC_RE = re.compile(r"[\u0600-\u06FF]")

UNVERIFIED_NOTICE = (
    "⚠️ This medication has not been signed off by a pharmacist in this system. "
    "No dose is calculated. Verify against the hospital formulary and the "
    "physician order."
)
UNVERIFIED_NOTICE_AR = (
    "⚠️ هذا الدواء لم يُعتمد من صيدلي في هذا النظام. لم تُحسب أي جرعة. "
    "تحقّق من دستور أدوية المنشأة ومن أمر الطبيب."
)

REJECTED_NOTICE = (
    "⛔ A pharmacist reviewed this medication's entry and rejected it. "
    "No dose is calculated. Use the hospital formulary."
)
REJECTED_NOTICE_AR = (
    "⛔ راجع صيدلي بيانات هذا الدواء ورفضها. لم تُحسب أي جرعة. "
    "استخدم دستور أدوية المنشأة."
)


def _notice(arabic: str, english: str, question: str) -> str:
    return arabic if _ARABIC_RE.search(question or "") else english


def _tokenize(text: str) -> frozenset:
    """Lowercase word set for clinical-phrase comparison, minus filler words."""
    words = re.findall(r"[a-z0-9]+", text.lower())
    return frozenset(w for w in words if w not in _STOPWORDS)


class SafetyEngine:
    """
    Rule-based medication safety checks.

    Overdose limits, patient contraindications, and drug-drug interactions.
    These run before generation and the model cannot argue past them.
    """

    @staticmethod
    def calculate_dose_kg(
        entry: Optional[DrugEntry], weight: float
    ) -> Tuple[Optional[float], List[str]]:
        """
        Calculate a weight-based dose and return alerts if it exceeds a maximum.

        Returns (None, []) when no number may be computed: an unknown drug, a
        drug not approved for use by a pharmacist, or one dosed in international
        units. Callers therefore never present a computed figure that has no
        signed-off basis.
        """
        if entry is None or not entry.coverage.may_quote_a_dose:
            return None, []
        if not entry.auto_calculate:
            return None, []

        dose_per_kg = entry.dose_per_kg
        if not dose_per_kg or not weight:
            return None, []

        unit = entry.unit
        dose = round(dose_per_kg * weight, 1)
        alerts: List[str] = []

        # Weight-scaled ceiling, where the entry defines one.
        per_kg_max = entry.overdose_threshold_per_kg
        if per_kg_max:
            scaled = round(per_kg_max * weight, 1)
            if dose > scaled:
                alerts.append(
                    f"🚨 OVERDOSE: Calculated {dose} {unit} exceeds "
                    f"{per_kg_max} {unit}/kg ({scaled} {unit} for {weight} kg)"
                )
                return dose, alerts

        # Absolute single-dose maximum first, then the daily maximum.
        max_single = entry.adult_max_dose
        max_daily = entry.adult_max_daily
        if max_single and dose > max_single:
            alerts.append(
                f"🚨 OVERDOSE: Calculated {dose} {unit} exceeds maximum single "
                f"dose of {max_single} {unit}"
            )
        elif max_daily and dose > max_daily:
            alerts.append(
                f"🚨 OVERDOSE: Calculated {dose} {unit} exceeds maximum daily "
                f"dose of {max_daily} {unit}"
            )
        return dose, alerts

    @staticmethod
    def check_contraindications(
        entry: Optional[DrugEntry], conditions: List[str]
    ) -> List[str]:
        """
        Return alerts for any patient condition matching a drug contraindication.

        Matching is on whole words rather than raw substrings: a bidirectional
        `in` test matched any condition that happened to be a substring of a
        contraindication (and vice versa), producing both false alarms and
        silent misses.
        """
        alerts: List[str] = []
        if entry is None or not conditions:
            return alerts

        for condition in conditions:
            condition_tokens = _tokenize(condition)
            if not condition_tokens:
                continue
            for contra in entry.contraindications:
                contra_tokens = _tokenize(contra)
                if not contra_tokens:
                    continue
                # One is a phrase contained in the other, token-wise.
                if condition_tokens <= contra_tokens or contra_tokens <= condition_tokens:
                    alerts.append(
                        f"⚠️ Contraindication: Patient has '{condition}' — "
                        f"use of {entry.generic_name.title()} is contraindicated "
                        f"({contra})"
                    )
                    break
        return alerts

    @staticmethod
    def check_interactions(
        entry: Optional[DrugEntry], other_drugs: List[str]
    ) -> List[str]:
        """Return alerts for drug-drug interactions."""
        alerts: List[str] = []
        if entry is None or not other_drugs:
            return alerts
        known = [i.lower() for i in entry.interactions]
        for other in other_drugs:
            if other.lower() in known:
                alerts.append(
                    f"⚠️ Drug Interaction: {entry.generic_name.title()} "
                    f"interacts with {other.title()}"
                )
        return alerts

    @staticmethod
    def high_risk_flag(entry: Optional[DrugEntry]) -> List[str]:
        """Return a high-risk flag if the drug is a high-alert medication."""
        if entry is not None and entry.high_risk:
            return [
                f"🔴 High Risk Medication: {entry.generic_name.title()} — "
                "requires double-check protocol"
            ]
        return []

    @staticmethod
    def get_nursing_notes(
        entry: Optional[DrugEntry], has_interactions: bool
    ) -> List[str]:
        """Return standard nursing administration notes."""
        notes = [
            "Verify patient identity using two identifiers before administration.",
            "Double-check dosage, route, and rate against physician order.",
        ]
        if entry is not None and entry.high_risk:
            notes.insert(
                0,
                "🔴 Obtain independent double-check from second licensed nurse "
                "before administration.",
            )
        if has_interactions:
            notes.append(
                "Review all concurrent medications for interactions before "
                "administering."
            )
        frequency = (entry.frequency if entry else None) or "per physician order"
        notes.append(f"Administer at prescribed frequency: {frequency}.")
        notes.append(
            "Document administration in medication record immediately after giving."
        )
        return notes

    @staticmethod
    def get_contraindications_list(entry: Optional[DrugEntry]) -> List[str]:
        return list(entry.contraindications) if entry else []

    @staticmethod
    def get_interactions_list(entry: Optional[DrugEntry]) -> List[str]:
        return list(entry.interactions) if entry else []


def extract_weight(query: str) -> Optional[float]:
    """Extract patient weight in kg from query string."""
    patterns = [
        r"(\d+(?:\.\d+)?)\s*kg",
        r"weight\s+(?:of\s+)?(\d+(?:\.\d+)?)",
        r"(?:weighs?|wt)[:\s]+(\d+(?:\.\d+)?)",
        r"(?:وزن[:\s]+)(\d+(?:\.\d+)?)",
    ]
    for pat in patterns:
        m = re.search(pat, query, re.IGNORECASE)
        if m:
            return float(m.group(1))
    return None


def extract_age(query: str) -> Optional[int]:
    """Extract patient age in years from a query string, if stated."""
    patterns = [
        r"(\d{1,3})\s*(?:-|\s)?\s*year[s]?[\s-]*old",
        r"\bage[d]?[:\s]+(\d{1,3})\b",
        r"(?:عمر[هها]?|السن)[:\s]+(\d{1,3})",
    ]
    for pat in patterns:
        m = re.search(pat, query, re.IGNORECASE)
        if m:
            age = int(m.group(1))
            if 0 <= age <= 120:
                return age
    return None


def _unapproved_result(
    entry: DrugEntry, weight: Optional[float], notice: str
) -> DrugDoseResult:
    """
    What a nurse gets for a drug whose figures nobody has signed off.

    No calculated dose, no range, no overdose threshold — those would all be
    numbers with no accountable source. The warnings and the high-risk flag do
    still travel, because they only ever add caution.
    """
    return DrugDoseResult(
        drug_name=entry.generic_name.title(),
        patient_weight_kg=weight,
        calculated_dose=None,
        safe_range=notice,
        overdose_threshold=None,
        warnings=[notice] + list(entry.warnings),
    )


def calculate_dose(
    entry: Optional[DrugEntry],
    query: str = "",
    weight_kg: Optional[float] = None,
    age_years: Optional[int] = None,
) -> Optional[DrugDoseResult]:
    """
    Build the dose result for a drug, or None if there is no entry.

    The pediatric range is used only when an age below PEDIATRIC_AGE_LIMIT is
    explicitly known. Weight alone never selects it: any query with a weight
    used to take the pediatric branch, so a 70 kg adult asking about morphine
    was given the pediatric 0.05–0.1 mg/kg range (3.5–7 mg) instead of the
    adult 2–4 mg in the same record.
    """
    if entry is None:
        return None

    weight = weight_kg or extract_weight(query)
    age = age_years if age_years is not None else extract_age(query)

    from models.formulary import CoverageStatus

    if entry.coverage is CoverageStatus.REJECTED:
        return _unapproved_result(
            entry, weight, _notice(REJECTED_NOTICE_AR, REJECTED_NOTICE, query)
        )
    if not entry.coverage.may_quote_a_dose:
        return _unapproved_result(
            entry, weight, _notice(UNVERIFIED_NOTICE_AR, UNVERIFIED_NOTICE, query)
        )

    unit = entry.unit
    warnings: List[str] = list(entry.warnings)

    # Drugs dosed in international units, or otherwise protocol-driven, are
    # never computed here.
    if not entry.auto_calculate:
        reference = entry.reference_regimen or "Per physician order"
        return DrugDoseResult(
            drug_name=entry.generic_name.title(),
            patient_weight_kg=weight,
            calculated_dose=(
                f"Not calculated — {entry.generic_name} is dosed in "
                f"{unit}s per protocol"
            ),
            safe_range=reference,
            overdose_threshold=None,
            warnings=warnings,
        )

    is_pediatric = age is not None and age < PEDIATRIC_AGE_LIMIT
    pediatric_range = entry.pediatric_range

    if age is None and weight:
        warnings = warnings + [
            "Age was not provided — the ADULT dose range is shown. "
            "Supply the patient age for a pediatric calculation."
        ]

    adult_flat = entry.adult_flat
    adult_min, adult_max = adult_flat if adult_flat else (None, None)

    if is_pediatric and pediatric_range and weight:
        lo, hi = pediatric_range
        safe_range = f"{lo}–{hi} {unit}/kg per dose (pediatric)"
    elif adult_min is not None and adult_max is not None:
        safe_range = f"{adult_min}–{adult_max} {unit} per dose (adult)"
    elif entry.dose_per_kg and weight:
        dpk = entry.dose_per_kg
        safe_range = (
            f"{round(dpk * weight, 1)} {unit}/dose "
            f"(based on {dpk} {unit}/kg × {weight} kg, adult)"
        )
    else:
        safe_range = "Dose per physician order"
    if entry.route:
        safe_range += f" ({entry.route})"
    if entry.adult_max_daily is not None:
        safe_range += f"; max {entry.adult_max_daily} {unit}/day"

    calculated_dose = None
    if is_pediatric and pediatric_range and weight:
        lo, hi = pediatric_range
        calculated_dose = (
            f"{round(lo * weight, 1)}–{round(hi * weight, 1)} {unit}/dose "
            f"(pediatric {lo}–{hi} {unit}/kg × {weight} kg, age {age})"
        )
    elif weight and entry.dose_per_kg:
        dpk = entry.dose_per_kg
        calculated_dose = (
            f"{round(dpk * weight, 1)} {unit}/dose "
            f"(adult {dpk} {unit}/kg × {weight} kg)"
        )
    elif adult_min and adult_max:
        calculated_dose = f"{adult_min}–{adult_max} {unit} (standard adult dose)"

    # Overdose threshold — absolute, or weight-scaled where the entry says so.
    overdose_str = None
    antidote = entry.antidote or "supportive care"
    per_kg_max = entry.overdose_threshold_per_kg
    absolute_max = entry.overdose_threshold_absolute

    if per_kg_max and weight:
        overdose_str = (
            f">{round(per_kg_max * weight, 1)} {unit} total "
            f"({per_kg_max} {unit}/kg × {weight} kg) — administer antidote: {antidote}"
        )
    elif per_kg_max:
        overdose_str = f">{per_kg_max} {unit}/kg — administer antidote: {antidote}"
    elif absolute_max:
        overdose_str = (
            f">{absolute_max} {unit} total — administer antidote: {antidote}"
        )

    return DrugDoseResult(
        drug_name=entry.generic_name.title(),
        patient_weight_kg=weight,
        calculated_dose=calculated_dose,
        safe_range=safe_range,
        overdose_threshold=overdose_str,
        warnings=warnings,
    )
