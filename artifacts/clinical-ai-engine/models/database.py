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


# The revision this build expects. Pinned deliberately rather than read from
# the migration directory: an older image must refuse to start against a
# database that a newer one has already migrated.
ALEMBIC_HEAD = "0002_audit_integrity"


def _alembic_config():
    from alembic.config import Config
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg = Config(os.path.join(here, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "alembic"))
    return cfg


def run_migrations() -> None:
    """Apply pending migrations. Intended for a one-shot deploy job."""
    from alembic import command
    command.upgrade(_alembic_config(), "head")
    logger.info("✅ Database migrations applied")


def current_revision() -> "str | None":
    with db_cursor() as (cur, _):
        cur.execute(
            "SELECT to_regclass('public.alembic_version') IS NOT NULL AS present"
        )
        if not cur.fetchone()["present"]:
            return None
        cur.execute("SELECT version_num FROM alembic_version LIMIT 1")
        row = cur.fetchone()
        return row["version_num"] if row else None


def init_db():
    """
    Ensure the schema is at the expected revision.

    Schema changes belong in a one-shot migration job, not in every app process:
    several replicas booting at once would race on DDL, and there would be no
    ordering between them. AUTO_MIGRATE=1 (the default, for single-instance and
    Replit deployments) applies migrations here instead; set it to 0 wherever a
    dedicated migrate step runs first, and the engine will refuse to start
    against an unmigrated database rather than fail later on a missing column.
    """
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is required. The engine cannot record an audit trail "
            "without it, and must not answer clinical questions unaudited."
        )

    auto = os.environ.get("AUTO_MIGRATE", "1").strip().lower() in ("1", "true", "yes")

    if auto:
        run_migrations()
        return

    revision = current_revision()
    if revision is None:
        raise RuntimeError(
            "The database has no migration history. Run `alembic upgrade head` "
            "before starting the engine, or set AUTO_MIGRATE=1."
        )
    if revision != ALEMBIC_HEAD:
        raise RuntimeError(
            f"Database is at revision {revision}, but this build expects "
            f"{ALEMBIC_HEAD}. Run `alembic upgrade head`."
        )
    logger.info(f"✅ Schema at expected revision {revision}")
