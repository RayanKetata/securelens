"""Baseline: systems, controls, and evidence.

Matches the schema the app created with create_all() before migrations
were added (commit 05101fd). Databases created by that version are
stamped at this revision instead of running it.

Revision ID: 0001_baseline
Revises:
"""
from alembic import op
import sqlalchemy as sa


revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "systems",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("owner", sa.String(200), nullable=False),
        sa.Column("environment", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("risk", sa.String(50), nullable=False),
    )
    op.create_index("ix_systems_id", "systems", ["id"])

    op.create_table(
        "system_controls",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "system_id",
            sa.Integer(),
            sa.ForeignKey("systems.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("family", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("analyst_notes", sa.Text(), nullable=False),
        sa.Column("findings", sa.Text(), nullable=False),
        sa.UniqueConstraint("system_id", "code", name="uq_system_control_code"),
    )
    op.create_index("ix_system_controls_id", "system_controls", ["id"])
    op.create_index("ix_system_controls_system_id", "system_controls", ["system_id"])

    op.create_table(
        "evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "system_control_id",
            sa.Integer(),
            sa.ForeignKey("system_controls.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("stored_filename", sa.String(255), nullable=False, unique=True),
        sa.Column("content_type", sa.String(120), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("extraction_status", sa.String(50), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_evidence_id", "evidence", ["id"])
    op.create_index("ix_evidence_system_control_id", "evidence", ["system_control_id"])


def downgrade():
    op.drop_table("evidence")
    op.drop_table("system_controls")
    op.drop_table("systems")
