"""link exam_tickets to exams

Revision ID: 20260430_0004
Revises: 20260430_0003
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa

revision = "20260430_0004"
down_revision = "20260430_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exam_tickets", sa.Column("exam_id", sa.Integer(), nullable=True))
    op.create_index("ix_exam_tickets_exam_id", "exam_tickets", ["exam_id"])
    op.create_foreign_key(
        "fk_exam_tickets_exam_id_exams",
        "exam_tickets",
        "exams",
        ["exam_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_exam_tickets_exam_id_exams", "exam_tickets", type_="foreignkey")
    op.drop_index("ix_exam_tickets_exam_id", table_name="exam_tickets")
    op.drop_column("exam_tickets", "exam_id")
