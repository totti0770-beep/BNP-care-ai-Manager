"""
The operator token must be exactly what the gateway mints, or the engine will
resolve it onto a different user — or reject it — and the audit chain would
name the wrong actor.
"""
import os
import sys
from pathlib import Path

import jwt
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from mint_operator_token import mint  # noqa: E402

SECRET = "0" * 64


def decode(token):
    return jwt.decode(token, SECRET, algorithms=["HS256"])


def test_issuer_matches_the_gateway_so_the_engine_resolves_a_real_user():
    # routers/auth.GATEWAY_ISSUER; a different issuer takes the password-account
    # path instead and the token is rejected.
    assert decode(mint(SECRET, "7", "nurse@h.example", "admin", 60))["iss"] == "bnp-gateway"


def test_carries_the_subject_and_username_verbatim():
    claims = decode(mint(SECRET, "7", "nurse@h.example", "admin", 60))
    assert claims["sub"] == "7"
    assert claims["username"] == "nurse@h.example"


def test_expires():
    claims = decode(mint(SECRET, "7", "nurse@h.example", "admin", 60))
    assert claims["exp"] - claims["iat"] == 60


def test_a_wrong_secret_does_not_verify():
    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(mint("wrong-secret", "7", "n@h.example", "admin", 60), SECRET, algorithms=["HS256"])
