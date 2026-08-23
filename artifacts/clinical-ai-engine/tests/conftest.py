"""
Shared fixtures for the query-pipeline integration tests.

These exercise routers/query.py end to end with the retriever, the generator and
the database stubbed, so the refusal paths can be asserted without a Postgres
instance or an OpenAI key.
"""
import os

# Must be set before importing the app: routers/auth.py refuses to import
# without a signing secret, which is itself the behaviour we want.
os.environ.setdefault("JWT_SECRET", "test-secret-not-used-anywhere-real")
os.environ.setdefault("DATABASE_URL", "postgresql://stub/stub")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from models.schemas import QueryType  # noqa: E402
from routers import query as query_router  # noqa: E402
from routers.auth import get_current_user  # noqa: E402
from tests.formulary_fixture import build_formulary  # noqa: E402


CHUNK = {
    "chunk_id": "chunk-1",
    "document_id": "doc-1",
    "document_name": "Adult IV Drip.pdf",
    "page_number": 12,
    "chunk_index": 0,
    "content": (
        "Paracetamol for adults: 500-1000 mg every 6 hours, "
        "maximum 4 g per day. Reduce in hepatic impairment."
    ),
    "relevance_score": 0.82,
}


class StubRetriever:
    """Stands in for HybridRetriever."""

    def __init__(self, chunks=None, raises=None):
        self._chunks = [dict(c) for c in (chunks if chunks is not None else [CHUNK])]
        self._raises = raises
        self.degraded_reason = None

    @property
    def is_available(self):
        return self._raises is None

    @property
    def chunk_count(self):
        return len(self._chunks)

    def hybrid_search(self, query, top_k=5):
        if self._raises is not None:
            raise self._raises
        return self._chunks[:top_k]


class AuditRecorder:
    """Captures audit writes, or fails them on demand."""

    # Mirrors the positional signature of routers.query._log_query.
    POSITIONAL = (
        "user_id",
        "username",
        "session_id",
        "query",
        "query_type",
        "confidence",
        "rejected",
    )

    def __init__(self, fail=False):
        self.rows = []
        self.fail = fail

    def __call__(self, *args, **kwargs):
        if self.fail:
            raise RuntimeError("simulated audit write failure")
        row = dict(zip(self.POSITIONAL, args))
        row.update(kwargs)
        self.rows.append(row)


@pytest.fixture
def engine(monkeypatch):
    """
    Returns a builder: engine(chunks=..., retriever_raises=..., audit_fails=...)
    yielding (client, audit_recorder).
    """
    created = {}

    def _build(
        chunks=None,
        retriever_raises=None,
        audit_fails=False,
        formulary=None,
        answer="Paracetamol 500-1000 mg every 6 hours, maximum 4 g per day.",  # noqa: E501
        query_type=QueryType.DRUG,
    ):
        retriever = StubRetriever(chunks=chunks, raises=retriever_raises)
        audit = AuditRecorder(fail=audit_fails)
        # The drug data lives in a table now. Pass formulary=... to test what
        # the pipeline does for a drug that is pending review or absent.
        drugs = build_formulary() if formulary is None else formulary

        monkeypatch.setattr(query_router, "get_retriever", lambda: retriever)
        monkeypatch.setattr(query_router, "get_formulary", lambda: drugs)
        monkeypatch.setattr(query_router, "_log_query", audit)
        monkeypatch.setattr(query_router, "classify_query", lambda q: query_type)
        # generate_response returns the raw BNP-sectioned string, which
        # query.py then parses.
        monkeypatch.setattr(
            query_router,
            "generate_response",
            lambda question, chunks, query_type, citations: f"Answer: {answer}",
        )
        monkeypatch.setattr(query_router, "translate_for_search", lambda q: q)

        main.app.dependency_overrides[get_current_user] = lambda: {
            "sub": "1",
            "username": "nurse@hospital.example",
            "role": "user",
        }

        client = TestClient(main.app, raise_server_exceptions=False)
        created["client"] = client
        return client, audit

    yield _build

    main.app.dependency_overrides.clear()
