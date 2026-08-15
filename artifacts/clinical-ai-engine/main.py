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
from fastapi.responses import JSONResponse, PlainTextResponse
from contextlib import asynccontextmanager

from models.database import init_db
from middleware.logging import RequestLoggingMiddleware, configure_logging
from middleware.rate_limit import RateLimitMiddleware
from routers import auth, documents, formulary as formulary_router, query
from services.formulary import get_formulary

# JSON in production so logs are shippable and queryable; human-readable
# locally. Set LOG_FORMAT=json or LOG_FORMAT=text to override.
configure_logging(
    as_json=os.environ.get("LOG_FORMAT", "text").lower() == "json"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🏥 BNP Clinical AI Engine starting…")
    init_db()
    # Pre-load retriever, then sync FAISS with DB to recover any lost documents
    from services.embeddings import get_retriever
    r = get_retriever()

    if r.is_available:
        logger.info(f"   FAISS on-disk: {r.chunk_count} chunks")
        r.sync_from_db()
        logger.info(f"✅ Retriever ready — {r.chunk_count} chunks indexed")
    else:
        # Serve /health so an operator can see why, but refuse clinical queries.
        logger.error(
            f"❌ Retriever unavailable ({r.degraded_reason}). "
            "Clinical queries will be refused with 503 until this is fixed."
        )

    # The formulary is data now, not code, so it is loaded here and republished
    # on every import. Without it no medication question can be answered.
    formulary = get_formulary()
    formulary.reload()
    if formulary.is_available:
        logger.info(f"   Formulary {formulary.version()} — {formulary.review_summary()}")
    else:
        logger.error(
            f"❌ Formulary unavailable ({formulary.degraded_reason}). "
            "Clinical queries will be refused with 503 until this is fixed."
        )

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

# CORS — the engine is normally reached through the API server gateway, which is
# same-origin, so no browser origin is allowed by default. Set CORS_ORIGINS to a
# comma-separated allowlist only if a browser must call the engine directly.
# A wildcard is never used: combined with credentials it is both insecure and
# rejected by browsers.
_cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip() and origin.strip() != "*"
]

if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
else:
    logger.info("CORS disabled — engine expects same-origin gateway traffic only")

app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestLoggingMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router,      prefix="/auth",      tags=["Authentication"])
app.include_router(documents.router, prefix="/documents", tags=["Documents"])
app.include_router(query.router,     prefix="/query",     tags=["Clinical Query"])
app.include_router(
    formulary_router.router, prefix="/formulary", tags=["Formulary"]
)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
def health():
    """
    Reports "ok" only when the service can actually answer clinical questions.
    It previously reported "ok" with no database and with fake embeddings, which
    made the health check useless as a deployment gate.
    """
    from services.embeddings import get_retriever
    r = get_retriever()
    _formulary = get_formulary()

    database = bool(os.environ.get("DATABASE_URL", ""))
    problems = []
    if not database:
        problems.append("DATABASE_URL is not set")
    if not r.is_available:
        problems.append(r.degraded_reason or "retrieval backend unavailable")
    if r.chunk_count == 0:
        problems.append("no documents indexed")
    if not _formulary.is_available:
        problems.append(
            _formulary.degraded_reason or "medication formulary unavailable"
        )

    body = {
        "status": "ok" if not problems else "degraded",
        "service": "BNP Clinical AI Engine",
        "version": "1.0.0",
        "indexed_chunks": r.chunk_count,
        "openai_enabled": bool(os.environ.get("OPENAI_API_KEY", "")),
        "database": database,
        "drug_db_version": _formulary.version(),
        "drug_db_review_status": _formulary.review_summary(),
        "formulary": _formulary.counts(),
    }
    if problems:
        body["problems"] = problems
        return JSONResponse(status_code=503, content=body)
    return body


@app.get("/metrics", tags=["System"], response_class=PlainTextResponse)
def prometheus_metrics():
    """
    Prometheus text format. Unauthenticated because the engine is not exposed
    publicly — it is reachable only through the API server gateway — and because
    a scraper generally cannot present a user credential. It exposes counters
    only: no questions, no answers, no identifiers.
    """
    from services.embeddings import get_retriever
    from services.metrics import metrics

    r = get_retriever()
    return metrics.render(
        indexed_chunks=r.chunk_count,
        retriever_available=r.is_available,
    )


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
