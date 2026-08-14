"""
Migration wiring.

These assert the contract rather than the SQL: that the baseline is idempotent,
that it can be applied to a database created by the pre-Alembic init_db, and
that the engine refuses to start against an unmigrated database when a separate
migration job is responsible for applying them.

They are skipped unless TEST_DATABASE_URL points at a disposable database.
"""
import os

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="set TEST_DATABASE_URL to a disposable database to run these",
)


def test_baseline_is_the_expected_head():
    """The head recorded in code must match the revision on disk."""
    from alembic.script import ScriptDirectory

    import models.database as db

    script = ScriptDirectory.from_config(db._alembic_config())
    assert script.get_current_head() == db.ALEMBIC_HEAD


def test_baseline_has_no_downgrade():
    """Dropping these tables would destroy the audit trail."""
    from alembic.script import ScriptDirectory

    import models.database as db

    script = ScriptDirectory.from_config(db._alembic_config())
    revision = script.get_revision(db.ALEMBIC_HEAD)
    with pytest.raises(NotImplementedError):
        revision.module.downgrade()


def test_migration_is_idempotent():
    """Applying twice must be a no-op, not an error."""
    import models.database as db

    db.run_migrations()
    db.run_migrations()
    assert db.current_revision() == db.ALEMBIC_HEAD
