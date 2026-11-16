"""Accounts, sessions, assessment history, and activity log.

Builds of this work before migrations existed created some of these
tables with create_all(), and one early build created assessment_history
without the changed_by columns. This revision therefore creates only the
tables that are missing and adds those two columns if needed, so it is
safe on a fresh database and on any of those earlier databases.

Revision ID: 0002_accounts_history_activity
Revises: 0001_baseline
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_accounts_history_activity"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def _existing_tables():
    return set(sa.inspect(op.get_bind()).get_table_names())


def _existing_columns(table):
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    tables = _existing_tables()

    if "users" not in tables:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("username", sa.String(80), nullable=False),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_users_id", "users", ["id"])
        op.create_index("ix_users_username", "users", ["username"], unique=True)

    if "user_sessions" not in tables:
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("token_hash", sa.String(64), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_user_sessions_id", "user_sessions", ["id"])
        op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
        op.create_index(
            "ix_user_sessions_token_hash", "user_sessions", ["token_hash"], unique=True
        )

    if "assessment_history" not in tables:
        op.create_table(
            "assessment_history",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "system_control_id",
                sa.Integer(),
                sa.ForeignKey("system_controls.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("previous_status", sa.String(50), nullable=False),
            sa.Column("new_status", sa.String(50), nullable=False),
            sa.Column("analyst_notes", sa.Text(), nullable=False),
            sa.Column("findings", sa.Text(), nullable=False),
            sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column(
                "changed_by_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("changed_by", sa.String(80), nullable=False),
        )
        op.create_index("ix_assessment_history_id", "assessment_history", ["id"])
        op.create_index(
            "ix_assessment_history_system_control_id",
            "assessment_history",
            ["system_control_id"],
        )
    else:
        # Repair the early build's table in place, keeping its rows.
        columns = _existing_columns("assessment_history")

        with op.batch_alter_table("assessment_history") as batch:
            if "changed_by_id" not in columns:
                batch.add_column(sa.Column("changed_by_id", sa.Integer(), nullable=True))
                batch.create_foreign_key(
                    "fk_assessment_history_changed_by_id_users",
                    "users",
                    ["changed_by_id"],
                    ["id"],
                    ondelete="SET NULL",
                )

            if "changed_by" not in columns:
                batch.add_column(
                    sa.Column(
                        "changed_by",
                        sa.String(80),
                        nullable=False,
                        server_default="",
                    )
                )

    if "activity_log" not in tables:
        op.create_table(
            "activity_log",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column(
                "actor_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("actor", sa.String(80), nullable=False),
            sa.Column("action", sa.String(50), nullable=False),
            sa.Column("summary", sa.String(500), nullable=False),
            sa.Column("client", sa.String(64), nullable=False),
        )
        op.create_index("ix_activity_log_id", "activity_log", ["id"])
        op.create_index("ix_activity_log_occurred_at", "activity_log", ["occurred_at"])
        op.create_index("ix_activity_log_action", "activity_log", ["action"])


def downgrade():
    op.drop_table("activity_log")
    op.drop_table("assessment_history")
    op.drop_table("user_sessions")
    op.drop_table("users")
