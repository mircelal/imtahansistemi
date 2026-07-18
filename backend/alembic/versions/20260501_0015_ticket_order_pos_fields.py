"""ticket_orders: ödəniş növü və kassir adı (POS)

Revision ID: 20260501_0015
Revises: 20260501_0014
"""

from alembic import op
import sqlalchemy as sa

revision = "20260501_0015"
down_revision = "20260501_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ticket_orders",
        sa.Column("payment_method", sa.String(length=32), nullable=False, server_default="fiscal"),
    )
    op.add_column(
        "ticket_orders",
        sa.Column("cashier_name", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ticket_orders", "cashier_name")
    op.drop_column("ticket_orders", "payment_method")
