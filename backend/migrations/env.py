"""Alembic environment.

Works two ways:
- From the command line (`python -m alembic upgrade head`): connects with
  the app's own engine, so DATABASE_URL comes from backend/.env.
- From app.migrate.upgrade_database(): an open connection is passed in
  config.attributes["connection"] and reused.
"""
from logging.config import fileConfig

from alembic import context

from app import models  # noqa: F401  (registers every table on Base.metadata)
from app.database import Base


config = context.config
target_metadata = Base.metadata

connection = config.attributes.get("connection")

# Only configure logging for command-line runs, so the API server keeps
# its own logging setup.
if connection is None and config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)


def run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # SQLite cannot alter most constraints in place; batch mode
        # recreates the table instead. No effect on PostgreSQL.
        render_as_batch=connection.dialect.name == "sqlite",
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    raise SystemExit(
        "Offline (--sql) mode is not supported; run against a database."
    )

if connection is not None:
    run_migrations(connection)
else:
    from app.database import engine

    with engine.connect() as new_connection:
        run_migrations(new_connection)
        new_connection.commit()
