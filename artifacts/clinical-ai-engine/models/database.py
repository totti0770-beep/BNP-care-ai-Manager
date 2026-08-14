import os
import threading
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool as pg_pool
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "")

POOL_MIN = int(os.environ.get("DB_POOL_MIN", "1"))
POOL_MAX = int(os.environ.get("DB_POOL_MAX", "10"))

# A connection per request exhausts Postgres max_connections under load and adds
# a TLS handshake to every query.
_pool: "pg_pool.ThreadedConnectionPool | None" = None
_pool_lock = threading.Lock()


def _get_pool() -> "pg_pool.ThreadedConnectionPool":
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                if not DATABASE_URL:
                    raise RuntimeError("DATABASE_URL is not set")
                _pool = pg_pool.ThreadedConnectionPool(
                    POOL_MIN,
                    POOL_MAX,
                    DATABASE_URL,
                    cursor_factory=RealDictCursor,
                )
                logger.info(f"Database pool ready ({POOL_MIN}-{POOL_MAX} connections)")
    return _pool


def get_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


@contextmanager
def db_cursor():
    pool = _get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            yield cur, conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def close_pool() -> None:
    global _pool
    with _pool_lock:
        if _pool is not None:
            _pool.closeall()
            _pool = None


def init_db():
    """Create all required tables if they don't exist."""
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is required. The engine cannot record an audit trail "
            "without it, and must not answer clinical questions unaudited."
        )

    ddl = """
    CREATE TABLE IF NOT EXISTS bnp_users (
        id          SERIAL PRIMARY KEY,
        username    VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name   VARCHAR(200),
        role        VARCHAR(50) DEFAULT 'user',
        external_id VARCHAR(255) UNIQUE,
        created_at  TIMESTAMP DEFAULT NOW()
    );

    -- Added after the table shipped; harmless when the column already exists.
    ALTER TABLE bnp_users ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external
        ON bnp_users(external_id) WHERE external_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS bnp_documents (
        id          VARCHAR(64) PRIMARY KEY,
        filename    TEXT NOT NULL,
        uploaded_by INTEGER REFERENCES bnp_users(id),
        upload_date TIMESTAMP DEFAULT NOW(),
        chunk_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bnp_chunks (
        id          SERIAL PRIMARY KEY,
        chunk_id    VARCHAR(128) UNIQUE NOT NULL,
        document_id VARCHAR(64) REFERENCES bnp_documents(id) ON DELETE CASCADE,
        content     TEXT NOT NULL,
        page_number INTEGER DEFAULT 1,
        chunk_index INTEGER DEFAULT 0,
        created_at  TIMESTAMP DEFAULT NOW()
    );

    -- The audit log must be able to answer "what did the system tell this nurse,
    -- from which sources, at this time?" — so the answer itself is recorded, not
    -- just the question.
    CREATE TABLE IF NOT EXISTS bnp_audit_log (
        id          SERIAL PRIMARY KEY,
        session_id  VARCHAR(128) NOT NULL,
        user_id     INTEGER REFERENCES bnp_users(id),
        username    VARCHAR(100),
        query       TEXT NOT NULL,
        query_type  VARCHAR(50),
        confidence  FLOAT DEFAULT 0,
        rejected    BOOLEAN DEFAULT FALSE,
        answer_hash TEXT,
        timestamp   TIMESTAMP DEFAULT NOW()
    );

    -- Added after the table shipped; each is a no-op when already present.
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS answer_text      TEXT;
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS dose_text        TEXT;
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS citations        JSONB;
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS safety_alerts    JSONB;
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS confidence_label VARCHAR(20);
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS client_ip        VARCHAR(64);
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS user_agent       TEXT;
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS model            VARCHAR(100);
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS drug_db_version  VARCHAR(50);
    ALTER TABLE bnp_audit_log ADD COLUMN IF NOT EXISTS engine_version   VARCHAR(50);

    CREATE INDEX IF NOT EXISTS idx_audit_user ON bnp_audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_session ON bnp_audit_log(session_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON bnp_chunks(document_id);
    """

    # Failing here must be fatal: the previous behaviour logged the error and
    # let the service boot and report healthy with no tables, so the first
    # clinical request 500'd instead of the deploy failing.
    with db_cursor() as (cur, _):
        cur.execute(ddl)
    logger.info("✅ Database tables initialized")
