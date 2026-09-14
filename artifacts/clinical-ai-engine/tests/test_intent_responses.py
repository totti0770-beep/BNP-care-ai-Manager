"""
The whole pipeline, one intent at a time.

The reported defect was that a nurse asking "كيف احسب جرعه الvancomycin" got the
drug's entire record — 6,162 characters across 11 fields. The cause was
architectural: every medication question was classified `DRUG` and nothing
further, so every medication question produced the same payload.

These run the real `routers/query.py` against the stubbed retriever, generator
and audit recorder in `conftest.py`, so what they assert is the assembled HTTP
response, not a unit's return value. The three cases at the end are the
production-equivalent ones from the brief, run end to end.

Nothing here truncates. `dose_sections` narrows to the fields the question asked
about; `FULL_DRUG_INFO` still returns all of them, and `calculate_dose` still
returns the whole record — the narrowing happens in the router so the calculator
and the web component both keep their contracts.
"""
import pytest

from models.schemas import ClinicalIntent

from tests.formulary_fixture import build_formulary, entry


REGIMEN = (
    "Therapeutic class: Antibiotic, Glycopeptide"
    " | Indications: Staphylococcal infections including MRSA."
    " | Dosage form and strength: Injection 500 mg."
    " | Adult dosing: IV: 15 to 20 mg/kg/dose every 8 to 12 hours."
    " | Pediatric dosing: 10 to 15 mg/kg/dose every 6 hours."
    " | Renal/hepatic adjustment: Adjust the interval to creatinine clearance."
    " | Administration: Infuse over at least 60 minutes."
    " | Final concentration: 5 mg/mL"
    " | Final volume: 100 mL"
    " | Diluents: NS or D5W"
    " | Preparation, administration and stability: Reconstitute with 10 mL"
    " sterile water; stable 24 hours refrigerated."
)

WARNINGS = [
    "Cautions and warnings: Infusion-related reactions with rapid infusion.",
    "Adverse drug reactions: Nephrotoxicity, ototoxicity.",
    "Monitoring: Trough level before the fourth dose; renal function.",
    "Pregnancy category: B",
    "Lactation: Compatible",
    "Storage: 2-8 C after reconstitution.",
]


def vancomycin(**kw):
    """A protocol-dosed drug, as every JSH row is: no figures, a full regimen."""
    defaults = dict(
        auto_calculate=False,
        reference_regimen=REGIMEN,
        warnings=list(WARNINGS),
        antidote="supportive care; haemodialysis",
        high_risk=True,
    )
    defaults.update(kw)
    return entry("vancomycin", **defaults)


def morphine(**kw):
    """An approved, weight-based drug — the only shape that can be computed."""
    defaults = dict(
        dose_per_kg=0.1,
        adult_flat_min=2.0,
        adult_flat_max=4.0,
        adult_max_daily=120.0,
        antidote="naloxone",
        high_risk=True,
    )
    defaults.update(kw)
    return entry("morphine", **defaults)


def ask(engine, question, drug=None, **body):
    """Post a question and return the parsed payload."""
    formulary = build_formulary([drug or vancomycin()])
    client, audit = engine(formulary=formulary, answer="Clinical answer.")
    payload = client.post("/query/", json={"question": question, **body}).json()
    return payload, audit


def labels(payload):
    return [s["label"] for s in (payload.get("dose_sections") or [])]


# ── Test 1: the reported question ────────────────────────────────────────────


def test_a_calculation_without_patient_values_asks_for_them(engine):
    """
    Brief, Test 1, on a drug that *can* be computed.

    No weight, so no calculation is attempted and no record is dumped — the
    nurse asked for a number, not for the monograph. The drug name is Latin
    inside an Arabic sentence because that is how it is typed on a phone.
    """
    payload, _ = ask(engine, "كيف احسب جرعه الmorphine", drug=morphine())

    assert payload["intent"] == ClinicalIntent.DOSE_CALCULATION.value
    assert payload["query_type"] == "drug"
    assert payload["missing_variables"] == ["patient_weight_kg"]
    assert payload["dose"] is None
    assert payload["dose_sections"] is None


def test_the_request_for_values_is_arabic_for_an_arabic_question(engine):
    payload, _ = ask(engine, "كيف احسب جرعه الmorphine", drug=morphine())

    assert "وزن المريض" in payload["answer"]
    assert "لم تُحسب أي جرعة" in payload["answer"]


def test_no_figure_is_invented_while_values_are_missing(engine):
    """Brief, Test 6: no invented values, only a request for the missing ones."""
    payload, _ = ask(engine, "كيف احسب جرعه الmorphine", drug=morphine())

    body = str(payload)
    for invented in ("7.0", "0.1 mg/kg", "2-4 mg", "120"):
        assert invented not in payload["answer"], f"answer stated {invented}"
    assert payload["dose"] is None


def test_the_full_record_never_appears_in_a_calculation_answer(engine):
    """The defect, stated directly: no monograph in the short answer."""
    payload, _ = ask(engine, "كيف احسب جرعه الvancomycin")

    body = str(payload)
    assert "Therapeutic class" not in body
    assert "Storage" not in body
    assert len(payload["answer"]) < 600


# ── Test 5: complete inputs ──────────────────────────────────────────────────


def test_a_complete_calculation_returns_the_engine_figure(engine):
    """
    Brief, Test 5. The dose, its basis, and the safety alert — computed by
    `drug_calculator` from the approved row, not by the model.
    """
    payload, _ = ask(
        engine,
        "How do I calculate the morphine dose?",
        drug=morphine(),
        patient_weight_kg=70,
        age=40,
    )

    assert payload["missing_variables"] == []
    assert payload["dose"]
    assert "7.0" in payload["dose"]  # 0.1 mg/kg x 70 kg
    assert "0.1" in payload["dose"] and "70" in payload["dose"]  # the basis
    assert payload["safety_alert"] is True  # high-risk medication


# ── Test 2: the antidote ─────────────────────────────────────────────────────


def test_an_antidote_question_does_not_return_the_monograph(engine):
    """Brief, Test 2."""
    payload, _ = ask(engine, "Morphine overdose antidote", drug=morphine())

    assert payload["intent"] == ClinicalIntent.ANTIDOTE.value
    assert payload["dose_sections"] is None
    assert "Therapeutic class" not in str(payload)


# ── Test 3: preparation ──────────────────────────────────────────────────────


def test_a_preparation_question_returns_preparation_fields(engine):
    """Brief, Test 3."""
    payload, _ = ask(engine, "How do I prepare vancomycin 1 g IV?")

    assert payload["intent"] == ClinicalIntent.PREPARATION.value
    shown = labels(payload)
    assert "Diluents" in shown
    assert "Final concentration" in shown
    assert "Preparation, administration and stability" in shown
    # Not the parts that answer a different question.
    assert "Therapeutic class" not in shown
    assert "Indications" not in shown


# ── Test 4: a plain dose question ────────────────────────────────────────────


def test_a_dose_question_returns_dosing_fields_only(engine):
    """Brief, Test 4."""
    payload, _ = ask(engine, "What is the dose of vancomycin?")

    assert payload["intent"] == ClinicalIntent.DOSE.value
    shown = labels(payload)
    assert shown == ["Adult dosing", "Pediatric dosing"]
    assert "Storage" not in str(payload)


def test_the_full_record_is_still_available_when_it_is_asked_for(engine):
    """
    Nothing is deleted. This is the assertion that the change is a narrowing of
    what travels per question, not a truncation of the corpus.
    """
    payload, _ = ask(engine, "Tell me everything about vancomycin")

    assert payload["intent"] == ClinicalIntent.FULL_DRUG_INFO.value
    shown = labels(payload)
    assert len(shown) >= 11
    assert "Therapeutic class" in shown
    assert "Diluents" in shown


# ── The other intents ────────────────────────────────────────────────────────


def test_a_renal_question_returns_the_renal_field_and_computes_nothing(engine):
    payload, _ = ask(engine, "vancomycin renal dose adjustment")

    assert payload["intent"] == ClinicalIntent.RENAL_ADJUSTMENT.value
    assert labels(payload) == ["Renal/hepatic adjustment"]
    # There is no CrCl input, no formula and no approved renal rule anywhere in
    # this engine — the renal content is prose. Quoting it is all that is safe.
    assert payload["dose"] is None or "mg/kg" not in (payload["dose"] or "")


def test_a_monitoring_question_surfaces_the_monitoring_text(engine):
    """
    The converter writes Monitoring into the `warnings` column, not the regimen,
    and the importer splits it on "|" — so it arrives as its own labelled line.
    """
    payload, _ = ask(engine, "What should I monitor with vancomycin?")

    assert payload["intent"] == ClinicalIntent.MONITORING.value
    assert "Trough level before the fourth dose" in (payload["safety_warning"] or "")
    assert "Storage" not in (payload["safety_warning"] or "")


def test_administration_keeps_the_cautions_that_belong_to_giving_it(engine):
    """Cautions and adverse reactions always travel; an intent never drops them."""
    payload, _ = ask(engine, "How should vancomycin be administered?")

    warning = payload["safety_warning"] or ""
    assert "Infusion-related reactions" in warning
    assert "Nephrotoxicity" in warning


# ── Test 9 and Test 10: nothing was lost on the way ──────────────────────────


def test_a_high_risk_alert_survives_intent_formatting(engine):
    """Brief, Test 9."""
    for question in (
        "What is the dose of vancomycin?",
        "How do I prepare vancomycin 1 g IV?",
        "What should I monitor with vancomycin?",
    ):
        payload, _ = ask(engine, question)
        assert payload["safety_alert"] is True, question
        assert any("High Risk" in a for a in payload["safety_alerts"]), question


def test_citations_confidence_and_audit_survive(engine):
    """Brief, Test 10."""
    payload, audit = ask(engine, "What is the dose of vancomycin?")

    assert payload["citations"], "citations were lost"
    assert payload["citations"][0]["chunk_id"]
    assert payload["confidence"] > 0
    assert payload["confidence_label"] in ("High", "Medium", "Low")
    assert len(audit.rows) == 1, "exactly one audit row per answered query"


def test_nursing_notes_survive(engine):
    payload, _ = ask(engine, "What is the dose of vancomycin?")
    assert payload["nursing_notes"]


def test_a_pending_drug_still_refuses_under_every_intent(engine):
    """Coverage validation is not something an intent can route around."""
    pending = vancomycin(review_status="pending")
    for question in ("What is the dose of vancomycin?", "كيف احسب جرعه الvancomycin"):
        payload, _ = ask(engine, question, drug=pending)
        # The notice follows the language of the question, as every coverage
        # notice in this engine does.
        dose = payload["dose"] or ""
        assert dose == "" or "signed off" in dose or "لم يُعتمد من صيدلي" in dose
        assert any(
            "pending" in a.lower() or "مراجعة" in a for a in payload["safety_alerts"]
        )


# ── Test 7: no trusted source ────────────────────────────────────────────────


def test_no_trusted_source_still_refuses(engine):
    """Brief, Test 7. Refusal-first is upstream of intent and stays that way."""
    client, _ = engine(chunks=[])
    payload = client.post("/query/", json={"question": "What is the dose of vancomycin?"}).json()

    assert payload["rejected"] is True
    assert payload["citations"] == []
    assert "500-1000" not in payload["answer"]


# ── The three production-equivalent runs ─────────────────────────────────────


PRODUCTION_CASES = [
    ("كيف احسب جرعه الvancomycin", ClinicalIntent.DOSE_CALCULATION),
    ("Morphine overdose antidote", ClinicalIntent.ANTIDOTE),
    (
        "ماهي طريقة تحضير الvancomycin 1g iv state لمريض وزنه 70 كيلو جرام و عمره 45",
        ClinicalIntent.PREPARATION,
    ),
]


@pytest.mark.parametrize("question,expected_intent", PRODUCTION_CASES)
def test_the_production_cases_end_to_end(engine, question, expected_intent):
    """
    The brief's own three, run through the real pipeline.

    Classification alone would not prove anything: the assertion that matters is
    that the assembled response no longer carries the whole medication record.
    """
    payload, audit = ask(engine, question, drug=vancomycin())

    assert payload["intent"] == expected_intent.value
    assert payload["query_type"] == "drug", "the safety layer must still run"
    assert len(audit.rows) == 1

    # The record's reference fields must not be in a short answer.
    body = str(payload)
    for field in ("Therapeutic class", "Prescriber authority", "Storage", "Lactation"):
        assert field not in body, f"{field} leaked into a {expected_intent.value} answer"
