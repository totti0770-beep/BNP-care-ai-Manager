"""Tests for the retrieval and answer safety gates."""
import pytest

from models.schemas import Citation
from services.safety_layer import (
    CONFIDENCE_THRESHOLD,
    check_answer,
    check_retrieval,
    is_high_risk,
)


def _citation(score: float = 0.9) -> Citation:
    return Citation(
        document_name="Adult IV Drip.pdf",
        page_number=12,
        relevance_score=score,
        excerpt="…",
    )


def test_retrieval_rejected_below_confidence_threshold():
    result = check_retrieval([_citation()], CONFIDENCE_THRESHOLD - 0.01)
    assert result.is_safe is False
    assert result.rejection_reason


def test_retrieval_rejected_without_citations():
    result = check_retrieval([], 0.9)
    assert result.is_safe is False


def test_retrieval_accepted_with_confident_citation():
    result = check_retrieval([_citation()], 0.8)
    assert result.is_safe is True


def test_confidence_threshold_is_a_real_gate():
    """
    Guards the defect where scores were normalised per query so the top chunk
    always scored ~1.0, making this threshold unreachable.
    """
    assert CONFIDENCE_THRESHOLD > 0.1


@pytest.mark.parametrize(
    "answer",
    [
        "I think the dose is 500 mg.",
        "It might be 500 mg every six hours.",
        "This is probably the right approach.",
        "I'm not sure, but try 1 g.",
    ],
)
def test_speculative_answers_are_rejected(answer):
    assert check_answer(answer, 0.9).is_safe is False


@pytest.mark.parametrize(
    "answer",
    [
        "Paracetamol 500-1000 mg every 6 hours, maximum 4 g per day.",
        "Administer 1 g IV over 15 minutes.",
    ],
)
def test_grounded_answers_are_accepted(answer):
    assert check_answer(answer, 0.9).is_safe is True


def test_high_risk_language_is_flagged():
    assert is_high_risk("what is the antidote", "risk of respiratory arrest") is True
    assert is_high_risk("جرعة زائدة", "") is True
    assert is_high_risk("hand hygiene steps", "Wash hands for 20 seconds.") is False
