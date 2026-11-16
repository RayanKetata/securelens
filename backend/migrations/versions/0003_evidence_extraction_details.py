"""Record how evidence text was extracted (text layer or OCR).

Existing evidence keeps its text. Its method stays empty, because it
is not known which files had a text layer; re-running extraction from
the app fills it in.

Revision ID: 0003_evidence_extraction_details
Revises: 0002_accounts_history_activity
"""
from alembic import op
import sqlalchemy as sa


revision = "0003_evidence_extraction_details"
down_revision = "0002_accounts_history_activity"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("evidence") as batch:
        batch.add_column(sa.Column("extraction_method", sa.String(length=20), nullable=True))
        batch.add_column(sa.Column(
            "extraction_note", sa.String(length=200), nullable=False, server_default="",
        ))


def downgrade():
    with op.batch_alter_table("evidence") as batch:
        batch.drop_column("extraction_note")
        batch.drop_column("extraction_method")
