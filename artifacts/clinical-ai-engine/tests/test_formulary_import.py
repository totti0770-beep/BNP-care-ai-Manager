"""
The import pipeline is the only door clinical numbers come through, so these
tests are about what it refuses.

Each rejection rule corresponds to a defect that produced unsafe output before
the data was governed. `validate()` is pure, so most of this needs no database;
the round-trip behaviour that does is in tests/test_formulary_db.py.
"""
import pytest

from services.formulary_import import (
    FormularyFileError,
    load_mapping,
    read_table,
    validate,
)


def row(**kw):
    """A minimal valid row, overridden per test."""
    base = {
        "generic_name": "Paracetamol",
        "unit": "mg",
        "source_name": "Hospital formulary",
        "source_ref": "p.14",
        "dose_per_kg": "15",
        "adult_flat_min": "500",
        "adult_flat_max": "1000",
        "adult_max_daily": "4000",
        "overdose_threshold_absolute": "7500",
    }
    base.update(kw)
    return base


def reason(**kw) -> str:
    parsed, err = validate(row(**kw))
    assert parsed is None, f"expected a rejection, got {parsed}"
    return err


# ── A good row survives ───────────────────────────────────────────────────────

def test_a_valid_row_is_accepted():
    parsed, err = validate(row())
    assert err is None
    assert parsed["generic_name"] == "paracetamol"
    assert parsed["dose_per_kg"] == 15.0
    assert parsed["adult_flat_min"] == 500.0


def test_names_are_normalised_for_lookup():
    parsed, _ = validate(row(generic_name="  ParaCetaMol  "))
    assert parsed["generic_name"] == "paracetamol"


def test_lists_accept_either_separator():
    parsed, _ = validate(row(contraindications="liver disease | alcohol use"))
    assert parsed["contraindications"] == ["liver disease", "alcohol use"]
    parsed, _ = validate(row(interactions="warfarin; isoniazid"))
    assert parsed["interactions"] == ["warfarin", "isoniazid"]


# ── Provenance is not optional ────────────────────────────────────────────────

def test_a_row_without_a_source_is_rejected():
    """A dose figure with no citable origin is the thing this exists to stop."""
    assert "source_name is required" in reason(source_name="")


def test_a_row_without_a_source_reference_is_rejected():
    assert "source_ref is required" in reason(source_ref="  ")


def test_a_row_without_a_name_is_rejected():
    assert "generic_name is required" in reason(generic_name="")


# ── S2: units ─────────────────────────────────────────────────────────────────

def test_an_undeclared_unit_is_rejected():
    assert "not one of" in reason(unit="IU")


def test_a_unit_dosed_drug_may_not_carry_milligram_figures():
    """Heparin was modelled in milligrams. It is dosed in international units."""
    err = reason(unit="unit", dose_per_kg="0.7", adult_max_daily="5000")
    assert "milligram fields are set" in err
    assert "dose_per_kg" in err


def test_a_unit_dosed_drug_is_forced_off_auto_calculation():
    parsed, err = validate(
        {
            "generic_name": "heparin",
            "unit": "unit",
            "source_name": "Hospital formulary",
            "source_ref": "p.31",
            "auto_calculate": "yes",
            "reference_regimen": "Prophylaxis: 5000 units SC q8-12h",
        }
    )
    assert err is None
    assert parsed["auto_calculate"] is False


def test_a_unit_dosed_drug_needs_a_regimen_to_show():
    err = reason(unit="unit", dose_per_kg="", adult_flat_min="", adult_flat_max="",
                 adult_max_daily="", overdose_threshold_absolute="")
    assert "reference_regimen" in err


# ── S3: overdose thresholds ───────────────────────────────────────────────────

def test_a_per_kg_value_in_the_absolute_field_is_rejected():
    """
    The enoxaparin defect: `overdose_threshold_adult_mg: 2` was a per-kg value,
    so a normal 70 mg dose read as a 35x overdose requiring protamine.
    """
    err = reason(
        generic_name="enoxaparin",
        dose_per_kg="1",
        adult_flat_min="",
        adult_flat_max="",
        adult_max_daily="180",
        overdose_threshold_absolute="2",
    )
    assert "below" in err
    assert "overdose_threshold_per_kg" in err


def test_an_absolute_threshold_below_the_single_dose_maximum_is_rejected():
    err = reason(
        adult_max_daily="",
        adult_max_dose="160",
        overdose_threshold_absolute="100",
    )
    assert "adult_max_dose" in err


def test_a_per_kg_threshold_below_the_per_kg_dose_is_rejected():
    """It would flag every therapeutic dose as an overdose."""
    err = reason(
        dose_per_kg="15",
        overdose_threshold_absolute="",
        overdose_threshold_per_kg="10",
    )
    assert "every therapeutic dose" in err


def test_a_single_dose_ceiling_above_the_daily_ceiling_is_rejected():
    err = reason(adult_max_dose="5000", adult_max_daily="4000",
                 overdose_threshold_absolute="7500")
    assert "exceeds" in err


# ── S1: paired bounds ─────────────────────────────────────────────────────────

def test_a_lone_pediatric_bound_is_rejected():
    """A half-set range silently disables the pediatric branch."""
    err = reason(pediatric_min_per_kg="10")
    assert "must both be set" in err


def test_a_lone_adult_bound_is_rejected():
    assert "must both be set" in reason(adult_flat_max="")


def test_an_inverted_range_is_rejected():
    err = reason(adult_flat_min="1000", adult_flat_max="500")
    assert "greater than" in err


# ── Numbers must be numbers ───────────────────────────────────────────────────

def test_a_non_numeric_dose_is_rejected():
    assert "is not a number" in reason(dose_per_kg="15 mg/kg")


def test_a_negative_dose_is_rejected():
    assert "negative" in reason(dose_per_kg="-15")


def test_thousands_separators_are_tolerated():
    parsed, err = validate(row(adult_max_daily="4,000"))
    assert err is None
    assert parsed["adult_max_daily"] == 4000.0


def test_a_row_that_can_say_nothing_is_rejected():
    err = reason(
        dose_per_kg="", adult_flat_min="", adult_flat_max="",
        adult_max_daily="", overdose_threshold_absolute="",
    )
    assert "cannot tell a nurse anything" in err


# ── Column mapping ────────────────────────────────────────────────────────────

def test_mapping_reads_canonical_to_source_pairs():
    mapping = load_mapping(
        "# a comment\n"
        "generic_name: Generic Name\n"
        "adult_max_daily: Max Daily Dose\n"
        "\n"
        "not_a_field: Ignored\n"
    )
    assert mapping == {
        "generic_name": "Generic Name",
        "adult_max_daily": "Max Daily Dose",
    }


def test_mapping_ignores_unknown_canonical_fields():
    """A typo in a mapping must not become a silently dropped column."""
    assert load_mapping("adult_max_dailyy: Max Daily") == {}


def test_the_shipped_example_mapping_parses():
    from pathlib import Path

    here = Path(__file__).resolve().parent.parent
    text = (here / "config" / "formulary_mapping.example.txt").read_text()
    mapping = load_mapping(text)
    for required in ("generic_name", "unit", "source_name", "source_ref"):
        assert required in mapping


# ── File reading ──────────────────────────────────────────────────────────────

def test_csv_is_read_with_its_header():
    headers, rows = read_table(
        b"generic_name,unit\nparacetamol,mg\n", "f.csv"
    )
    assert headers == ["generic_name", "unit"]
    assert rows == [["paracetamol", "mg"]]


def test_a_byte_order_mark_does_not_corrupt_the_first_header():
    """Excel writes UTF-8 CSV with a BOM, which would break the first column."""
    headers, _ = read_table(b"\xef\xbb\xbfgeneric_name,unit\n", "f.csv")
    assert headers[0] == "generic_name"


def test_an_unsupported_file_type_is_refused():
    with pytest.raises(FormularyFileError):
        read_table(b"%PDF-1.4", "formulary.pdf")


def test_xlsx_is_read():
    from openpyxl import Workbook
    import io

    wb = Workbook()
    ws = wb.active
    ws.append(["generic_name", "unit"])
    ws.append(["paracetamol", "mg"])
    buf = io.BytesIO()
    wb.save(buf)

    headers, rows = read_table(buf.getvalue(), "formulary.xlsx")
    assert headers == ["generic_name", "unit"]
    assert rows[0][0] == "paracetamol"
