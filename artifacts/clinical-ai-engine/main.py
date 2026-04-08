"""
BNP Clinical AI Engine
Hospital-grade nursing AI backend built with FastAPI + FAISS + PostgreSQL + OpenAI GPT-4o

Endpoints:
  POST /auth/register       Register a new user
  POST /auth/login          Login → JWT token
  GET  /auth/me             Current user info
  GET  /auth/audit-log      Admin: full audit log

  POST /documents/upload    Upload PDF → extract → chunk → index in FAISS
  GET  /documents/          List all indexed documents
  DELETE /documents/{id}    Admin: remove document + vectors

  POST /query/              Main clinical query (auth required)
  GET  /health              Health check
"""
import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from models.database import init_db
from routers import auth, documents, query

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🏥 BNP Clinical AI Engine starting…")
    init_db()
    # Pre-load retriever, then sync FAISS with DB to recover any lost documents
    from services.embeddings import get_retriever
    r = get_retriever()
    logger.info(f"   FAISS on-disk: {r.chunk_count} chunks")
    r.sync_from_db()
    logger.info(f"✅ Retriever ready — {r.chunk_count} chunks indexed")

    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        logger.info("✅ OpenAI API key detected — GPT-4o response generation enabled")
    else:
        logger.warning("⚠️  OPENAI_API_KEY not set — using RAG-only fallback responses")

    yield
    logger.info("🛑 BNP Clinical AI Engine shutting down…")


app = FastAPI(
    title="BNP Clinical AI Engine",
    description=(
        "Hospital-grade nursing AI assistant. "
        "Answers ONLY from indexed clinical documents. "
        "Includes hybrid RAG search, drug dose calculator, safety layer, and JWT auth."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router,      prefix="/auth",      tags=["Authentication"])
app.include_router(documents.router, prefix="/documents", tags=["Documents"])
app.include_router(query.router,     prefix="/query",     tags=["Clinical Query"])


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
def health():
    from services.embeddings import get_retriever
    r = get_retriever()
    return {
        "status": "ok",
        "service": "BNP Clinical AI Engine",
        "version": "1.0.0",
        "indexed_chunks": r.chunk_count,
        "openai_enabled": bool(os.environ.get("OPENAI_API_KEY", "")),
        "database": bool(os.environ.get("DATABASE_URL", "")),
    }


@app.get("/", tags=["System"])
def root():
    return JSONResponse({
        "service": "BNP Clinical AI Engine",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "auth": ["/auth/register", "/auth/login", "/auth/me"],
            "documents": ["/documents/upload", "/documents/"],
            "query": ["/query/"],
        },
    })
