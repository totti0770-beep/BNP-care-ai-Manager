"""
Regression tests for the medication safety layer.

Every test here corresponds to a defect that produced clinically unsafe output.
Treat a failure as a patient-safety incident, not a broken build.

The drug data now lives in `bnp_drug_formulary`, so these run against the
in-memory fixture in `tests/formulary_fixture.py`. The same invariants are
asserted against the real seeded rows in `tests/test_formulary_db.py`, and
against incoming data in `tests/test_formulary_import.py`.
"""
import pytest

from models.formulary import PEDIATRIC_AGE_LIMIT
from services.drug_calculator import (
    SafetyEngine,
    calculate_dose,
    extract_age,
    extract_weight,
)
from tests.formulary_fixture import build_formulary


@pytest.fixture
def formulary():
    return build_formulary()


@pytest.fixture
def drug(formulary):
    """Look a drug up the way the query router does."""
    return formulary.get


# ── S1: pediatric ranges must never be applied to adults ──────────────────────

def test_adult_morphine_does_not_use_pediatric_range(drug):
    """
    A 70 kg adult must get the adult 2-4 mg range, not the pediatric
    0.05-0.1 mg/kg range (3.5-7 mg). Regression for the defect where any query
    carrying a weight took the pediatric branch.
    """
    result = calculate_dose(drug("morphine"), "morphine dose", 70, 45)
    assert result is not None
    assert "pediatric" not in result.calculated_dose.lower()
    assert "adult" in result.calculated_dose.lower()


def test_weight_without_age_uses_adult_range(drug):
    """Weight alone must not imply a child — adults and children can weigh the same."""
    result = calculate_dose(drug("morphine"), "morphine dose", 70)
    assert result is not None
    assert "pediatric" not in result.calculated_dose.lower()
    assert any("age was not provided" in w.lower() for w in result.warnings)


def test_pediatric_range_used_when_age_is_known(drug):
    result = calculate_dose(drug("morphine"), "morphine dose", 20, 6)
    assert result is not None
    assert "pediatric" in result.calculated_dose.lower()
    # 0.05-0.1 mg/kg x 20 kg
    assert "1.0" in result.calculated_dose and "2.0" in result.calculated_dose


@pytest.mark.parametrize("age", [PEDIATRIC_AGE_LIMIT, PEDIATRIC_AGE_LIMIT + 10, 90])
def test_ages_at_or_above_limit_are_adult(drug, age):
    result = calculate_dose(drug("ibuprofen"), "ibuprofen dose", 70, age)
    assert result is not None
    assert "pediatric" not in result.calculated_dose.lower()


# ── S2: unit-dosed drugs must not produce a computed milligram figure ─────────

def test_heparin_is_not_calculated_in_milligrams(drug):
    """Heparin is dosed in units. Reporting mg/kg for it invites a fatal error."""
    result = calculate_dose(drug("heparin"), "heparin dose", 80)
    assert result is not None
    assert "not calculated" in result.calculated_dose.lower()
    assert "mg/dose" not in result.calculated_dose


def test_insulin_is_not_calculated(drug):
    result = calculate_dose(drug("insulin"), "insulin dose", 80)
    assert result is not None
    assert "not calculated" in result.calculated_dose.lower()


def test_unit_dosed_drugs_declare_their_unit_and_opt_out(drug):
    for name in ("heparin", "insulin"):
        entry = drug(name)
        assert entry.unit == "unit"
        assert entry.auto_calculate is False


# ── S3: weight-scaled thresholds must scale ───────────────────────────────────

def test_enoxaparin_therapeutic_dose_is_not_flagged_as_overdose(drug):
    """
    1 mg/kg is the therapeutic dose. With the threshold stored as an absolute
    2 mg, a normal 70 mg dose was reported as a 35x overdose requiring protamine.
    """
    dose, alerts = SafetyEngine.calculate_dose_kg(drug("enoxaparin"), 70)
    assert dose == 70.0
    assert alerts == []


def test_enoxaparin_overdose_threshold_scales_with_weight(drug):
    result = calculate_dose(drug("enoxaparin"), "enoxaparin dose", 70)
    assert result is not None
    # 2 mg/kg x 70 kg = 140 mg, not a bare "2 mg".
    assert "140" in result.overdose_threshold
    assert not result.overdose_threshold.startswith(">2 mg total")


# ── Overdose hard block ───────────────────────────────────────────────────────

def test_gentamicin_overdose_is_detected(drug):
    # 1.5 mg/kg x 120 kg = 180 mg, over the 160 mg single-dose maximum.
    dose, alerts = SafetyEngine.calculate_dose_kg(drug("gentamicin"), 120)
    assert dose == 180.0
    assert any("OVERDOSE" in a for a in alerts)


def test_gentamicin_dose_under_the_maximum_is_not_flagged(drug):
    # 1.5 mg/kg x 100 kg = 150 mg, within the 160 mg maximum.
    dose, alerts = SafetyEngine.calculate_dose_kg(drug("gentamicin"), 100)
    assert dose == 150.0
    assert alerts == []


def test_normal_paracetamol_dose_is_not_flagged(drug):
    dose, alerts = SafetyEngine.calculate_dose_kg(drug("paracetamol"), 70)
    assert dose == 1050.0
    assert alerts == []


# ── S5: unknown drugs must not read as "nothing to worry about" ───────────────

def test_uncovered_drug_is_reported_as_uncovered(formulary):
    from models.formulary import CoverageStatus

    assert formulary.coverage_status("paracetamol") is CoverageStatus.APPROVED
    assert formulary.coverage_status("rivaroxaban") is CoverageStatus.NOT_IN_FORMULARY


def test_uncovered_drug_yields_no_false_reassurance(formulary):
    """An empty list is indistinguishable from 'no contraindications known'."""
    missing = formulary.get("rivaroxaban")
    assert missing is None
    assert SafetyEngine.check_contraindications(missing, ["active bleeding"]) == []
    assert calculate_dose(missing, "rivaroxaban dose", 70) is None


# ── Contraindication and interaction matching ─────────────────────────────────

def test_contraindication_matches_on_whole_phrase(drug):
    alerts = SafetyEngine.check_contraindications(drug("morphine"), ["severe asthma"])
    assert len(alerts) == 1
    assert "morphine" in alerts[0].lower()


def test_contraindication_does_not_match_unrelated_condition(drug):
    alerts = SafetyEngine.check_contraindications(drug("morphine"), ["mild hypertension"])
    assert alerts == []


def test_interaction_is_detected(drug):
    alerts = SafetyEngine.check_interactions(drug("warfarin"), ["aspirin"])
    assert len(alerts) == 1


def test_high_risk_drugs_are_flagged(drug):
    assert SafetyEngine.high_risk_flag(drug("heparin"))
    assert SafetyEngine.high_risk_flag(drug("paracetamol")) == []


# ── Drug detection ────────────────────────────────────────────────────────────

def test_drug_detection_is_word_bounded(formulary):
    """The 'hep' alias must not fire on 'hepatic'."""
    assert formulary.find_in_text("patient has hepatic impairment") is None


def test_drug_detection_finds_aliases(formulary):
    entry = formulary.find_in_text("tylenol dose")
    assert entry is not None
    result = calculate_dose(entry, "tylenol dose", 70)
    assert result.drug_name.lower() == "paracetamol"


def test_longer_names_win_over_shorter_ones(formulary):
    """'ms contin' must not resolve through some other drug's shorter alias."""
    assert formulary.find_in_text("ms contin 10 mg").generic_name == "morphine"


# ── Parsing ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "text,expected",
    [
        ("dose for a 70 kg patient", 70.0),
        ("patient weighs 82.5 kg", 82.5),
        ("no weight here", None),
    ],
)
def test_extract_weight(text, expected):
    assert extract_weight(text) == expected


@pytest.mark.parametrize(
    "text,expected",
    [
        ("dose for a 6 year old", 6),
        ("dose for a 6-year-old child", 6),
        ("aged 45", 45),
        ("no age here", None),
    ],
)
def test_extract_age(text, expected):
    assert extract_age(text) == expected


# ── Fixture invariants ────────────────────────────────────────────────────────
# The same properties are asserted over the real seeded rows in
# tests/test_formulary_db.py and over incoming data in
# tests/test_formulary_import.py. Here they guard the fixture itself, so a
# careless edit to it cannot quietly weaken every test above.

def test_every_fixture_drug_declares_a_unit(formulary):
    for entry in formulary.all():
        assert entry.unit in ("mg", "unit"), f"{entry.generic_name}: {entry.unit!r}"


def test_no_fixture_drug_mixes_milligram_fields_with_unit_dosing(formulary):
    mg_fields = (
        "dose_per_kg",
        "adult_max_dose",
        "adult_max_daily",
        "overdose_threshold_absolute",
        "overdose_threshold_per_kg",
        "pediatric_min_per_kg",
    )
    for entry in formulary.all():
        if entry.unit == "mg":
            continue
        for field in mg_fields:
            assert not getattr(entry, field), (
                f"{entry.generic_name} is unit-dosed but sets {field}"
            )


def test_weight_scaled_thresholds_are_plausible(formulary):
    """
    A per-kg threshold below the per-kg dose would flag every therapeutic dose
    as an overdose — the enoxaparin defect, generalised.
    """
    for entry in formulary.all():
        if entry.overdose_threshold_per_kg and entry.dose_per_kg:
            assert entry.overdose_threshold_per_kg >= entry.dose_per_kg, (
                f"{entry.generic_name}: overdose threshold "
                f"{entry.overdose_threshold_per_kg}/kg is below the therapeutic "
                f"dose {entry.dose_per_kg}/kg"
            )


def test_absolute_thresholds_exceed_single_dose_maximums(formulary):
    for entry in formulary.all():
        if entry.overdose_threshold_absolute and entry.adult_max_dose:
            assert entry.overdose_threshold_absolute >= entry.adult_max_dose, (
                f"{entry.generic_name}: overdose threshold below max single dose"
            )


def test_no_calculated_dose_is_ever_produced_for_unit_dosed_drugs(formulary):
    for entry in formulary.all():
        if entry.auto_calculate:
            continue
        dose, alerts = SafetyEngine.calculate_dose_kg(entry, 70)
        assert dose is None, f"{entry.generic_name} produced a computed dose"
        assert alerts == []
