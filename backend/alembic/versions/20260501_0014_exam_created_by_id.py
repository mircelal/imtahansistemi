"""exam created_by_id for course-less exam ownership

Revision ID: 20260501_0014
Revises: 20260501_0013
"""

from alembic import op
import sqlalchemy as sa

revision = "20260501_0014"
down_revision = "20260501_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "exams",
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_exams_created_by_id", "exams", ["created_by_id"])


def downgrade() -> None:
    op.drop_index("ix_exams_created_by_id", table_name="exams")
    op.drop_column("exams", "created_by_id")
