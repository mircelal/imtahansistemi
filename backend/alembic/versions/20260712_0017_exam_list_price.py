"""imtahan rəsmi qiyməti (Bilik) + mövcud kurslar üçün wallet seed

Revision ID: 20260712_0017
Revises: 20260705_0016
"""

from alembic import op
import sqlalchemy as sa

revision = "20260712_0017"
down_revision = "20260705_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "exams",
        sa.Column("list_price_amount", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "exams",
        sa.Column("list_price_currency", sa.String(length=8), nullable=False, server_default="AZN"),
    )
    op.execute(
        """
        INSERT INTO course_wallets (course_id, balance_cents, currency, updated_at)
        SELECT c.id, 0, 'AZN', NOW()
        FROM courses c
        WHERE NOT EXISTS (
            SELECT 1 FROM course_wallets w WHERE w.course_id = c.id
        )
        """
    )


def downgrade() -> None:
    op.drop_column("exams", "list_price_currency")
    op.drop_column("exams", "list_price_amount")
