"""JWT Authentication router."""
import os
import json
import jwt
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from models.schemas import UserRegister, UserLogin, TokenResponse
from models.database import db_cursor

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer()

pwd_ctx = CryptContext(schemes=["bcrypt", "sha256_crypt"], deprecated=["sha256_crypt"])

# No default. A publicly known signing key is worse than a service that refuses
# to start, because nothing downstream can tell the difference.
JWT_SECRET = os.environ.get("JWT_SECRET", "").strip()
if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET is required. Generate one with: openssl rand -hex 32"
    )

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

# Tokens minted by the API server on behalf of a signed-in user. See
# artifacts/api-server/src/lib/engineToken.ts.
GATEWAY_ISSUER = "bnp-gateway"

# Externally-authenticated accounts can never be password-authenticated: this
# sentinel is not a valid hash, so verify_password always fails against it.
EXTERNAL_ACCOUNT_SENTINEL = "!external-identity-no-password"


def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_ctx.verify(plain, hashed)
    except ValueError:
        # Unrecognised hash (e.g. an external-identity sentinel) — not a match.
        return False


def create_token(user_id: int, username: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _resolve_gateway_user(payload: dict) -> dict:
    """
    Map a gateway-issued token onto a real bnp_users row, creating one on first
    sight. The row is what the audit log references, so every clinical action is
    attributable to an individual rather than to a shared service account.

    The gateway is authoritative for the role: it derives it from the operator's
    ADMIN_EMAILS allowlist, so the engine does not re-derive or override it.
    """
    external_id = payload.get("sub")
    if not external_id:
        raise HTTPException(status_code=401, detail="Token has no subject")

    username = (payload.get("username") or external_id)[:100]
    role = "admin" if payload.get("role") == "admin" else "user"

    with db_cursor() as (cur, _):
        cur.execute(
            "SELECT id FROM bnp_users WHERE external_id = %s",
            (external_id,),
        )
        row = cur.fetchone()

        if row is None:
            cur.execute(
                """
                INSERT INTO bnp_users (username, password_hash, full_name, role, external_id)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (username) DO UPDATE
                    SET external_id = EXCLUDED.external_id
                RETURNING id
                """,
                (username, EXTERNAL_ACCOUNT_SENTINEL, username, role, external_id),
            )
            row = cur.fetchone()
        else:
            # Keep the stored role in step with the identity provider.
            cur.execute(
                "UPDATE bnp_users SET role = %s, username = %s WHERE id = %s",
                (role, username, row["id"]),
            )

    return {"sub": str(row["id"]), "username": username, "role": role}


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    payload = decode_token(credentials.credentials)
    if payload.get("iss") == GATEWAY_ISSUER:
        return _resolve_gateway_user(payload)
    return payload


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.post("/register", status_code=201)
def register(body: UserRegister, _admin: dict = Depends(require_admin)):
    """
    Create a local (password) account. Admin-only, and the role is taken from
    the validated enum rather than accepted as free-form client input — this
    endpoint previously allowed anyone to register themselves as an admin.
    """
    hashed = hash_password(body.password)
    try:
        with db_cursor() as (cur, _):
            cur.execute(
                "INSERT INTO bnp_users (username, password_hash, full_name, role) VALUES (%s, %s, %s, %s) RETURNING id",
                (body.username, hashed, body.full_name, body.role.value),
            )
            user_id = cur.fetchone()["id"]
        return {"message": "User registered", "user_id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Username already exists")
        logger.error(f"Registration failed: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin):
    with db_cursor() as (cur, _):
        cur.execute(
            "SELECT id, username, password_hash, full_name, role FROM bnp_users WHERE username = %s",
            (body.username,),
        )
        row = cur.fetchone()

    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(row["id"], row["username"], row["role"])
    return TokenResponse(
        access_token=token,
        expires_in=JWT_EXPIRE_HOURS * 3600,
        user={"id": row["id"], "username": row["username"], "role": row["role"], "full_name": row["full_name"]},
    )


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.get("/audit-log")
def audit_log(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _admin: dict = Depends(require_admin),
):
    with db_cursor() as (cur, _):
        cur.execute(
            """
            SELECT * FROM bnp_audit_log
            ORDER BY timestamp DESC
            LIMIT %s OFFSET %s
            """,
            (limit, offset),
        )
        return cur.fetchall()


@router.get("/audit-log/verify")
def verify_audit_chain(
    limit: int = Query(default=5000, ge=1, le=100000),
    _admin: dict = Depends(require_admin),
):
    """
    Walk the audit hash chain and report the first row that does not verify.

    Each row's chain_hash covers the previous row's chain_hash plus this row's
    clinically meaningful content, so editing a past answer or deleting a row
    invalidates every hash after it. This endpoint is what turns that property
    into something an auditor can actually check.

    Rows written before the chain was introduced have no chain_hash and are
    reported as unchained rather than as failures.
    """
    from routers.query import GENESIS_HASH, compute_chain_hash

    with db_cursor() as (cur, _):
        cur.execute(
            """
            SELECT id, session_id, username, query, answer_text, rejected,
                   citations, prev_hash, chain_hash, timestamp
            FROM bnp_audit_log
            ORDER BY id ASC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()

    checked = 0
    unchained = 0
    expected_prev = GENESIS_HASH

    for row in rows:
        if not row["chain_hash"]:
            unchained += 1
            continue

        actual = compute_chain_hash(
            prev_hash=row["prev_hash"] or GENESIS_HASH,
            session_id=row["session_id"],
            username=row["username"],
            query=row["query"],
            answer=row["answer_text"] or "",
            rejected=bool(row["rejected"]),
            citations=row["citations"],
        )

        if actual != row["chain_hash"]:
            return {
                "valid": False,
                "reason": "content does not match its recorded hash",
                "broken_at_id": row["id"],
                "timestamp": row["timestamp"],
                "rows_checked": checked,
            }

        if row["prev_hash"] != expected_prev:
            return {
                "valid": False,
                "reason": "chain is discontinuous — a preceding row was altered or removed",
                "broken_at_id": row["id"],
                "timestamp": row["timestamp"],
                "rows_checked": checked,
            }

        expected_prev = row["chain_hash"]
        checked += 1

    return {
        "valid": True,
        "rows_checked": checked,
        "unchained_legacy_rows": unchained,
    }
