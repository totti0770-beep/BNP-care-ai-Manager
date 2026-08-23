"""
The extractor's collision check must not let a spelling variant become a
second row for the same drug — that is the digoxin/digoxine defect. Exact
match already caught most collisions; these lock the near-match check that
catches the rest, and that it does not fire on unrelated names.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.extract_formulary_pdfs import find_near_duplicate, _levenshtein, _normalize


def test_a_one_letter_spelling_variant_is_flagged():
    assert find_near_duplicate("digoxine", {"digoxin"}) == ("digoxin", 0.875)


def test_a_second_real_near_miss_is_also_flagged():
    """The same shape the extractor found for real: heparin vs. heparine."""
    assert find_near_duplicate("heparine", {"heparin", "morphine"}) == ("heparin", 0.875)


def test_an_exact_match_is_not_reported_here():
    """Exact matches are handled by the existing-name check before this runs."""
    assert find_near_duplicate("digoxin", {"digoxin"}) is None


def test_unrelated_names_are_not_flagged():
    assert find_near_duplicate("morphine", {"digoxin", "heparin", "insulin"}) is None


def test_short_names_are_not_compared():
    """A distance-1 tolerance on short names would flag unrelated drugs."""
    assert find_near_duplicate("iron", {"zinc"}) is None


def test_normalize_collapses_punctuation_and_case():
    assert _normalize("Y-Site, Injection!") == "ysiteinjection"


def test_levenshtein_distance_of_common_edits():
    assert _levenshtein("digoxin", "digoxine") == 1
    assert _levenshtein("heparin", "heparine") == 1
    assert _levenshtein("morphine", "morphine") == 0
