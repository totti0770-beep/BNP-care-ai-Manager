"""JWT Authentication router."""
import os
import jwt
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from models.schemas import UserRegister, UserLogin, TokenResponse
from models.database import db_cursor

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer()

pwd_ctx = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

JWT_SECRET = os.environ.get("JWT_SECRET", "bnp-clinical-engine-secret-change-in-prod")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24


def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


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


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    return decode_token(credentials.credentials)


@router.post("/register", status_code=201)
def register(body: UserRegister):
    hashed = hash_password(body.password)
    try:
        with db_cursor() as (cur, _):
            cur.execute(
                "INSERT INTO bnp_users (username, password_hash, full_name, role) VALUES (%s, %s, %s, %s) RETURNING id",
                (body.username, hashed, body.full_name, body.role),
            )
            user_id = cur.fetchone()["id"]
        return {"message": "User registered", "user_id": user_id}
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Username already exists")
        raise HTTPException(status_code=500, detail=str(e))


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
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    with db_cursor() as (cur, _):
        cur.execute(
            "SELECT * FROM bnp_audit_log ORDER BY timestamp DESC LIMIT %s",
            (limit,),
        )
        return cur.fetchall()
