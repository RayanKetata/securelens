"""Add authenticator-app multi-factor authentication to accounts.

Existing accounts keep signing in with only their password until each
user turns MFA on under Settings.

Revision ID: 0004_user_mfa
Revises: 0003_evidence_extraction_details
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_user_mfa"
down_revision = "0003_evidence_extraction_details"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("mfa_secret", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("mfa_pending_secret", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("mfa_last_step", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("mfa_recovery_codes", sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_column("mfa_recovery_codes")
        batch.drop_column("mfa_last_step")
        batch.drop_column("mfa_pending_secret")
        batch.drop_column("mfa_secret")
