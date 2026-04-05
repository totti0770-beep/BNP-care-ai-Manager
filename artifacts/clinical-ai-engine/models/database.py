import os
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "")


def get_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


@contextmanager
def db_cursor():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            yield cur, conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create all required tables if they don't exist."""
    if not DATABASE_URL:
        logger.warning("DATABASE_URL not set — skipping DB init")
        return

    ddl = """
    CREATE TABLE IF NOT EXISTS bnp_users (
        id          SERIAL PRIMARY KEY,
        username    VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name   VARCHAR(200),
        role        VARCHAR(50) DEFAULT 'user',
        created_at  TIMESTAMP DEFAULT NOW()
    );

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

    CREATE INDEX IF NOT EXISTS idx_audit_user ON bnp_audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_session ON bnp_audit_log(session_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON bnp_chunks(document_id);
    """

    try:
        with db_cursor() as (cur, _):
            cur.execute(ddl)
        logger.info("✅ Database tables initialized")
    except Exception as e:
        logger.error(f"DB init error: {e}")
