"""
The workbook converter decides what 620 drugs will say to a nurse, so these
lock the properties that make that safe.

The first test is the important one: the converter must never emit a numeric
dose field. The workbooks state doses as prose, and every dose defect this
branch fixed — pediatric ranges applied to adults, heparin in milligrams, a
per-kg threshold in an absolute field — came from a number being in a field
that did not mean what the number meant.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.formulary_import import INT_FIELDS, NUMERIC_FIELDS, validate
from tools.convert_jsh_workbooks import (
    OUT_HEADERS,
    build_rows,
    combine,
    inherited,
    labelled,
    prefix_families,
)


def formulary_row(name="Digoxin", page=71, **kw):
    base = {
        "Drug_Name": name,
        "Therapeutic_Class": "Cardiac glycoside",
        "Dosing_Adult": "0.25-0.5 mg initially; maintenance 0.125-0.25 mg daily",
        "Contraindications": "Heart block; WPW with AF",
        "Drug_Interactions": "Amiodarone raises levels",
        "Cautions_Warnings": "Narrow therapeutic index",
        "Administration": "Oral or slow IV",
        "Source_Page": page,
        "Reference_Standard": "JSH Drug Formulary 2026 — Approved by P&T Committee",
    }
    base.update(kw)
    return base


def iv_row(name="Digoxin", page=36, **kw):
    base = {
        "Medication_Name": name,
        "Record_Type": "IV_Injectable",
        "Package_Size_Initial_Strength": "500 mcg/2ml",
        "Diluents": "D5W, NS",
        "Full_Dosing_Administration_Stability_Text": "IVP over 5 min",
        "Source_Page": page,
        "Reference_Standard": "JSH Sterile Preparations Manual v2, 2026",
    }
    base.update(kw)
    return base


def convert(formulary=None, iv=None, curated=None):
    rows, notes, dupes = build_rows(
        formulary if formulary is not None else [],
        iv if iv is not None else [],
        curated or {},
        "JSH 2026",
    )
    return rows, notes, dupes


# ── The safety property ───────────────────────────────────────────────────────

def test_no_numeric_dose_field_is_ever_emitted():
    """
    The converter reads prose full of figures ("0.25-0.5 mg") and must put none
    of them in a numeric column. Parsing a range out of prose is how a
    pediatric figure ends up quoted to an adult.
    """
    rows, _, _ = convert([formulary_row()], [iv_row()])

    numeric = set(NUMERIC_FIELDS) | set(INT_FIELDS)
    assert numeric.isdisjoint(OUT_HEADERS)
    assert numeric.isdisjoint(rows[0])


def test_every_row_refuses_to_auto_calculate():
    rows, _, _ = convert([formulary_row()], [])
    assert rows[0]["auto_calculate"] == "no"


def test_a_converted_row_passes_the_importer():
    """The contract the importer enforces is met, not merely believed."""
    rows, _, _ = convert([formulary_row()], [iv_row()])
    parsed, error = validate(rows[0])

    assert error is None, error
    assert parsed["auto_calculate"] is False
    assert all(parsed[f] is None for f in NUMERIC_FIELDS)


def test_every_row_cites_a_page():
    rows, _, _ = convert([formulary_row(page=71)], [])
    assert "p.71" in rows[0]["source_ref"]


def test_the_pt_attribution_travels_verbatim():
    rows, _, _ = convert([formulary_row()], [])
    assert "Approved by P&T Committee" in rows[0]["source_name"]


# ── Merging, not discarding ───────────────────────────────────────────────────

def test_a_drug_in_both_workbooks_becomes_one_row_citing_both():
    rows, notes, _ = convert([formulary_row()], [iv_row()])

    assert len(rows) == 1
    assert "Drug Formulary p.71" in rows[0]["source_ref"]
    assert "IV Sterile Preparations Manual p.36" in rows[0]["source_ref"]
    assert notes["merged_across_workbooks"] == ["digoxin"]


def test_a_drug_listed_twice_in_one_sheet_keeps_both_indications():
    """
    Docusate sodium is an oral stool softener on p.21 and an ear-wax softener
    on p.414. Keeping only the first deletes a licensed indication.
    """
    rows, notes, _ = convert([
        formulary_row("Docusate sodium", page=21, Dosing_Adult="Oral: 100-200 mg BD"),
        formulary_row("Docusate sodium", page=414, Dosing_Adult="Fill the ear with drops"),
    ], [])

    assert len(rows) == 1
    assert "100-200 mg BD" in rows[0]["reference_regimen"]
    assert "Fill the ear with drops" in rows[0]["reference_regimen"]
    assert "p.21" in rows[0]["source_ref"] and "p.414" in rows[0]["source_ref"]
    assert notes["merged_within_sheet"] == ["docusate sodium"]


def test_combining_does_not_repeat_identical_text():
    same = {"reference_regimen": "A", "warnings": "", "contraindications": "",
            "interactions": "", "source_ref": "p.1", "unit": "mg", "route": ""}
    assert combine(same, dict(same))["reference_regimen"] == "A"


# ── Duplicate families ────────────────────────────────────────────────────────

def test_a_longer_preparation_name_is_reported_against_its_molecule():
    """heparin / heparin sodium — a whole word apart, so edit distance misses it."""
    families = prefix_families(["heparin", "heparin sodium", "morphine"])
    assert {"name": "heparin sodium", "extends": "heparin"} in families


def test_prefix_families_are_reported_not_merged():
    rows, notes, _ = convert([
        formulary_row("Heparin"), formulary_row("Heparin sodium"),
    ], [])
    # Both survive — which preparations are one entry is a pharmacist's call.
    assert {r["generic_name"] for r in rows} == {"heparin", "heparin sodium"}
    assert notes["prefix_families"]


def test_unrelated_short_names_are_not_treated_as_a_family():
    assert prefix_families(["iron", "zinc"]) == []


# ── Carrying curated data forward ─────────────────────────────────────────────

CURATED = {
    "heparin": {
        "name_ar": "هيبارين", "aliases": ["ufh"],
        "antidote": "Protamine sulfate", "high_risk": True,
    },
    "amoxicillin": {
        "name_ar": "أموكسيسيلين", "aliases": ["amoxil"],
        "antidote": "Supportive", "high_risk": False,
    },
}


def test_an_existing_drug_keeps_its_arabic_name_and_antidote():
    """
    Losing these would be silent: name_ar and aliases are not in the importer's
    CLINICAL_FIELDS, so the change report would not even mention them.
    """
    rows, _, _ = convert([formulary_row("Heparin")], [], CURATED)

    assert rows[0]["name_ar"] == "هيبارين"
    assert rows[0]["aliases"] == "ufh"
    assert rows[0]["antidote"] == "Protamine sulfate"
    assert rows[0]["high_risk"] == "yes"


def test_a_preparation_inherits_the_molecules_safety_fields():
    rows, _, _ = convert([formulary_row("Heparin sodium")], [], CURATED)

    assert rows[0]["antidote"] == "Protamine sulfate"
    assert rows[0]["high_risk"] == "yes"


def test_a_preparation_does_not_inherit_the_molecules_name():
    """
    Labelling a combination product with one component's Arabic name shows an
    Arabic-reading nurse the wrong drug name. Blank is honest; borrowed is not.
    """
    rows, _, _ = convert([formulary_row("Amoxicillin/clavulanic acid")], [], CURATED)

    assert rows[0]["name_ar"] == ""
    assert rows[0]["aliases"] == ""


def test_a_genuinely_new_drug_carries_nothing():
    rows, _, _ = convert([formulary_row("Rifaximin")], [], CURATED)

    assert rows[0]["name_ar"] == ""
    assert rows[0]["antidote"] == ""
    assert rows[0]["high_risk"] == "no"


def test_inherited_prefers_the_drugs_own_record():
    curated = dict(CURATED, **{"heparin sodium": {"antidote": "Its own", "high_risk": True}})
    assert inherited("heparin sodium", curated)["antidote"] == "Its own"


# ── Assembly ──────────────────────────────────────────────────────────────────

def test_blank_workbook_columns_produce_no_empty_labels():
    assert labelled([("A", "one"), ("B", ""), ("C", None), ("D", "NA")]) == "A: one"


def test_a_row_with_no_regimen_text_is_dropped_rather_than_imported_empty():
    rows, _, _ = convert([formulary_row("Ghost", Therapeutic_Class="",
                                        Dosing_Adult="", Administration="",
                                        Dosage_Form_Strength="")], [])
    assert rows == []
