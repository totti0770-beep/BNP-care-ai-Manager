"""
An in-memory formulary for tests.

The drug data lives in `bnp_drug_formulary` now, so the safety-layer tests need
entries without needing Postgres. The values below are the ones the regression
tests assert on — they are the fixture's whole point, and each corresponds to a
defect that produced clinically unsafe output.

That the *seeded* rows satisfy the same invariants is a different question, and
is checked against a real database in `tests/test_formulary_db.py`.
"""
from typing import Optional

from models.formulary import DrugEntry, ReviewStatus
from services.formulary import Formulary


def entry(name: str, **kw) -> DrugEntry:
    """Build a DrugEntry, defaulting everything not under test."""
    row = {
        "drug_id": f"id-{name}",
        "generic_name": name,
        "name_ar": None,
        "aliases": [],
        "unit": "mg",
        "auto_calculate": True,
        "dose_per_kg": None,
        "adult_flat_min": None,
        "adult_flat_max": None,
        "adult_max_dose": None,
        "adult_max_daily": None,
        "adult_max_daily_elderly": None,
        "pediatric_min_per_kg": None,
        "pediatric_max_per_kg": None,
        "pediatric_max_daily_per_kg": None,
        "pediatric_max_doses_per_day": None,
        "overdose_threshold_absolute": None,
        "overdose_threshold_per_kg": None,
        "frequency": "q6h",
        "route": None,
        "antidote": "supportive care",
        "reference_regimen": None,
        "contraindications": [],
        "interactions": [],
        "warnings": [],
        "high_risk": False,
        "source_name": "Test formulary",
        "source_edition": "2026",
        "source_ref": "p.1",
        "review_status": "approved",
        "reviewed_by": "Test Pharmacist",
        "reviewer_license": "SCFHS-000000",
        "reviewed_at": None,
        "version": 1,
    }
    row.update(kw)
    return DrugEntry.from_row(row)


# The subset the safety-layer regression tests exercise, all approved so the
# dose logic runs. Coverage behaviour for pending and rejected entries is
# asserted separately, in tests/test_formulary_coverage.py.
FIXTURE_DRUGS = [
    entry(
        "morphine",
        aliases=["morphine sulfate", "ms contin"],
        dose_per_kg=0.1,
        adult_flat_min=2,
        adult_flat_max=4,
        adult_max_daily=120,
        pediatric_min_per_kg=0.05,
        pediatric_max_per_kg=0.1,
        overdose_threshold_absolute=200,
        contraindications=["respiratory depression", "severe asthma"],
        interactions=["benzodiazepines"],
        high_risk=True,
        antidote="Naloxone 0.4-2 mg IV",
    ),
    entry(
        "paracetamol",
        aliases=["acetaminophen", "tylenol"],
        dose_per_kg=15,
        adult_flat_min=500,
        adult_flat_max=1000,
        adult_max_daily=4000,
        pediatric_min_per_kg=10,
        pediatric_max_per_kg=15,
        overdose_threshold_absolute=7500,
        contraindications=["severe liver disease"],
    ),
    entry(
        "ibuprofen",
        dose_per_kg=10,
        adult_flat_min=200,
        adult_flat_max=600,
        adult_max_daily=2400,
        pediatric_min_per_kg=5,
        pediatric_max_per_kg=10,
        overdose_threshold_absolute=3000,
    ),
    # Dosed in international units — no number is ever computed.
    entry(
        "heparin",
        aliases=["unfractionated heparin", "ufh", "hep"],
        unit="unit",
        auto_calculate=False,
        high_risk=True,
        reference_regimen="Prophylaxis: 5000 units SC q8-12h.",
        contraindications=["active bleeding"],
    ),
    entry(
        "insulin",
        aliases=["lantus"],
        unit="unit",
        auto_calculate=False,
        high_risk=True,
        reference_regimen="Individualized - ALWAYS per physician order",
    ),
    # Weight-scaled threshold, not an absolute total.
    entry(
        "enoxaparin",
        aliases=["clexane", "lovenox"],
        dose_per_kg=1.0,
        adult_max_daily=180,
        overdose_threshold_per_kg=2,
        high_risk=True,
        antidote="Protamine sulfate",
    ),
    # Single-dose ceiling below the daily ceiling.
    entry(
        "gentamicin",
        dose_per_kg=1.5,
        adult_max_dose=160,
        adult_max_daily=480,
        overdose_threshold_absolute=640,
        high_risk=True,
    ),
    entry(
        "warfarin",
        adult_max_daily=10,
        overdose_threshold_absolute=20,
        interactions=["aspirin", "NSAIDs"],
        high_risk=True,
    ),
]


def build_formulary(drugs: Optional[list] = None) -> Formulary:
    """A loaded Formulary with no database behind it."""
    f = Formulary()
    entries = tuple(FIXTURE_DRUGS if drugs is None else drugs)
    by_name = {}
    for e in entries:
        by_name[e.generic_name] = e
        if e.name_ar:
            by_name[e.name_ar.lower()] = e
        for alias in e.aliases:
            by_name.setdefault(alias, e)
    f._entries = entries
    f._by_name = by_name
    f._loaded = True
    return f


def with_status(name: str, status: str, **kw) -> DrugEntry:
    """The same drug at a different point in its review lifecycle."""
    base = next(d for d in FIXTURE_DRUGS if d.generic_name == name)
    row = {**base.__dict__}
    row["review_status"] = ReviewStatus(status).value
    row["aliases"] = list(base.aliases)
    row["contraindications"] = list(base.contraindications)
    row["interactions"] = list(base.interactions)
    row["warnings"] = list(base.warnings)
    row["adult_flat_min"] = base.adult_flat_min
    row["adult_flat_max"] = base.adult_flat_max
    row.update(kw)
    return DrugEntry.from_row(row)
