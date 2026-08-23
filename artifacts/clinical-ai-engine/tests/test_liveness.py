"""
Liveness must stay separate from readiness.

A platform healthcheck that treats "cannot answer clinical questions" as
"container is broken" restart-loops an engine that is merely waiting for an
API key or a corpus — and a restarting engine cannot serve /health to say so.
These lock the two apart: /livez answers while degraded, /health does not.
"""
import os

os.environ.setdefault("JWT_SECRET", "test-secret-not-used-anywhere-real")
os.environ.setdefault("DATABASE_URL", "postgresql://stub/stub")

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


def test_livez_answers_while_the_engine_is_unfit_to_serve():
    # No index, no embeddings — exactly the state a fresh deployment is in
    # before a corpus is loaded.
    client = TestClient(main.app, raise_server_exceptions=False)
    assert client.get("/livez").status_code == 200
    assert client.get("/livez").json()["status"] == "alive"


def test_health_still_refuses_in_that_same_state():
    client = TestClient(main.app, raise_server_exceptions=False)
    res = client.get("/health")
    assert res.status_code == 503
    body = res.json()
    assert body["status"] == "degraded"
    assert body["problems"]


def test_livez_never_claims_the_engine_can_answer():
    client = TestClient(main.app, raise_server_exceptions=False)
    body = client.get("/livez").json()
    # It reports process state only. Anything resembling a readiness signal
    # here would be read as "safe to send clinical traffic".
    assert set(body) == {"status", "service"}
