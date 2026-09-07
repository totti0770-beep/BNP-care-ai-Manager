"""
A reference regimen must reach the nurse as fields, not as a wall of text.

`tools/convert_jsh_workbooks.py` builds each drug's regimen by joining the
hospital's workbook columns as `Label: value | Label: value`. The engine then
handed that whole string to the client in one field captioned "Safe range", and
the web app printed it in a single monospace paragraph with no clamp. For
vancomycin — 6,162 characters across 11 fields, the longest row in the
formulary — the dose panel became a page of scrolling. 434 of the 620 shipped
rows are over 1,000 characters, so it was not one bad row.

Splitting it back apart is mechanical, because the labels are a closed set this
repository writes itself. These tests pin that contract from both ends: the
seven shapes the splitter must handle, and every regimen actually shipped.
"""
import csv
from pathlib import Path

import pytest

from models.formulary import CoverageStatus  # noqa: F401  (imported by the module under test)
from services.drug_calculator import (
    KNOWN_REGIMEN_LABELS,
    PRIMARY_REGIMEN_LABELS,
    calculate_dose,
    split_regimen,
)

from tests.formulary_fixture import entry


# A real vancomycin fragment, shortened. The colons inside the value are the
# point: "Usual dosage range: Note: ..." must not become three sections.
ADULT_DOSING = (
    "Usual dosage range: Note: Initial IV dosing in nonobese patients should be "
    "based on actual body weight; subsequent dosing should generally be adjusted "
    "based on serum trough vancomycin concentrations and renal function. "
    "IV: 15 to 20 mg/kg/dose every 8 to 12 hours (ASHP/IDSA/SIDP [Rybak 2009])."
)

FORMULARY_SHAPE = (
    "Therapeutic class: Antibiotic, Glycopeptide"
    " | Indications: Infections caused by staphylococci (including MRSA)."
    " | Dosage form and strength: Injection 500 mg."
    f" | Adult dosing: {ADULT_DOSING}"
    " | Pediatric dosing: 10 to 15 mg/kg/dose every 6 hours."
    " | Renal/hepatic adjustment: Adjust interval to CrCl."
    " | Administration: IV infusion over 60 minutes."
    " | Prescriber authority: ID consultant."
    " | Additional notes: Monitor trough before the fourth dose."
)

IV_MANUAL_SHAPE = (
    "Package size / initial strength: Vial 500 mg"
    " | Final concentration: 5 mg/mL"
    " | Final volume: 100 mL"
    " | Diluents: NS, D5W"
    " | Preparation, administration and stability: Infuse over 60 minutes;"
    " stable 24 hours at room temperature."
)


def labels(sections):
    return [s.label for s in sections]


def test_the_formulary_sheet_shape_splits_into_its_nine_fields():
    sections = split_regimen(FORMULARY_SHAPE)

    assert labels(sections) == [
        "Therapeutic class",
        "Indications",
        "Dosage form and strength",
        "Adult dosing",
        "Pediatric dosing",
        "Renal/hepatic adjustment",
        "Administration",
        "Prescriber authority",
        "Additional notes",
    ]


def test_the_iv_manual_shape_splits_into_its_five_fields():
    sections = split_regimen(IV_MANUAL_SHAPE)

    assert labels(sections) == [
        "Package size / initial strength",
        "Final concentration",
        "Final volume",
        "Diluents",
        "Preparation, administration and stability",
    ]


def test_a_drug_in_both_workbooks_keeps_every_field():
    """`combine()` joins the two regimens, which is how the longest rows arise."""
    sections = split_regimen(f"{FORMULARY_SHAPE} | {IV_MANUAL_SHAPE}")

    assert len(sections) == 14
    assert labels(sections)[8] == "Additional notes"
    assert labels(sections)[9] == "Package size / initial strength"


def test_a_colon_inside_a_value_does_not_start_a_new_section():
    """
    The defect a naive `split(':')` would introduce.

    Dosing text is full of colons. Splitting on them would cut this value into
    "Usual dosage range", "Note", and a remainder — three fragments, one of
    which is the actual dose, none of which say so.
    """
    sections = split_regimen(FORMULARY_SHAPE)
    adult = next(s for s in sections if s.label == "Adult dosing")

    assert adult.text == ADULT_DOSING
    assert "15 to 20 mg/kg/dose" in adult.text
    assert "Note:" in adult.text


def test_bedside_fields_are_primary_and_reference_fields_are_not():
    sections = split_regimen(f"{FORMULARY_SHAPE} | {IV_MANUAL_SHAPE}")
    primary = {s.label for s in sections if s.primary}

    assert primary == {
        "Adult dosing",
        "Pediatric dosing",
        "Renal/hepatic adjustment",
        "Final concentration",
        "Final volume",
        "Diluents",
        "Preparation, administration and stability",
    }
    # Reference material, one click away rather than gone.
    assert {"Therapeutic class", "Indications"}.isdisjoint(primary)


def test_unrecognised_text_is_kept_whole_and_shown():
    """
    Seeded rows predate the workbooks and carry free text.

    Not knowing what a piece of clinical text is, is a reason to show it — never
    to fold it away or to guess a label out of it.
    """
    sections = split_regimen("Prophylaxis: 5000 units SC q8-12h.")

    assert len(sections) == 1
    assert sections[0].label == ""
    assert sections[0].text == "Prophylaxis: 5000 units SC q8-12h."
    assert sections[0].primary is True


def test_empty_input_yields_no_sections():
    assert split_regimen("") == []
    assert split_regimen(None) == []
    assert split_regimen("   ") == []


def test_every_primary_label_is_also_a_known_label():
    assert PRIMARY_REGIMEN_LABELS <= KNOWN_REGIMEN_LABELS


# ── The shipped corpus ────────────────────────────────────────────────────────

CSV_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "formulary"
    / "jsh_workbooks_import.csv"
)


def _shipped_regimens():
    csv.field_size_limit(10_000_000)
    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            regimen = (row.get("reference_regimen") or "").strip()
            if regimen:
                yield row["generic_name"], regimen


@pytest.mark.skipif(not CSV_PATH.exists(), reason="import file not in this tree")
def test_every_shipped_regimen_splits_into_known_labels():
    """
    The converter and the splitter must not drift apart.

    A new column added to `convert_jsh_workbooks.py` without a matching label
    here would silently demote that field to unlabelled text, and it would be
    the tests that never noticed.
    """
    unlabelled = []
    for name, regimen in _shipped_regimens():
        for section in split_regimen(regimen):
            if not section.label:
                unlabelled.append((name, section.text[:80]))

    assert not unlabelled, (
        f"{len(unlabelled)} shipped regimen segments carry no recognised label; "
        f"first few: {unlabelled[:3]}"
    )


@pytest.mark.skipif(not CSV_PATH.exists(), reason="import file not in this tree")
def test_the_worst_row_becomes_readable_fields():
    """vancomycin is the longest regimen in the formulary; it is the case to beat."""
    regimen = dict(_shipped_regimens())["vancomycin"]
    sections = split_regimen(regimen)

    assert len(regimen) > 6000, "the row this test exists for has changed shape"
    assert len(sections) >= 10
    # Every character still travels; nothing is summarised or dropped.
    assert sum(len(s.text) for s in sections) > 0.9 * len(regimen)
    assert any(s.primary for s in sections), "no bedside field would be shown"


# ── Through calculate_dose ────────────────────────────────────────────────────


def test_a_protocol_dosed_drug_returns_its_regimen_in_sections():
    drug = entry(
        "vancomycin", auto_calculate=False, reference_regimen=FORMULARY_SHAPE
    )

    result = calculate_dose(drug, "vancomycin dose", 70.0, 40)

    assert result is not None
    assert [s.label for s in result.regimen_sections][:2] == [
        "Therapeutic class",
        "Indications",
    ]


def test_a_computed_dose_carries_no_sections():
    """`safe_range` is a real range there, and a range has nothing to split."""
    drug = entry(
        "paracetamol",
        dose_per_kg=15.0,
        adult_flat_min=500.0,
        adult_flat_max=1000.0,
        adult_max_daily=4000.0,
    )

    result = calculate_dose(drug, "paracetamol dose", 70.0, 40)

    assert result is not None
    assert result.regimen_sections == []


def test_the_reason_given_is_the_missing_signoff_not_the_unit():
    """
    The old wording said the drug "is dosed in mgs per protocol".

    That branch was written for drugs dosed in international units. The JSH P&T
    import set auto_calculate=no on every row, so 620 milligram-dosed drugs began
    getting a reason that is not the reason — nobody signed off a number, which
    is a different thing from the unit.
    """
    drug = entry(
        "vancomycin", auto_calculate=False, reference_regimen=FORMULARY_SHAPE
    )

    result = calculate_dose(drug, "vancomycin dose", 70.0, 40)

    assert result is not None
    assert "per protocol" not in result.calculated_dose
    assert "mgs" not in result.calculated_dose
    assert "signed" in result.calculated_dose.lower()


def test_the_reason_is_arabic_for_an_arabic_question():
    """An Arabic reader was getting this safety line in English only."""
    drug = entry(
        "vancomycin", auto_calculate=False, reference_regimen=FORMULARY_SHAPE
    )

    result = calculate_dose(drug, "ما جرعة الفانكومايسين؟", 70.0, 40)

    assert result is not None
    assert "لم تُحسب الجرعة" in result.calculated_dose
