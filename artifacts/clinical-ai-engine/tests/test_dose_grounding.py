"""
A dose figure in the prose must have come from the approved path.

`check_answer` was the only thing that ever inspected the generated answer, and
it looks for hedging words, not for numbers. Meanwhile `BNP_SYSTEM_PROMPT` told
the model "→ Calculate dosage if patient weight is provided" while showing it
neither the formulary, nor the computed dose, nor the drug's coverage status.

The structured `dose` field was protected — `routers/query.py` lets the engine's
value win. The sentence a nurse actually reads was not. So for a drug pending
pharmacist review, `dose` could correctly say no figure had been signed off
while `answer`, immediately above it, stated a milligram number the model had
worked out from a PDF page.

The rule these tests pin is the distinction the brief draws: quoting an approved
source is intended, and doing arithmetic on it is forbidden. A figure present in
neither the formulary row nor any retrieved passage was computed by the model,
and the model has no formulary to compute from.
"""
import pytest

from services.safety_layer import check_dose_is_grounded, dose_figures


REGIMEN = (
    "Adult dosing: IV: 15 to 20 mg/kg/dose every 8 to 12 hours "
    "| Final concentration: 5 mg/mL "
    "| Package size / initial strength: Vial 500 mg"
)


def grounded(answer, **kw):
    kw.setdefault("approved_text", REGIMEN)
    kw.setdefault("enforced", True)
    return check_dose_is_grounded(answer, 0.8, **kw).is_safe


# ── The defect ───────────────────────────────────────────────────────────────


def test_a_figure_the_model_worked_out_is_refused():
    """
    70 kg x 15 mg/kg = 1050 mg. The multiplication is the problem: 1050 appears
    nowhere in the approved sources, so the model produced it.
    """
    assert not grounded("For a 70 kg patient give 1050 mg IV every 12 hours.")


def test_the_refusal_names_the_reason():
    result = check_dose_is_grounded(
        "Give 1050 mg IV.", 0.8, approved_text=REGIMEN, enforced=True
    )
    assert not result.is_safe
    assert "approved formulary did not produce" in result.rejection_reason


def test_an_arabic_answer_is_checked_too():
    """An Arabic hedge already slips past check_answer; a figure must not."""
    assert not grounded("أعطِ 1050 ملغم وريدياً كل 12 ساعة")
    assert grounded("الجرعة 500 ملغم حسب المصدر")  # the vial strength, quoted


# ── What must still be allowed ───────────────────────────────────────────────


def test_a_range_quoted_from_the_record_is_allowed():
    """Quoting the hospital's own manual is the intended behaviour."""
    assert grounded("The source states 15 to 20 mg/kg per dose.")


def test_a_reformatted_quotation_survives():
    """
    The figures are compared, not the prose. A model that writes "15–20 mg/kg"
    where the source wrote "15 to 20 mg/kg" is quoting, and a literal string
    check would refuse it.
    """
    assert grounded("Dose: 15–20 mg/kg every 8–12 h.")


def test_the_engine_own_calculation_is_allowed():
    assert grounded(
        "Give 1050 mg IV.",
        approved_dose="1050.0 mg/dose (adult 15.0 mg/kg × 70.0 kg)",
    )


def test_a_figure_quoted_from_a_retrieved_passage_is_allowed():
    """
    The corpus is the hospital's own indexed documents. A nurse asking for a
    dose should get what the manual says, and the manual is an approved source
    even when the formulary row carries no computed figure.
    """
    assert grounded(
        "The protocol allows up to 2 g per dose initially.",
        approved_text=REGIMEN + "\nusual maximum: 2 g/dose initially",
    )


def test_an_answer_with_no_figure_at_all_is_allowed():
    assert grounded("No dose has been calculated for this medication.")
    assert grounded("")


# ── Where the gate must not fire ─────────────────────────────────────────────


def test_the_gate_is_off_where_a_number_is_not_a_dose_instruction():
    """
    A preparation volume and an infusion concentration are product properties.
    Enforcing a dosing rule there manufactures refusals on correct answers.
    """
    assert grounded(
        "Reconstitute with 10 mL, then dilute to 250 mL of NS.", enforced=False
    )


def test_durations_and_page_numbers_are_not_doses():
    assert grounded("Infuse over 60 minutes. See JSH Drug Formulary 2026 page 36.")


def test_a_concentration_is_not_a_dose():
    """"5 mg/mL" describes the product; it is not an instruction to give 5 mg."""
    assert dose_figures("Final concentration 5 mg/mL") == set()


# ── The comparison itself ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "text,expected",
    [
        ("give 750 mg", {(750.0, "mg")}),
        ("2 g/dose", {(2.0, "g")}),
        ("5000 units SC", {(5000.0, "unit")}),
        ("1.5 mg and 0.25 mg", {(1.5, "mg"), (0.25, "mg")}),
        ("750 ملغم", {(750.0, "mg")}),
        ("over 60 minutes", set()),
        ("page 36", set()),
    ],
)
def test_figures_are_extracted_with_their_units(text, expected):
    assert dose_figures(text) == expected
