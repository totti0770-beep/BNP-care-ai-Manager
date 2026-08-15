"""
What the pipeline says about a drug depends on whether a pharmacist signed it
off. These assert that through the request path, not just in the calculator —
a rule that is only true in a unit test is not a safety property.
"""
from models.formulary import CoverageStatus
from services.drug_calculator import calculate_dose
from tests.formulary_fixture import FIXTURE_DRUGS, build_formulary, with_status


def formulary_where(name: str, status: str):
    """The fixture set with one drug moved to a different review status."""
    others = [d for d in FIXTURE_DRUGS if d.generic_name != name]
    return build_formulary(others + [with_status(name, status)])


PENDING = {"question": "morphine dose", "drug_name": "morphine", "patient_weight_kg": 70}


# ── Coverage status ───────────────────────────────────────────────────────────

def test_an_approved_drug_is_approved():
    f = build_formulary()
    assert f.coverage_status("morphine") is CoverageStatus.APPROVED
    assert f.coverage_status("morphine").may_quote_a_dose is True


def test_a_pending_drug_may_not_quote_a_dose():
    f = formulary_where("morphine", "pending")
    assert f.coverage_status("morphine") is CoverageStatus.PENDING_REVIEW
    assert f.coverage_status("morphine").may_quote_a_dose is False


def test_a_rejected_drug_may_not_quote_a_dose():
    f = formulary_where("morphine", "rejected")
    assert f.coverage_status("morphine") is CoverageStatus.REJECTED
    assert f.coverage_status("morphine").may_quote_a_dose is False


def test_an_absent_drug_is_not_in_the_formulary():
    f = build_formulary()
    assert f.coverage_status("rivaroxaban") is CoverageStatus.NOT_IN_FORMULARY


# ── Through the request path ──────────────────────────────────────────────────

def test_a_pending_drug_returns_no_dose_over_http(engine):
    client, _ = engine(formulary=formulary_where("morphine", "pending"))
    payload = client.post("/query/", json=PENDING).json()

    assert payload["dose"] is None or "not been signed off" in payload["dose"]
    body = client.post("/query/", json=PENDING).text
    # The pediatric and adult figures for morphine must both be absent.
    assert "7.0 mg/dose" not in body
    assert "2.0–4.0 mg" not in body


def test_a_pending_drug_says_why_no_dose_is_shown(engine):
    client, _ = engine(formulary=formulary_where("morphine", "pending"))
    alerts = client.post("/query/", json=PENDING).json()["safety_alerts"]

    assert any("pending pharmacist review" in a for a in alerts)
    # And the source is named, so an admin can see what is waiting on review.
    assert any("Test formulary" in a for a in alerts)


def test_a_rejected_drug_says_it_was_rejected(engine):
    client, _ = engine(formulary=formulary_where("morphine", "rejected"))
    alerts = client.post("/query/", json=PENDING).json()["safety_alerts"]

    assert any("rejected by a pharmacist" in a for a in alerts)


def test_an_approved_drug_still_returns_its_dose(engine):
    client, _ = engine()
    payload = client.post("/query/", json=PENDING).json()

    assert payload["dose"]
    assert "7.0" in payload["dose"]  # 0.1 mg/kg x 70 kg


def test_a_drug_outside_the_formulary_is_named_as_such(engine):
    client, _ = engine()
    alerts = client.post(
        "/query/",
        json={"question": "rivaroxaban dose", "drug_name": "rivaroxaban"},
    ).json()["safety_alerts"]

    assert any("not in the medication formulary" in a for a in alerts)


def test_a_pending_high_risk_drug_still_carries_its_warning(engine):
    """Suppressing an additive warning would be less safe, not more."""
    client, _ = engine(formulary=formulary_where("morphine", "pending"))
    alerts = client.post("/query/", json=PENDING).json()["safety_alerts"]

    assert any("High Risk Medication" in a for a in alerts)


def test_a_pending_drug_does_not_hard_block(engine):
    """
    An overdose block computed from unsigned figures is a false alarm waiting to
    happen, and alarm fatigue is a hazard in its own right.
    """
    client, _ = engine(formulary=formulary_where("gentamicin", "pending"))
    payload = client.post(
        "/query/",
        json={
            "question": "gentamicin dose",
            "drug_name": "gentamicin",
            "patient_weight_kg": 200,
        },
    ).json()

    # The high-risk flag still fires — that warning is not computed from any
    # unverified figure. What must not happen is a refusal built on one.
    assert payload["rejected"] is False
    assert not any("OVERDOSE" in a for a in payload["safety_alerts"])


# ── Bilingual ─────────────────────────────────────────────────────────────────

def test_the_pending_notice_is_arabic_for_an_arabic_question(engine):
    """
    A nurse who reads only Arabic must be able to read why no dose appeared.
    A blank number with an English-only explanation is not an explanation.
    """
    client, _ = engine(formulary=formulary_where("morphine", "pending"))
    alerts = client.post(
        "/query/",
        json={"question": "ما جرعة المورفين؟", "drug_name": "morphine"},
    ).json()["safety_alerts"]

    assert any("قيد مراجعة الصيدلي" in a for a in alerts)


def test_the_uncovered_notice_is_arabic_for_an_arabic_question(engine):
    client, _ = engine()
    alerts = client.post(
        "/query/",
        json={"question": "ما جرعة الريفاروكسابان؟", "drug_name": "rivaroxaban"},
    ).json()["safety_alerts"]

    assert any("غير مدرج في دستور الأدوية" in a for a in alerts)


def test_the_unapproved_dose_notice_is_arabic():
    f = formulary_where("morphine", "pending")
    result = calculate_dose(f.get("morphine"), "ما جرعة المورفين لمريض وزنه 70 كجم؟", 70)

    assert "لم تُحسب أي جرعة" in result.safe_range
    assert result.calculated_dose is None


def test_the_unapproved_dose_notice_is_english_for_an_english_question():
    f = formulary_where("morphine", "pending")
    result = calculate_dose(f.get("morphine"), "morphine dose for a 70 kg patient", 70)

    assert "has not been signed off" in result.safe_range


# ── Version reporting ─────────────────────────────────────────────────────────

def test_the_review_summary_stays_unverified_while_one_drug_is_pending():
    """
    A nurse cannot be expected to remember which subset was signed off, so the
    headline stays UNVERIFIED until the whole formulary is.
    """
    f = formulary_where("morphine", "pending")
    assert f.review_summary().startswith("UNVERIFIED")
    assert "7/8" in f.review_summary()


def test_the_review_summary_is_verified_when_everything_is_approved():
    assert build_formulary().review_summary().startswith("VERIFIED")


def test_the_version_changes_when_a_drug_is_revised():
    """Recorded on every audit row, so a past recommendation is reproducible."""
    before = build_formulary().version()
    after = build_formulary(
        [d for d in FIXTURE_DRUGS if d.generic_name != "morphine"]
        + [with_status("morphine", "approved", version=2)]
    ).version()

    assert before != after
