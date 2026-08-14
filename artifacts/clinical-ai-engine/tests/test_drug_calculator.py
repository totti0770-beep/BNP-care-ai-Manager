"""
Regression tests for the medication safety layer.

Every test here corresponds to a defect that produced clinically unsafe output.
Treat a failure as a patient-safety incident, not a broken build.
"""
import pytest

from services.drug_calculator import (
    DRUG_DB,
    PEDIATRIC_AGE_LIMIT,
    SafetyEngine,
    calculate_dose,
    extract_age,
    extract_weight,
    is_covered,
)


# ── S1: pediatric ranges must never be applied to adults ──────────────────────

def test_adult_morphine_does_not_use_pediatric_range():
    """
    A 70 kg adult must get the adult 2-4 mg range, not the pediatric
    0.05-0.1 mg/kg range (3.5-7 mg). Regression for the defect where any query
    carrying a weight took the pediatric branch.
    """
    result = calculate_dose("morphine dose", weight_kg=70, age_years=45)
    assert result is not None
    assert "pediatric" not in result.calculated_dose.lower()
    assert "adult" in result.calculated_dose.lower()


def test_weight_without_age_uses_adult_range():
    """Weight alone must not imply a child — adults and children can weigh the same."""
    result = calculate_dose("morphine dose", weight_kg=70)
    assert result is not None
    assert "pediatric" not in result.calculated_dose.lower()
    assert any("age was not provided" in w.lower() for w in result.warnings)


def test_pediatric_range_used_when_age_is_known():
    result = calculate_dose("morphine dose", weight_kg=20, age_years=6)
    assert result is not None
    assert "pediatric" in result.calculated_dose.lower()
    # 0.05-0.1 mg/kg x 20 kg
    assert "1.0" in result.calculated_dose and "2.0" in result.calculated_dose


@pytest.mark.parametrize("age", [PEDIATRIC_AGE_LIMIT, PEDIATRIC_AGE_LIMIT + 10, 90])
def test_ages_at_or_above_limit_are_adult(age):
    result = calculate_dose("ibuprofen dose", weight_kg=70, age_years=age)
    assert result is not None
    assert "pediatric" not in result.calculated_dose.lower()


# ── S2: unit-dosed drugs must not produce a computed milligram figure ─────────

def test_heparin_is_not_calculated_in_milligrams():
    """Heparin is dosed in units. Reporting mg/kg for it invites a fatal error."""
    result = calculate_dose("heparin dose", weight_kg=80)
    assert result is not None
    assert "not calculated" in result.calculated_dose.lower()
    assert "mg/dose" not in result.calculated_dose


def test_insulin_is_not_calculated():
    result = calculate_dose("insulin dose", weight_kg=80)
    assert result is not None
    assert "not calculated" in result.calculated_dose.lower()


def test_unit_dosed_drugs_declare_their_unit_and_opt_out():
    for name in ("heparin", "insulin"):
        assert DRUG_DB[name]["unit"] == "unit"
        assert DRUG_DB[name]["auto_calculate"] is False


# ── S3: weight-scaled thresholds must scale ───────────────────────────────────

def test_enoxaparin_therapeutic_dose_is_not_flagged_as_overdose():
    """
    1 mg/kg is the therapeutic dose. With the threshold stored as an absolute
    2 mg, a normal 70 mg dose was reported as a 35x overdose requiring protamine.
    """
    dose, alerts = SafetyEngine.calculate_dose_kg("enoxaparin", 70)
    assert dose == 70.0
    assert alerts == []


def test_enoxaparin_overdose_threshold_scales_with_weight():
    result = calculate_dose("enoxaparin dose", weight_kg=70)
    assert result is not None
    # 2 mg/kg x 70 kg = 140 mg, not a bare "2 mg".
    assert "140" in result.overdose_threshold
    assert not result.overdose_threshold.startswith(">2 mg total")


# ── Overdose hard block ───────────────────────────────────────────────────────

def test_gentamicin_overdose_is_detected():
    # 1.5 mg/kg x 120 kg = 180 mg, over the 160 mg single-dose maximum.
    dose, alerts = SafetyEngine.calculate_dose_kg("gentamicin", 120)
    assert dose == 180.0
    assert any("OVERDOSE" in a for a in alerts)


def test_gentamicin_dose_under_the_maximum_is_not_flagged():
    # 1.5 mg/kg x 100 kg = 150 mg, within the 160 mg maximum.
    dose, alerts = SafetyEngine.calculate_dose_kg("gentamicin", 100)
    assert dose == 150.0
    assert alerts == []


def test_normal_paracetamol_dose_is_not_flagged():
    dose, alerts = SafetyEngine.calculate_dose_kg("paracetamol", 70)
    assert dose == 1050.0
    assert alerts == []


# ── S5: unknown drugs must not read as "nothing to worry about" ───────────────

def test_uncovered_drug_is_reported_as_uncovered():
    assert is_covered("paracetamol") is True
    assert is_covered("rivaroxaban") is False


def test_uncovered_drug_yields_no_false_reassurance():
    """An empty list is indistinguishable from 'no contraindications known'."""
    assert SafetyEngine.check_contraindications("rivaroxaban", ["active bleeding"]) == []
    assert calculate_dose("rivaroxaban dose", weight_kg=70) is None


# ── Contraindication and interaction matching ─────────────────────────────────

def test_contraindication_matches_on_whole_phrase():
    alerts = SafetyEngine.check_contraindications("morphine", ["severe asthma"])
    assert len(alerts) == 1
    assert "morphine" in alerts[0].lower()


def test_contraindication_does_not_match_unrelated_condition():
    alerts = SafetyEngine.check_contraindications("morphine", ["mild hypertension"])
    assert alerts == []


def test_interaction_is_detected():
    alerts = SafetyEngine.check_interactions("warfarin", ["aspirin"])
    assert len(alerts) == 1


def test_high_risk_drugs_are_flagged():
    assert SafetyEngine.high_risk_flag("heparin")
    assert SafetyEngine.high_risk_flag("paracetamol") == []


# ── Drug detection ────────────────────────────────────────────────────────────

def test_drug_detection_is_word_bounded():
    """The 'hep' alias must not fire on 'hepatic'."""
    assert calculate_dose("patient has hepatic impairment") is None


def test_drug_detection_finds_aliases():
    result = calculate_dose("tylenol dose", weight_kg=70)
    assert result is not None
    assert result.drug_name.lower() == "paracetamol"


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


# ── Whole-database invariants ─────────────────────────────────────────────────

def test_every_drug_declares_a_unit():
    for name, data in DRUG_DB.items():
        assert "unit" in data, f"{name} has no unit"
        assert data["unit"] in ("mg", "unit"), f"{name} has unit {data['unit']!r}"


def test_no_drug_mixes_milligram_fields_with_unit_dosing():
    """A unit-dosed drug must not carry mg-denominated numeric fields."""
    mg_fields = (
        "dose_per_kg",
        "adult_max_dose_mg",
        "adult_max_daily_mg",
        "overdose_threshold_adult_mg",
        "overdose_threshold_mg_per_kg",
        "pediatric_mg_per_kg",
    )
    for name, data in DRUG_DB.items():
        if data["unit"] != "unit":
            continue
        for field in mg_fields:
            assert not data.get(field), f"{name} is unit-dosed but sets {field}"


def test_weight_scaled_thresholds_are_plausible():
    """
    A per-kg threshold below the per-kg dose would flag every therapeutic dose
    as an overdose — the enoxaparin defect, generalised.
    """
    for name, data in DRUG_DB.items():
        per_kg_max = data.get("overdose_threshold_mg_per_kg")
        dose_per_kg = data.get("dose_per_kg")
        if per_kg_max and dose_per_kg:
            assert per_kg_max >= dose_per_kg, (
                f"{name}: overdose threshold {per_kg_max}/kg is below the "
                f"therapeutic dose {dose_per_kg}/kg"
            )


def test_absolute_thresholds_exceed_single_dose_maximums():
    for name, data in DRUG_DB.items():
        absolute = data.get("overdose_threshold_adult_mg")
        single = data.get("adult_max_dose_mg")
        if absolute and single:
            assert absolute >= single, f"{name}: overdose threshold below max single dose"


def test_no_calculated_dose_is_ever_produced_for_unit_dosed_drugs():
    for name, data in DRUG_DB.items():
        if data.get("auto_calculate") is False:
            dose, alerts = SafetyEngine.calculate_dose_kg(name, 70)
            assert dose is None, f"{name} produced a computed dose"
            assert alerts == []
