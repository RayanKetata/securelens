"""Brings the database schema up to date with Alembic migrations."""
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine import Engine


BACKEND_DIR = Path(__file__).resolve().parent.parent

# The schema the app created before migrations existed.
BASELINE_REVISION = "0001_baseline"

logger = logging.getLogger("securelens")


def alembic_config(connection=None) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))

    if connection is not None:
        config.attributes["connection"] = connection

    return config


def upgrade_database(engine: Engine) -> None:
    """Apply every pending migration in one transaction.

    A database created before migrations existed (it has the `systems`
    table but no `alembic_version` table) is first marked as being at the
    baseline revision, so its existing tables and data are kept.
    """
    with engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        config = alembic_config(connection)

        if "alembic_version" not in tables and "systems" in tables:
            logger.info(
                "Existing database without migration history; "
                "marking it at %s.",
                BASELINE_REVISION,
            )
            command.stamp(config, BASELINE_REVISION)

        command.upgrade(config, "head")
