"""
What the nurse asked, separated from what the question is about.

Every medication question used to take one path and return one payload: the
drug's whole record, which for vancomycin is 6,162 characters across 11 fields.
"كيف احسب جرعه الvancomycin" and "Tell me everything about vancomycin" are not
the same question, and answering them identically buries the one figure the
first one wanted.

These tests are the classification half. The response half is in
`test_intent_responses.py`; the grounding gate is in `test_dose_grounding.py`.

The examples below are the ones the brief named, kept verbatim — including the
missing space in "جرعه الvancomycin", because that is how a nurse actually types
on a phone and a classifier that only handles tidy input is not a classifier.
"""
import pytest

from models.schemas import ClinicalIntent
from services.clinical_intent import (
    classify_intent,
    monitoring_note,
    required_variables,
    retrieval_keywords,
    sections_for_intent,
)

from tests.formulary_fixture import entry


# ── The brief's own examples ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    "question,expected",
    [
        # Arabic, as typed
        ("كيف احسب جرعه الvancomycin", ClinicalIntent.DOSE_CALCULATION),
        ("كيف أحسب جرعة الفانكومايسين لمريض وزنه 70 كجم", ClinicalIntent.DOSE_CALCULATION),
        # English
        ("How do I calculate the vancomycin dose?", ClinicalIntent.DOSE_CALCULATION),
        ("What is the dose of vancomycin?", ClinicalIntent.DOSE),
        ("How do I prepare vancomycin 1 g IV?", ClinicalIntent.PREPARATION),
        ("How should vancomycin be administered?", ClinicalIntent.ADMINISTRATION),
        ("Vancomycin renal dose adjustment", ClinicalIntent.RENAL_ADJUSTMENT),
        ("Morphine overdose antidote", ClinicalIntent.ANTIDOTE),
        ("What should I monitor with vancomycin?", ClinicalIntent.MONITORING),
        ("Tell me everything about vancomycin", ClinicalIntent.FULL_DRUG_INFO),
    ],
)
def test_the_briefs_examples_classify_as_specified(question, expected):
    assert classify_intent(question) is expected


# ── Arabic, and the mixed script a phone keyboard actually produces ──────────


@pytest.mark.parametrize(
    "question,expected",
    [
        ("ماهي طريقة تحضير الفانكومايسين", ClinicalIntent.PREPARATION),
        ("طريقة إعطاء الدواء وريدياً", ClinicalIntent.ADMINISTRATION),
        ("تعديل الجرعة في القصور الكلوي", ClinicalIntent.RENAL_ADJUSTMENT),
        ("جرعة الأطفال من الباراسيتامول", ClinicalIntent.PEDIATRIC_DOSING),
        ("ترياق الجرعة الزائدة من المورفين", ClinicalIntent.ANTIDOTE),
        ("ماذا أراقب مع الفانكومايسين", ClinicalIntent.MONITORING),
        ("ما الجرعة المعتادة للمورفين", ClinicalIntent.DOSE),
        ("أخبرني كل شيء عن المورفين", ClinicalIntent.FULL_DRUG_INFO),
    ],
)
def test_arabic_classifies_without_word_boundaries(question, expected):
    """
    `\\b` is an ASCII word boundary and does not match around Arabic characters.

    `clinical_router` learned this the hard way and says so at its line 10; the
    intent patterns follow the same rule, and these cases hold it in place.
    """
    assert classify_intent(question) is expected


@pytest.mark.parametrize(
    "question,expected",
    [
        ("كيف احسب جرعه vancomycin", ClinicalIntent.DOSE_CALCULATION),
        ("طريقة تحضير vancomycin 1g IV", ClinicalIntent.PREPARATION),
        ("ما هي dose الفانكومايسين", ClinicalIntent.DOSE),
    ],
)
def test_mixed_arabic_and_english_scores_on_both_lists(question, expected):
    """A nurse types the drug name in Latin script and the question in Arabic."""
    assert classify_intent(question) is expected


# ── The distinction that matters most ────────────────────────────────────────


def test_calculation_beats_dose_because_it_contains_the_word():
    """
    "كيف احسب جرعة" contains "جرعة".

    Scored the other way round, a request to *calculate* would be answered with
    a quoted range — which is the reported defect, one level up.
    """
    assert classify_intent("كيف احسب الجرعة") is ClinicalIntent.DOSE_CALCULATION
    assert classify_intent("ما هي الجرعة") is ClinicalIntent.DOSE


def test_an_unclear_question_does_not_become_a_dosing_question():
    """Guessing that an unclear question wants a dose is the guess with a cost."""
    for question in ("vancomycin", "tell me about it", "الفانكومايسين", ""):
        assert classify_intent(question) is ClinicalIntent.GENERAL_DRUG_INFO


# ── Required variables ───────────────────────────────────────────────────────


def approved(**kw):
    """An approved, weight-based entry — the only shape that can be computed."""
    defaults = dict(dose_per_kg=0.1, adult_flat_min=2.0, adult_flat_max=4.0)
    defaults.update(kw)
    return entry("morphine", **defaults)


def test_a_calculation_without_a_weight_asks_for_the_weight():
    missing = required_variables(
        ClinicalIntent.DOSE_CALCULATION, approved(), weight=None, age=40
    )
    assert missing == ["patient_weight_kg"]


def test_a_calculation_with_everything_asks_for_nothing():
    missing = required_variables(
        ClinicalIntent.DOSE_CALCULATION, approved(), weight=70.0, age=40
    )
    assert missing == []


def test_age_is_required_only_where_a_pediatric_range_exists():
    """
    Asking for a value that would change nothing is noise, and noise in a
    clinical prompt is how real prompts stop being read.
    """
    with_pediatric = approved(pediatric_min_per_kg=0.05, pediatric_max_per_kg=0.1)
    assert "age" in required_variables(
        ClinicalIntent.DOSE_CALCULATION, with_pediatric, weight=70.0, age=None
    )
    assert "age" not in required_variables(
        ClinicalIntent.DOSE_CALCULATION, approved(), weight=70.0, age=None
    )


def test_pediatric_dosing_always_needs_an_age():
    missing = required_variables(
        ClinicalIntent.PEDIATRIC_DOSING, approved(), weight=20.0, age=None
    )
    assert missing == ["age"]


def test_nothing_is_asked_for_a_drug_that_cannot_be_computed():
    """
    A protocol-dosed drug has no figures to multiply, so there is nothing a
    weight would unlock. The coverage notice already explains the blank.
    """
    protocol_only = entry("vancomycin", auto_calculate=False)
    assert required_variables(
        ClinicalIntent.DOSE_CALCULATION, protocol_only, weight=None, age=None
    ) == []


def test_nothing_is_asked_for_an_unapproved_drug():
    pending = entry("morphine", dose_per_kg=0.1, review_status="pending")
    assert required_variables(
        ClinicalIntent.DOSE_CALCULATION, pending, weight=None, age=None
    ) == []


def test_non_dosing_intents_never_ask_for_patient_values():
    for intent in (
        ClinicalIntent.PREPARATION,
        ClinicalIntent.ANTIDOTE,
        ClinicalIntent.MONITORING,
        ClinicalIntent.FULL_DRUG_INFO,
    ):
        assert required_variables(intent, approved(), weight=None, age=None) == []


# ── Retrieval biasing ────────────────────────────────────────────────────────


def test_intents_bias_retrieval_with_their_own_vocabulary():
    assert "preparation" in retrieval_keywords(ClinicalIntent.PREPARATION)
    assert "antidote" in retrieval_keywords(ClinicalIntent.ANTIDOTE)
    assert "renal" in retrieval_keywords(ClinicalIntent.RENAL_ADJUSTMENT)


def test_a_full_record_request_biases_nothing():
    """Asking for everything should not weight the search toward one part."""
    assert retrieval_keywords(ClinicalIntent.FULL_DRUG_INFO) == ()
    assert retrieval_keywords(ClinicalIntent.GENERAL_DRUG_INFO) == ()


# ── Which regimen fields answer which question ───────────────────────────────


def test_preparation_selects_the_iv_manual_fields():
    wanted = sections_for_intent(ClinicalIntent.PREPARATION)
    assert "Diluents" in wanted
    assert "Final concentration" in wanted
    assert "Adult dosing" not in wanted


def test_a_full_record_request_selects_everything():
    """None means no narrowing at all, which is what "everything" must mean."""
    assert sections_for_intent(ClinicalIntent.FULL_DRUG_INFO) is None


def test_intents_answered_elsewhere_select_no_regimen():
    """A regimen dump would bury the antidote, which is one line."""
    assert sections_for_intent(ClinicalIntent.ANTIDOTE) == ()
    assert sections_for_intent(ClinicalIntent.MONITORING) == ()


def test_monitoring_text_is_found_in_the_warnings_column():
    """
    The converter puts Monitoring into `warnings`, not into the regimen, and the
    importer splits that column on "|" — so each warning already arrives as its
    own "Label: value" string.
    """
    drug = entry(
        "vancomycin",
        warnings=[
            "Cautions and warnings: Infusion-related reactions.",
            "Monitoring: Trough level before the fourth dose.",
            "Storage: 2-8 C after reconstitution.",
        ],
    )

    assert monitoring_note(drug) == "Trough level before the fourth dose."


def test_a_drug_with_no_monitoring_text_yields_none():
    assert monitoring_note(entry("morphine")) is None
    assert monitoring_note(None) is None
