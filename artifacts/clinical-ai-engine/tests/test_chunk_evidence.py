"""
The passage behind a citation: an administrator may read any, a nurse only
what the engine would cite today.

`GET /documents/chunks/{id}` was admin-only. That made it an incident-review
tool and nothing else: a nurse who had just been shown an excerpt in the
assistant could not open the passage it came from. The endpoint now serves a
nurse too, with one rule applied on the server — the document must be
approved, in date and not retired, decided by the same `is_currently_valid`
the retriever uses. An administrator keeps the unrestricted read, because an
incident review must be able to see a passage that has since been withdrawn.
"""
import datetime as dt
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

import main
from routers import documents as documents_router
from routers.auth import get_current_user

NURSE = {"sub": "7", "username": "nurse@hospital.example", "role": "user"}
ADMIN = {"sub": "1", "username": "admin@hospital.example", "role": "admin"}

TODAY = dt.date.today()
YESTERDAY = TODAY - dt.timedelta(days=1)
NEXT_YEAR = TODAY + dt.timedelta(days=365)


def _row(**overrides):
    row = {
        "chunk_id": "c-1",
        "content": "Vancomycin 15 mg/kg IV every 12 hours.",
        "page_number": 4,
        "chunk_index": 0,
        "document_id": "d-1",
        "chunk_retired_at": None,
        "filename": "JSH Formulary.pdf",
        "document_retired_at": None,
        "document_status": "approved",
        "document_version": 2,
        "effective_date": None,
        "expiry_date": None,
        "approved_by": "Dr Reviewer",
        "approved_at": "2026-01-01T00:00:00",
    }
    row.update(overrides)
    return row


class _Cursor:
    def __init__(self, row):
        self._row = row
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchone(self):
        return self._row


def _db(row):
    @contextmanager
    def fake_cursor():
        yield _Cursor(row), None

    return fake_cursor


@pytest.fixture
def as_user(monkeypatch):
    def _make(user, row):
        monkeypatch.setattr(documents_router, "db_cursor", _db(row))
        main.app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(main.app, raise_server_exceptions=False)

    yield _make
    main.app.dependency_overrides.clear()


# ── A nurse reads current evidence ───────────────────────────────────────────


def test_a_nurse_may_read_a_currently_valid_passage(as_user):
    res = as_user(NURSE, _row()).get("/documents/chunks/c-1")
    assert res.status_code == 200
    body = res.json()
    assert body["content"].startswith("Vancomycin 15 mg/kg")
    assert body["filename"] == "JSH Formulary.pdf"
    assert body["page_number"] == 4
    assert body["currently_valid"] is True
    assert body["retired"] is False


def test_the_passage_carries_its_governance(as_user):
    """A nurse verifying a source needs to see what stands behind it."""
    body = as_user(NURSE, _row(effective_date=YESTERDAY, expiry_date=NEXT_YEAR)).get(
        "/documents/chunks/c-1"
    ).json()
    assert body["document_status"] == "approved"
    assert body["document_version"] == 2
    assert body["approved_by"] == "Dr Reviewer"
    assert body["effective_date"] == YESTERDAY.isoformat()
    assert body["expiry_date"] == NEXT_YEAR.isoformat()


# ── A nurse is refused what the engine would not cite ────────────────────────


@pytest.mark.parametrize(
    "overrides",
    [
        {"document_status": "pending"},
        {"document_status": "superseded"},
        {"document_status": "retired"},
        {"expiry_date": YESTERDAY},
        {"effective_date": NEXT_YEAR},
        {"document_retired_at": "2026-02-02T00:00:00"},
        {"chunk_retired_at": "2026-02-02T00:00:00"},
    ],
    ids=["pending", "superseded", "retired", "expired", "not-yet-effective",
         "document-soft-deleted", "chunk-soft-deleted"],
)
def test_a_nurse_is_refused_a_passage_that_is_not_current(as_user, overrides):
    res = as_user(NURSE, _row(**overrides)).get("/documents/chunks/c-1")
    assert res.status_code == 403
    # The content must not leak in the error.
    assert "Vancomycin" not in res.text


def test_the_refusal_is_a_403_not_a_404(as_user):
    """
    The passage exists and the nurse holds a citation to it. "Not found" would
    say the citation never happened; "not currently approved" says what is true.
    """
    res = as_user(NURSE, _row(document_status="retired")).get("/documents/chunks/c-1")
    assert res.status_code == 403
    assert "not currently approved" in res.json()["detail"]


# ── An administrator keeps the incident-review read ──────────────────────────


@pytest.mark.parametrize(
    "overrides",
    [{"document_status": "retired"}, {"expiry_date": YESTERDAY},
     {"document_retired_at": "2026-02-02T00:00:00"}],
    ids=["retired", "expired", "soft-deleted"],
)
def test_an_admin_may_read_a_withdrawn_passage(as_user, overrides):
    res = as_user(ADMIN, _row(**overrides)).get("/documents/chunks/c-1")
    assert res.status_code == 200
    assert res.json()["currently_valid"] is False
    assert "Vancomycin" in res.json()["content"]


def test_an_admin_sees_retired_flagged(as_user):
    body = as_user(ADMIN, _row(document_retired_at="2026-02-02T00:00:00")).get(
        "/documents/chunks/c-1"
    ).json()
    assert body["retired"] is True


# ── Boundaries ───────────────────────────────────────────────────────────────


def test_an_unknown_chunk_is_404_for_everyone(as_user):
    assert as_user(NURSE, None).get("/documents/chunks/nope").status_code == 404
    main.app.dependency_overrides.clear()
    assert as_user(ADMIN, None).get("/documents/chunks/nope").status_code == 404


def test_an_unauthenticated_call_is_refused(monkeypatch):
    monkeypatch.setattr(documents_router, "db_cursor", _db(_row()))
    main.app.dependency_overrides.clear()
    res = TestClient(main.app, raise_server_exceptions=False).get("/documents/chunks/c-1")
    assert res.status_code in (401, 403)


def test_the_query_is_by_chunk_id(as_user, monkeypatch):
    """The endpoint must look the row up by the id it was given, nothing else."""
    captured = {}

    @contextmanager
    def spy():
        cur = _Cursor(_row())
        yield cur, None
        captured["executed"] = cur.executed

    monkeypatch.setattr(documents_router, "db_cursor", spy)
    main.app.dependency_overrides[get_current_user] = lambda: NURSE
    TestClient(main.app).get("/documents/chunks/c-1")
    (sql, params), = captured["executed"]
    assert "WHERE c.chunk_id = %s" in sql
    assert params == ("c-1",)
