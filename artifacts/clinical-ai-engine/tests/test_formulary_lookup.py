"""
A nurse may look a drug up; an unapproved drug shows its name and nothing else.

The review listing (`GET /formulary`) is admin-only because it returns every
column of every row — figures nobody has approved, and the governance trail
behind them. Until now that meant a nurse had no way to look a drug up at all.
This endpoint is the nurse-safe read, and the property these tests pin is the
one that makes it safe: the projection is decided on the server, and every
clinical field is withheld unless the row is approved. A client cannot forget
to hide a pending dose, because it never receives one.
"""
import pytest
from fastapi.testclient import TestClient

import main
from routers import formulary as formulary_router
from routers.auth import get_current_user
from tests.formulary_fixture import entry, build_formulary

NURSE = {"sub": "7", "username": "nurse@hospital.example", "role": "user"}


def _formulary():
    return build_formulary([
        entry(
            "vancomycin",
            name_ar="فانكومايسين",
            aliases=["vanco"],
            high_risk=True,
            adult_max_daily=4000,
            overdose_threshold_absolute=6000,
            antidote="supportive; dialysis",
            reference_regimen="Adult dosing: 15 mg/kg every 12 h | Renal/hepatic adjustment: reduce in CrCl <50",
            contraindications=["hypersensitivity"],
            interactions=["aminoglycosides"],
            warnings=["Monitoring: trough levels"],
            reviewed_by="Dr Reviewer",
            reviewer_license="LIC-123",
        ),
        entry(
            "vancomycin ophthalmic",
            adult_max_daily=100,
            reference_regimen="Adult dosing: 1 drop q4h",
        ),
        entry(
            "capreomycin",
            review_status="pending",
            adult_max_daily=1000,
            overdose_threshold_absolute=2000,
            antidote="none",
            reference_regimen="Adult dosing: 1 g daily",
            contraindications=["renal failure"],
        ),
        entry(
            "rejectedmycin",
            review_status="rejected",
            adult_max_daily=500,
            reference_regimen="Adult dosing: something unapproved",
        ),
    ])


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(formulary_router, "get_formulary", _formulary)
    main.app.dependency_overrides[get_current_user] = lambda: NURSE
    yield TestClient(main.app, raise_server_exceptions=False)
    main.app.dependency_overrides.clear()


# ── Authorization ────────────────────────────────────────────────────────────


def test_a_nurse_may_look_a_drug_up(client):
    res = client.get("/formulary/lookup", params={"q": "vanco"})
    assert res.status_code == 200
    assert {m["generic_name"] for m in res.json()} == {"vancomycin", "vancomycin ophthalmic"}


def test_the_review_listing_is_still_admin_only(client):
    """The new read must not have loosened the old one."""
    assert client.get("/formulary").status_code == 403


def test_an_unauthenticated_call_is_refused(monkeypatch):
    monkeypatch.setattr(formulary_router, "get_formulary", _formulary)
    main.app.dependency_overrides.clear()
    res = TestClient(main.app, raise_server_exceptions=False).get(
        "/formulary/lookup", params={"q": "vanco"}
    )
    assert res.status_code in (401, 403)


# ── Provenance and withholding ───────────────────────────────────────────────


def test_an_approved_drug_carries_its_clinical_fields_and_source(client):
    m = next(x for x in client.get("/formulary/lookup", params={"q": "vancomycin"}).json()
             if x["generic_name"] == "vancomycin")
    assert m["review_status"] == "approved"
    assert m["clinical_data_withheld"] is False
    assert m["adult_max_daily"] == 4000
    assert m["overdose_threshold_absolute"] == 6000
    assert m["antidote"] == "supportive; dialysis"
    assert m["contraindications"] == ["hypersensitivity"]
    assert m["interactions"] == ["aminoglycosides"]
    assert m["warnings"] == ["Monitoring: trough levels"]
    assert [s["label"] for s in m["regimen_sections"]] == ["Adult dosing", "Renal/hepatic adjustment"]
    assert m["source_name"] == "Test formulary" and m["source_ref"] == "p.1"
    assert m["reviewed_by"] == "Dr Reviewer"
    assert m["high_risk"] is True


@pytest.mark.parametrize("name,status", [("capreomycin", "pending"), ("rejectedmycin", "rejected")])
def test_an_unapproved_drug_is_named_but_withheld(client, name, status):
    """
    The defect this guards: a pending figure reaching a nurse. The row exists,
    the row has numbers, and the nurse must see the name, the status and the
    source — and not one clinical value.
    """
    res = client.get("/formulary/lookup", params={"q": name})
    assert res.status_code == 200
    (m,) = res.json()
    assert m["review_status"] == status
    assert m["clinical_data_withheld"] is True
    for field in ("adult_max_daily", "overdose_threshold_absolute", "overdose_threshold_per_kg",
                  "antidote", "route", "frequency", "reviewed_by"):
        assert m[field] is None, field
    for field in ("regimen_sections", "contraindications", "interactions", "warnings"):
        assert m[field] == [], field
    # Provenance is still shown: the nurse may know what is under review.
    assert m["source_name"] == "Test formulary"


def test_governance_internals_are_not_on_the_nurse_projection(client):
    m = client.get("/formulary/lookup", params={"q": "vancomycin"}).json()[0]
    for internal in ("reviewer_license", "imported_by", "imported_from_file", "review_note", "dose_per_kg"):
        assert internal not in m, internal


# ── Matching ─────────────────────────────────────────────────────────────────


def test_arabic_name_matches(client):
    res = client.get("/formulary/lookup", params={"q": "فانكو"})
    assert [m["generic_name"] for m in res.json()][0] == "vancomycin"


def test_alias_matches(client):
    assert client.get("/formulary/lookup", params={"q": "vanco"}).json()[0]["generic_name"] == "vancomycin"


def test_exact_name_ranks_first_and_high_risk_next(client):
    names = [m["generic_name"] for m in client.get("/formulary/lookup", params={"q": "vancomycin"}).json()]
    assert names == ["vancomycin", "vancomycin ophthalmic"]


def test_unknown_drug_is_an_empty_list_not_an_error(client):
    res = client.get("/formulary/lookup", params={"q": "notadrug"})
    assert res.status_code == 200 and res.json() == []


def test_too_short_a_query_is_rejected(client):
    assert client.get("/formulary/lookup", params={"q": "v"}).status_code == 422


def test_unavailable_formulary_is_a_503_not_an_empty_result(client, monkeypatch):
    class Down:
        is_available = False
        degraded_reason = "table unreachable"
    monkeypatch.setattr(formulary_router, "get_formulary", lambda: Down())
    res = client.get("/formulary/lookup", params={"q": "vanco"})
    assert res.status_code == 503
