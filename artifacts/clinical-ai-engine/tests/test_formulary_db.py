"""
The formulary against a real database.

Three things can only be checked here: that the rows migration 0003 seeds
actually satisfy the safety contract, that an import round-trips the way it
claims to, and that a pharmacist's approval is what turns a dose on.

Skipped unless TEST_DATABASE_URL points at a disposable database.
"""
import os

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="set TEST_DATABASE_URL to a disposable database to run these",
)

MAPPING = """
generic_name: Generic Name
unit: Unit
source_name: Reference
source_ref: Page
dose_per_kg: Dose per kg
adult_flat_min: Adult Min
adult_flat_max: Adult Max
adult_max_daily: Max Daily
overdose_threshold_absolute: Overdose Total
contraindications: Contraindications
"""

HEADER = (
    "Generic Name,Unit,Reference,Page,Dose per kg,Adult Min,Adult Max,"
    "Max Daily,Overdose Total,Contraindications\n"
)
ONDANSETRON = "ondansetron,mg,Hospital Formulary,p.212,,4,8,32,64,congenital long QT\n"


def csv_bytes(*rows: str) -> bytes:
    return (HEADER + "".join(rows)).encode()


@pytest.fixture
def db():
    from models.database import db_cursor, init_db

    init_db()
    with db_cursor() as (cur, _):
        cur.execute("DELETE FROM bnp_audit_log")
        # The audit log is attributable by design, so its rows need a real user.
        cur.execute(
            "INSERT INTO bnp_users (id, username, password_hash, role) "
            "VALUES (1, 'pharmacy@hospital.example', 'x', 'admin') "
            "ON CONFLICT (id) DO NOTHING"
        )
        # Leave the seeded 17 in place; remove anything a previous test added.
        cur.execute(
            "DELETE FROM bnp_drug_formulary WHERE source_name NOT LIKE 'seed%%'"
        )
        cur.execute(
            "UPDATE bnp_drug_formulary SET review_status='pending', "
            "reviewed_by=NULL, reviewer_license=NULL, reviewed_at=NULL"
        )
    return db_cursor


@pytest.fixture
def formulary(db):
    from services.formulary import Formulary

    f = Formulary()
    f.reload()
    return f


def run_import(content: bytes, *, name="formulary.csv", dry_run=False):
    from services.formulary_import import import_formulary, load_mapping

    return import_formulary(
        content=content,
        file_name=name,
        mapping=load_mapping(MAPPING),
        actor="pharmacy@hospital.example",
        dry_run=dry_run,
    )


# ── The seeded rows must satisfy the contract they are governed by ────────────

def test_the_seed_lands_entirely_unapproved(formulary):
    """
    Migrating must not confer an approval nobody gave. Every seeded row is a
    figure transcribed out of a Python literal that no pharmacist ever signed.
    """
    counts = formulary.counts()
    assert counts["total"] == 17
    assert counts["approved"] == 0
    assert counts["pending"] == 17


def test_the_seed_reports_itself_unverified(formulary):
    assert formulary.review_summary().startswith("UNVERIFIED")


def test_every_seeded_drug_declares_a_unit(formulary):
    for entry in formulary.all():
        assert entry.unit in ("mg", "unit"), f"{entry.generic_name}: {entry.unit!r}"


def test_no_seeded_unit_dosed_drug_carries_milligram_figures(formulary):
    """Heparin was modelled in milligrams. It is dosed in international units."""
    for entry in formulary.all():
        if entry.unit == "mg":
            continue
        assert entry.auto_calculate is False
        for field in (
            "dose_per_kg", "adult_max_dose", "adult_max_daily",
            "overdose_threshold_absolute", "overdose_threshold_per_kg",
            "pediatric_min_per_kg",
        ):
            assert not getattr(entry, field), (
                f"{entry.generic_name} is unit-dosed but sets {field}"
            )


def test_no_seeded_absolute_threshold_is_really_a_per_kg_value(formulary):
    """The enoxaparin defect, checked across the whole seeded set."""
    for entry in formulary.all():
        if entry.overdose_threshold_absolute and entry.adult_max_daily:
            assert entry.overdose_threshold_absolute >= entry.adult_max_daily, (
                f"{entry.generic_name}: absolute overdose threshold is below "
                "the daily maximum, so it is a per-kg value in the wrong field"
            )


def test_no_seeded_per_kg_threshold_is_below_its_own_dose(formulary):
    for entry in formulary.all():
        if entry.overdose_threshold_per_kg and entry.dose_per_kg:
            assert entry.overdose_threshold_per_kg >= entry.dose_per_kg, (
                f"{entry.generic_name}: every therapeutic dose would be flagged"
            )


def test_every_seeded_drug_is_findable_in_arabic(formulary):
    for entry in formulary.all():
        assert entry.name_ar, f"{entry.generic_name} has no Arabic name"
        assert formulary.get(entry.name_ar) is entry


# ── The database refuses the defects too ──────────────────────────────────────

@pytest.mark.parametrize(
    "columns,values,constraint",
    [
        ("unit, auto_calculate", "'unit', TRUE", "unit_autocalc"),
        (
            "unit, adult_max_daily, overdose_threshold_absolute",
            "'mg', 180, 2",
            "overdose_absolute_sane",
        ),
        ("unit, pediatric_min_per_kg", "'mg', 5", "pediatric_pair"),
        ("unit, adult_flat_min", "'mg', 5", "adult_flat_pair"),
    ],
)
def test_the_schema_rejects_unsafe_rows(db, columns, values, constraint):
    """
    Validation lives in the importer, but the constraint is the backstop: a
    direct INSERT by any future code path must fail the same way.
    """
    import psycopg2

    with pytest.raises(psycopg2.errors.CheckViolation) as excinfo:
        with db() as (cur, _):
            cur.execute(
                f"INSERT INTO bnp_drug_formulary "
                f"(generic_name, source_name, {columns}) "
                f"VALUES ('probe', 'test', {values})"
            )
    assert constraint in str(excinfo.value)


def test_the_schema_requires_a_source(db):
    import psycopg2

    with pytest.raises(psycopg2.errors.CheckViolation):
        with db() as (cur, _):
            cur.execute(
                "INSERT INTO bnp_drug_formulary (generic_name, unit, source_name) "
                "VALUES ('probe', 'mg', '   ')"
            )


# ── Import round trip ─────────────────────────────────────────────────────────

def test_a_dry_run_writes_nothing(db, formulary):
    before = len(formulary.all())
    report = run_import(csv_bytes(ONDANSETRON), dry_run=True)

    assert report.tally("inserted") == 1
    formulary.reload()
    assert len(formulary.all()) == before, "a dry run must not touch the table"


def test_applying_an_import_adds_the_drug(db, formulary):
    run_import(csv_bytes(ONDANSETRON))
    formulary.reload()

    entry = formulary.get("ondansetron")
    assert entry is not None
    assert entry.adult_flat == (4.0, 8.0)
    assert entry.source_name == "Hospital Formulary"


def test_an_imported_drug_arrives_pending(db, formulary):
    """Importing is not approving. Only a pharmacist can turn a dose on."""
    from models.formulary import CoverageStatus

    run_import(csv_bytes(ONDANSETRON))
    formulary.reload()
    assert formulary.coverage_status("ondansetron") is CoverageStatus.PENDING_REVIEW


def test_the_import_records_the_file_it_came_from(db):
    run_import(csv_bytes(ONDANSETRON), name="moh-formulary-2026.csv")
    with db() as (cur, _):
        cur.execute(
            "SELECT imported_from_file, imported_file_sha256, imported_by "
            "FROM bnp_drug_formulary WHERE generic_name='ondansetron'"
        )
        row = cur.fetchone()
    assert row["imported_from_file"] == "moh-formulary-2026.csv"
    assert len(row["imported_file_sha256"]) == 64
    assert row["imported_by"] == "pharmacy@hospital.example"


def test_reimporting_the_same_file_changes_nothing(db, formulary):
    run_import(csv_bytes(ONDANSETRON))
    again = run_import(csv_bytes(ONDANSETRON))

    assert again.already_imported is True
    assert again.tally("updated") == 0


def test_a_rejected_row_does_not_block_the_valid_ones(db, formulary):
    bad = "badrow,IU,Hospital Formulary,p.1,,1,2,3,4,\n"
    report = run_import(csv_bytes(ONDANSETRON, bad))

    assert report.tally("inserted") == 1
    assert report.tally("rejected") == 1
    formulary.reload()
    assert formulary.get("ondansetron") is not None
    assert formulary.get("badrow") is None


# ── The property the whole mechanism exists for ───────────────────────────────

def approve(db, name, status="approved"):
    with db() as (cur, _):
        cur.execute(
            "UPDATE bnp_drug_formulary SET review_status=%s, "
            "reviewed_by='Dr Pharmacist', reviewer_license='SCFHS-12345', "
            "reviewed_at=NOW() WHERE generic_name=%s",
            (status, name),
        )


def test_an_approved_drug_quotes_a_dose(db, formulary):
    from services.drug_calculator import calculate_dose

    approve(db, "paracetamol")
    formulary.reload()

    result = calculate_dose(formulary.get("paracetamol"), "paracetamol dose", 70)
    assert result.calculated_dose is not None
    assert "1050" in result.calculated_dose


def test_a_pending_drug_quotes_no_dose(db, formulary):
    from services.drug_calculator import calculate_dose

    result = calculate_dose(formulary.get("paracetamol"), "paracetamol dose", 70)
    assert result.calculated_dose is None
    assert result.overdose_threshold is None
    assert "not been signed off" in result.safe_range


def test_a_pending_drug_cannot_hard_block(db, formulary):
    """
    An overdose block computed from figures nobody signed off is a false alarm
    waiting to happen, and alarm fatigue is its own hazard.
    """
    from services.drug_calculator import SafetyEngine

    dose, alerts = SafetyEngine.calculate_dose_kg(formulary.get("gentamicin"), 120)
    assert dose is None
    assert alerts == []

    approve(db, "gentamicin")
    formulary.reload()
    dose, alerts = SafetyEngine.calculate_dose_kg(formulary.get("gentamicin"), 120)
    assert dose == 180.0
    assert any("OVERDOSE" in a for a in alerts)


def test_a_pending_drug_still_shows_its_contraindications(db, formulary):
    """Withholding an additive warning would be less safe, not more."""
    from services.drug_calculator import SafetyEngine

    alerts = SafetyEngine.check_contraindications(
        formulary.get("morphine"), ["severe asthma"]
    )
    assert len(alerts) == 1


def test_changing_a_dose_by_import_revokes_the_approval(db, formulary):
    """
    The failure this exists to prevent: a revised figure inheriting the old
    sign-off and continuing to be quoted as though a pharmacist had seen it.
    """
    from services.drug_calculator import calculate_dose

    run_import(csv_bytes(ONDANSETRON))
    approve(db, "ondansetron")
    formulary.reload()
    assert calculate_dose(formulary.get("ondansetron"), "", 70).safe_range.startswith("4.0")

    revised = ONDANSETRON.replace(",4,8,32,64,", ",4,8,16,64,")
    report = run_import(csv_bytes(revised), name="formulary-rev2.csv")

    row = [r for r in report.rows if r.generic_name == "ondansetron"][0]
    assert row.action == "updated"
    assert "adult_max_daily" in row.changed_fields

    formulary.reload()
    entry = formulary.get("ondansetron")
    assert entry.review_status.value == "pending"
    assert entry.reviewed_by is None
    assert entry.version == 2
    assert calculate_dose(entry, "", 70).calculated_dose is None


def test_an_unchanged_reimport_keeps_the_approval(db, formulary):
    """Re-running an import an operator is unsure about must be safe."""
    run_import(csv_bytes(ONDANSETRON))
    approve(db, "ondansetron")

    run_import(csv_bytes(ONDANSETRON), name="same-content-new-name.csv")
    formulary.reload()
    assert formulary.get("ondansetron").review_status.value == "approved"


# ── Governance events are evidence ────────────────────────────────────────────

def test_a_review_decision_lands_on_the_audit_chain(db):
    from routers.auth import verify_audit_chain
    from services.audit_events import record_formulary_event

    record_formulary_event(
        user_id=1,
        username="pharmacy@hospital.example",
        action="formulary.review.approved",
        detail="drug=paracetamol reviewer=Dr Pharmacist licence=SCFHS-12345",
    )

    result = verify_audit_chain(limit=100, _admin={"role": "admin"})
    assert result["valid"] is True
    assert result["rows_checked"] == 1


def test_governance_events_chain_with_clinical_answers(db):
    """
    One continuous chain, not two parallel ones — a chain that skips the
    approvals cannot evidence them.
    """
    from routers.auth import verify_audit_chain
    from services.audit_events import record_formulary_event

    for i in range(3):
        record_formulary_event(
            user_id=1,
            username="pharmacy@hospital.example",
            action="formulary.import",
            detail=f"file=f{i}.csv inserted=1",
        )

    result = verify_audit_chain(limit=100, _admin={"role": "admin"})
    assert result["valid"] is True
    assert result["rows_checked"] == 3


def test_tampering_with_a_recorded_approval_is_detected(db):
    from routers.auth import verify_audit_chain
    from services.audit_events import record_formulary_event

    record_formulary_event(
        user_id=1, username="pharmacy", action="formulary.review.approved",
        detail="drug=morphine reviewer=Dr Pharmacist",
    )
    record_formulary_event(
        user_id=1, username="pharmacy", action="formulary.import",
        detail="file=later.csv",
    )

    with db() as (cur, _):
        cur.execute(
            "UPDATE bnp_audit_log SET answer_text = %s "
            "WHERE answer_text LIKE 'drug=morphine%%'",
            ("drug=morphine reviewer=Someone Else",),
        )

    result = verify_audit_chain(limit=100, _admin={"role": "admin"})
    assert result["valid"] is False
