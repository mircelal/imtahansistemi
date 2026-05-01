"""system_settings key-value

Revision ID: 20260430_0005
Revises: 20260430_0004
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa

revision = "20260430_0005"
down_revision = "20260430_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("system_settings")
