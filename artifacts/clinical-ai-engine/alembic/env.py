"""
Alembic environment.

Deliberately imports nothing from the application: migrations must be runnable
against a database without booting the engine, and must not change behaviour
because application code changed.
"""
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required to run migrations.")

# SQLAlchemy wants an explicit driver; psycopg2 is what the app uses.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

config.set_main_option("sqlalchemy.url", DATABASE_URL)

# The schema is hand-written SQL rather than SQLAlchemy models (the app uses
# psycopg2 directly), so there is no metadata to autogenerate from.
target_metadata = None


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
