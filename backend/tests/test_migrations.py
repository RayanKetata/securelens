"""Migration tests. Each test uses its own temporary SQLite database."""
import os
import tempfile
import unittest
from pathlib import Path

_workspace = tempfile.TemporaryDirectory(prefix="securelens-migrations-")
os.environ.setdefault(
    "DATABASE_URL",
    "sqlite:///" + (Path(_workspace.name) / "unused.db").as_posix(),
)

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app import models
from app.database import Base
from app.migrate import BASELINE_REVISION, alembic_config, upgrade_database


BASELINE_TABLES = ["systems", "system_controls", "evidence"]


def tearDownModule():
    _workspace.cleanup()


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=_workspace.name)
        url = "sqlite:///" + (Path(self.directory.name) / "db.sqlite").as_posix()
        self.engine = create_engine(url)

    def tearDown(self):
        self.engine.dispose()
        self.directory.cleanup()

    def head(self):
        return ScriptDirectory.from_config(alembic_config()).get_current_head()

    def current(self):
        with self.engine.connect() as connection:
            return MigrationContext.configure(connection).get_current_revision()

    def tables(self):
        return set(inspect(self.engine).get_table_names())

    def columns(self, table):
        return {column["name"] for column in inspect(self.engine).get_columns(table)}

    def create_pre_migration_database(self):
        # What create_all() produced before migrations (commit 05101fd).
        # The baseline revision has exactly that schema; the current
        # models have moved on, so they cannot be used here.
        with self.engine.begin() as connection:
            command.upgrade(alembic_config(connection), BASELINE_REVISION)
            connection.execute(text("DROP TABLE alembic_version"))
        self.assertEqual(self.tables(), set(BASELINE_TABLES))
        with self.engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO systems (id, name, owner, environment, status, progress, risk) "
                "VALUES (1, 'Legacy Portal', 'IT', 'Production', 'Not Started', 0, 'Not Assessed')"
            ))
            connection.execute(text(
                "INSERT INTO system_controls (id, system_id, code, name, family, description, "
                "status, analyst_notes, findings) VALUES (1, 1, 'AC-2', 'Account Management', "
                "'Access Control', 'Review accounts.', 'Met', '', '')"
            ))

    def test_fresh_database_matches_models(self):
        upgrade_database(self.engine)

        self.assertEqual(self.current(), self.head())
        with self.engine.connect() as connection:
            differences = compare_metadata(
                MigrationContext.configure(connection), Base.metadata
            )
        # A non-empty list means a model changed without a migration:
        # run `python -m alembic revision --autogenerate -m "..."`.
        self.assertEqual(differences, [])

    def test_upgrade_is_repeatable(self):
        upgrade_database(self.engine)
        upgrade_database(self.engine)
        self.assertEqual(self.current(), self.head())

    def test_pre_migration_database_keeps_its_data(self):
        self.create_pre_migration_database()

        upgrade_database(self.engine)

        self.assertEqual(self.current(), self.head())
        self.assertTrue({"users", "user_sessions", "assessment_history", "activity_log"} <= self.tables())
        with self.engine.connect() as connection:
            self.assertEqual(connection.execute(text("SELECT name FROM systems")).scalar_one(), "Legacy Portal")
            self.assertEqual(connection.execute(text("SELECT status FROM system_controls")).scalar_one(), "Met")

    def test_early_history_table_is_repaired(self):
        # An early build created assessment_history without changed_by columns.
        self.create_pre_migration_database()
        with self.engine.begin() as connection:
            connection.execute(text(
                "CREATE TABLE assessment_history (id INTEGER PRIMARY KEY, "
                "system_control_id INTEGER NOT NULL REFERENCES system_controls(id) ON DELETE CASCADE, "
                "previous_status VARCHAR(50) NOT NULL, new_status VARCHAR(50) NOT NULL, "
                "analyst_notes TEXT NOT NULL, findings TEXT NOT NULL, changed_at DATETIME NOT NULL)"
            ))
            connection.execute(text(
                "INSERT INTO assessment_history VALUES "
                "(1, 1, 'Not Assessed', 'Met', '', '', '2026-11-01 10:00:00')"
            ))

        upgrade_database(self.engine)

        self.assertTrue({"changed_by", "changed_by_id"} <= self.columns("assessment_history"))
        with self.engine.connect() as connection:
            row = connection.execute(text(
                "SELECT new_status, changed_by, changed_by_id FROM assessment_history"
            )).one()
        self.assertEqual(tuple(row), ("Met", "", None))

    def test_downgrade_and_upgrade_round_trip(self):
        upgrade_database(self.engine)

        with self.engine.begin() as connection:
            config = alembic_config(connection)
            command.downgrade(config, BASELINE_REVISION)
        self.assertEqual(self.tables() - {"alembic_version"}, set(BASELINE_TABLES))

        with self.engine.begin() as connection:
            command.downgrade(alembic_config(connection), "base")
        self.assertEqual(self.tables() - {"alembic_version"}, set())

        upgrade_database(self.engine)
        self.assertEqual(self.current(), self.head())
        self.assertIn(models.ActivityEvent.__tablename__, self.tables())


if __name__ == "__main__":
    unittest.main()
