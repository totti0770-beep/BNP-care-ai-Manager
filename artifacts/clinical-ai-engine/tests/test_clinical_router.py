"""
Query classification, in both languages.

The classifier decides whether the drug-safety layer runs at all, so a drug
question misfiled as GENERAL silently skips every dose, contraindication and
interaction check. The Arabic patterns deliberately avoid \\b, which does not
work with non-ASCII word characters — these tests hold that behaviour in place.
"""
import pytest

from models.schemas import QueryType
from services.clinical_router import classify_query


@pytest.mark.parametrize(
    "question",
    [
        "What is the paracetamol dose for a 70 kg adult?",
        "maximum dose of morphine",
        "vancomycin loading dose",
        "is ibuprofen contraindicated in renal failure",
        "naloxone antidote for overdose",
        "how much amoxicillin should I administer",
        "heparin IV infusion rate",
    ],
)
def test_english_drug_questions_are_classified_as_drug(question):
    assert classify_query(question) == QueryType.DRUG


@pytest.mark.parametrize(
    "question",
    [
        "ما هي جرعة الباراسيتامول؟",
        "جرعة المورفين للبالغين",
        "كيف أعطي الإنسولين؟",
        "ما هي موانع استخدام الوارفارين؟",
        "جرعة زائدة من الديجوكسين",
        "تحضير محلول الفانكومايسين",
    ],
)
def test_arabic_drug_questions_are_classified_as_drug(question):
    """Arabic must reach the safety layer exactly as English does."""
    assert classify_query(question) == QueryType.DRUG


@pytest.mark.parametrize(
    "question",
    [
        "What are the hand hygiene protocol steps?",
        "fall prevention procedure",
        "central line insertion checklist",
    ],
)
def test_protocol_questions_are_classified_as_protocol(question):
    assert classify_query(question) == QueryType.PROTOCOL


@pytest.mark.parametrize(
    "question",
    [
        "خطوات بروتوكول نظافة اليدين",
        "إجراءات الوقاية من السقوط",
    ],
)
def test_arabic_protocol_questions_are_classified_as_protocol(question):
    assert classify_query(question) == QueryType.PROTOCOL


@pytest.mark.parametrize(
    "question",
    [
        "What are the visiting hours?",
        "who is the head nurse today",
    ],
)
def test_unrelated_questions_are_general(question):
    assert classify_query(question) == QueryType.GENERAL


def test_classification_is_case_insensitive():
    assert classify_query("PARACETAMOL DOSE") == QueryType.DRUG
    assert classify_query("paracetamol dose") == QueryType.DRUG
