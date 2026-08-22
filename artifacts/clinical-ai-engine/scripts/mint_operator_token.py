"""
Mint an engine token for an operator running a script, and print it.

Why this exists: `scripts/apply_jsh_formulary.py` deliberately drives the real
HTTP API rather than writing rows, so every import and approval lands on the
tamper-evident audit chain with an actor attached. That requires a bearer
token, and in a deployment where sign-in goes through the gateway there is no
engine password account to log into.

This mints the same shape of token the gateway mints for a signed-in admin
(`artifacts/api-server/src/lib/engineToken.ts`) — issuer `bnp-gateway`, so the
engine resolves it onto a real `bnp_users` row and the audit log names a
person, not a service account.

It confers no authority that `JWT_SECRET` does not already confer: anyone who
can read that variable can already sign anything the engine accepts. Keep the
printed token out of logs and shell history; it is a credential.

    python scripts/mint_operator_token.py --subject <id> --username <email> [--ttl 3600]

`--subject` should be the operator's stable user id (the gateway uses the
`users.id` of the signed-in account). Reusing the same subject across runs
keeps every action attributed to one `bnp_users` row instead of creating a new
one each time.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def mint(secret: str, subject: str, username: str, role: str, ttl: int) -> str:
    now = int(time.time())
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64url(
        json.dumps(
            {
                "iss": "bnp-gateway",
                "sub": subject,
                "username": username,
                "role": role,
                "iat": now,
                "exp": now + ttl,
            }
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    signature = b64url(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subject", required=True, help="Stable operator user id")
    parser.add_argument("--username", required=True, help="Operator email or name")
    parser.add_argument("--role", default="admin", choices=("admin", "user"))
    parser.add_argument(
        "--ttl",
        type=int,
        default=3600,
        help=(
            "Seconds until the token expires (default 3600). The gateway uses "
            "300 because it mints one per request; a script making hundreds of "
            "calls needs longer than a single request does."
        ),
    )
    args = parser.parse_args()

    secret = os.environ.get("JWT_SECRET") or os.environ.get("ENGINE_JWT_SECRET")
    if not secret:
        print(
            "JWT_SECRET (or ENGINE_JWT_SECRET) must be set to the engine's "
            "signing secret.",
            file=sys.stderr,
        )
        return 1

    print(mint(secret, args.subject, args.username, args.role, args.ttl))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
