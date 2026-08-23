"""
The shape of one medication in the formulary, and what the system is allowed
to say about it.

This module holds no database access on purpose: `services/drug_calculator.py`
depends on it, and the calculator must stay a pure function of an entry so it
can be tested without a database.

SAFETY CONTRACT — the rules the data must satisfy. They are enforced in three
places, deliberately: as CHECK constraints in migration 0003, as import-time
validation in `services/formulary_import.py`, and as behaviour here.

  * `unit` is the unit every numeric field is expressed in. A drug not dosed in
    milligrams sets `auto_calculate=False`, and no number is ever computed for
    it — heparin and insulin are dosed in international units.
  * `pediatric_*` bounds apply only when an age below PEDIATRIC_AGE_LIMIT is
    known. Weight alone never selects them: an adult and a child can weigh the
    same.
  * `overdose_threshold_per_kg` is weight-scaled; `overdose_threshold_absolute`
    is a total. Putting one in the other's field is the enoxaparin defect,
    which read a normal 70 mg dose as a 35x overdose.
  * A dose is quoted only from an entry a pharmacist has approved. See
    CoverageStatus.
"""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional, Tuple


# Below this age the pediatric range applies, and only when age is known.
PEDIATRIC_AGE_LIMIT = 18


class ReviewStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class CoverageStatus(str, Enum):
    """
    What the system knows about a drug, which decides what it may say.

    APPROVED is the only status that produces a number. The distinction between
    the other three matters to a nurse: "we have never heard of this drug" and
    "a pharmacist looked at our figures and rejected them" are different
    warnings, and collapsing them into a shrug loses the second one.
    """

    APPROVED = "approved"
    PENDING_REVIEW = "pending_review"
    REJECTED = "rejected"
    NOT_IN_FORMULARY = "not_in_formulary"

    @property
    def may_quote_a_dose(self) -> bool:
        return self is CoverageStatus.APPROVED


def _f(value: Any) -> Optional[float]:
    """NUMERIC arrives as Decimal, which will not multiply by a float weight."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


@dataclass(frozen=True)
class DrugEntry:
    drug_id: str
    generic_name: str
    name_ar: Optional[str]
    aliases: Tuple[str, ...]

    unit: str
    auto_calculate: bool
    dose_per_kg: Optional[float]
    adult_flat_min: Optional[float]
    adult_flat_max: Optional[float]
    adult_max_dose: Optional[float]
    adult_max_daily: Optional[float]
    adult_max_daily_elderly: Optional[float]
    pediatric_min_per_kg: Optional[float]
    pediatric_max_per_kg: Optional[float]
    pediatric_max_daily_per_kg: Optional[float]
    pediatric_max_doses_per_day: Optional[int]
    overdose_threshold_absolute: Optional[float]
    overdose_threshold_per_kg: Optional[float]
    frequency: Optional[str]
    route: Optional[str]
    antidote: Optional[str]
    reference_regimen: Optional[str]
    contraindications: Tuple[str, ...]
    interactions: Tuple[str, ...]
    warnings: Tuple[str, ...]
    high_risk: bool

    source_name: str
    source_edition: Optional[str]
    source_ref: Optional[str]

    review_status: ReviewStatus
    reviewed_by: Optional[str]
    reviewer_license: Optional[str]
    reviewed_at: Optional[datetime]
    version: int

    # ── Derived ───────────────────────────────────────────────────────────────

    @property
    def adult_flat(self) -> Optional[Tuple[float, float]]:
        if self.adult_flat_min is None or self.adult_flat_max is None:
            return None
        return (self.adult_flat_min, self.adult_flat_max)

    @property
    def pediatric_range(self) -> Optional[Tuple[float, float]]:
        if self.pediatric_min_per_kg is None or self.pediatric_max_per_kg is None:
            return None
        return (self.pediatric_min_per_kg, self.pediatric_max_per_kg)

    @property
    def coverage(self) -> CoverageStatus:
        if self.review_status is ReviewStatus.APPROVED:
            return CoverageStatus.APPROVED
        if self.review_status is ReviewStatus.REJECTED:
            return CoverageStatus.REJECTED
        return CoverageStatus.PENDING_REVIEW

    @property
    def provenance(self) -> str:
        """One line naming where the numbers came from, for display and audit."""
        parts = [self.source_name]
        if self.source_edition:
            parts.append(self.source_edition)
        if self.source_ref:
            parts.append(self.source_ref)
        return " · ".join(parts)

    def matches(self, term: str) -> bool:
        """Whether a lowercased term names this drug."""
        term = term.strip().lower()
        if not term:
            return False
        return (
            term == self.generic_name
            or term == (self.name_ar or "")
            or term in self.aliases
        )

    @staticmethod
    def from_row(row: dict) -> "DrugEntry":
        return DrugEntry(
            drug_id=str(row["drug_id"]),
            generic_name=row["generic_name"].strip().lower(),
            name_ar=row.get("name_ar"),
            aliases=tuple(a.strip().lower() for a in (row.get("aliases") or [])),
            unit=row["unit"],
            auto_calculate=bool(row["auto_calculate"]),
            dose_per_kg=_f(row.get("dose_per_kg")),
            adult_flat_min=_f(row.get("adult_flat_min")),
            adult_flat_max=_f(row.get("adult_flat_max")),
            adult_max_dose=_f(row.get("adult_max_dose")),
            adult_max_daily=_f(row.get("adult_max_daily")),
            adult_max_daily_elderly=_f(row.get("adult_max_daily_elderly")),
            pediatric_min_per_kg=_f(row.get("pediatric_min_per_kg")),
            pediatric_max_per_kg=_f(row.get("pediatric_max_per_kg")),
            pediatric_max_daily_per_kg=_f(row.get("pediatric_max_daily_per_kg")),
            pediatric_max_doses_per_day=row.get("pediatric_max_doses_per_day"),
            overdose_threshold_absolute=_f(row.get("overdose_threshold_absolute")),
            overdose_threshold_per_kg=_f(row.get("overdose_threshold_per_kg")),
            frequency=row.get("frequency"),
            route=row.get("route"),
            antidote=row.get("antidote"),
            reference_regimen=row.get("reference_regimen"),
            contraindications=tuple(row.get("contraindications") or []),
            interactions=tuple(row.get("interactions") or []),
            warnings=tuple(row.get("warnings") or []),
            high_risk=bool(row.get("high_risk")),
            source_name=row["source_name"],
            source_edition=row.get("source_edition"),
            source_ref=row.get("source_ref"),
            review_status=ReviewStatus(row.get("review_status", "pending")),
            reviewed_by=row.get("reviewed_by"),
            reviewer_license=row.get("reviewer_license"),
            reviewed_at=row.get("reviewed_at"),
            version=int(row.get("version", 1)),
        )
