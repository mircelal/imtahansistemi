"""payment_intents + ticket_orders.payment_intent_id

Revision ID: 20260718_0024
Revises: 20260718_0023
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260718_0024"
down_revision = "20260718_0023"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns(table)}
    return column in cols


def _has_table(table: str) -> bool:
    bind = op.get_bind()
    return inspect(bind).has_table(table)


def upgrade() -> None:
    if not _has_table("payment_intents"):
        op.create_table(
            "payment_intents",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=36), nullable=False),
            sa.Column("purpose", sa.String(length=32), nullable=False),
            sa.Column("amount_cents", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(length=8), nullable=False, server_default="AZN"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("driver", sa.String(length=32), nullable=False),
            sa.Column("external_id", sa.String(length=128), nullable=True),
            sa.Column("checkout_url", sa.String(length=1024), nullable=True),
            sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="SET NULL"), nullable=True),
            sa.Column("ticket_order_id", sa.Integer(), nullable=True),
            sa.Column("buyer_email", sa.String(length=255), nullable=True),
            sa.Column("meta", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("paid_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_payment_intents_public_id", "payment_intents", ["public_id"], unique=True)
        op.create_index("ix_payment_intents_purpose", "payment_intents", ["purpose"])
        op.create_index("ix_payment_intents_status", "payment_intents", ["status"])
        op.create_index("ix_payment_intents_driver", "payment_intents", ["driver"])
        op.create_index("ix_payment_intents_external_id", "payment_intents", ["external_id"])
        op.create_index("ix_payment_intents_course_id", "payment_intents", ["course_id"])
        op.create_index("ix_payment_intents_ticket_order_id", "payment_intents", ["ticket_order_id"])
        op.create_index(
            "uq_payment_intents_driver_external",
            "payment_intents",
            ["driver", "external_id"],
            unique=True,
            postgresql_where=sa.text("external_id IS NOT NULL"),
        )

    if not _has_column("ticket_orders", "payment_method"):
        op.add_column(
            "ticket_orders",
            sa.Column("payment_method", sa.String(length=32), nullable=False, server_default="fiscal"),
        )
    if not _has_column("ticket_orders", "cashier_name"):
        op.add_column("ticket_orders", sa.Column("cashier_name", sa.String(length=255), nullable=True))
    if not _has_column("ticket_orders", "payment_intent_id"):
        op.add_column(
            "ticket_orders",
            sa.Column("payment_intent_id", sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            "fk_ticket_orders_payment_intent_id",
            "ticket_orders",
            "payment_intents",
            ["payment_intent_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index("ix_ticket_orders_payment_intent_id", "ticket_orders", ["payment_intent_id"])

    # Deferred FK: payment_intents.ticket_order_id -> ticket_orders
    bind = op.get_bind()
    fks = {fk["name"] for fk in inspect(bind).get_foreign_keys("payment_intents")}
    if "fk_payment_intents_ticket_order_id" not in fks:
        op.create_foreign_key(
            "fk_payment_intents_ticket_order_id",
            "payment_intents",
            "ticket_orders",
            ["ticket_order_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table("payment_intents"):
        fks = {fk["name"] for fk in inspect(bind).get_foreign_keys("payment_intents")}
        if "fk_payment_intents_ticket_order_id" in fks:
            op.drop_constraint("fk_payment_intents_ticket_order_id", "payment_intents", type_="foreignkey")
    if _has_column("ticket_orders", "payment_intent_id"):
        op.drop_constraint("fk_ticket_orders_payment_intent_id", "ticket_orders", type_="foreignkey")
        op.drop_index("ix_ticket_orders_payment_intent_id", table_name="ticket_orders")
        op.drop_column("ticket_orders", "payment_intent_id")
    if _has_table("payment_intents"):
        op.drop_table("payment_intents")
