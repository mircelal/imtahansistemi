"""exam resale fields; ticket order student; course wallet seed

Revision ID: 20260501_0013
Revises: 0012_answer_sheet_layout_presets
"""

from alembic import op
import sqlalchemy as sa

revision = "20260501_0013"
down_revision = "0012_answer_sheet_layout_presets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("resale_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("exams", sa.Column("delivery_mode", sa.String(length=16), nullable=False, server_default="in_person"))
    op.add_column("exams", sa.Column("venue", sa.String(length=255), nullable=True))
    op.add_column("exams", sa.Column("city", sa.String(length=128), nullable=True))

    op.add_column(
        "ticket_orders",
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_ticket_orders_student_id", "ticket_orders", ["student_id"])

    op.create_table(
        "course_wallets",
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("balance_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="AZN"),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "wallet_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("tx_type", sa.String(length=32), nullable=False),
        sa.Column("ref_type", sa.String(length=64), nullable=True),
        sa.Column("ref_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("wallet_transactions")
    op.drop_table("course_wallets")
    op.drop_index("ix_ticket_orders_student_id", table_name="ticket_orders")
    op.drop_column("ticket_orders", "student_id")
    op.drop_column("exams", "city")
    op.drop_column("exams", "venue")
    op.drop_column("exams", "delivery_mode")
    op.drop_column("exams", "resale_enabled")
