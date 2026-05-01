"""kurs operator təyinatı; imtahan scheduled_at / seat_quota

Revision ID: 20260501_0010
Revises: 20260501_0009
"""

from alembic import op
import sqlalchemy as sa

revision = "20260501_0010"
down_revision = "20260501_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "course_operators",
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "operator_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index("ix_course_operators_operator_user_id", "course_operators", ["operator_user_id"])

    op.add_column("exams", sa.Column("scheduled_at", sa.DateTime(), nullable=True))
    op.add_column("exams", sa.Column("seat_quota", sa.Integer(), nullable=True))
    op.create_index("ix_exams_scheduled_at", "exams", ["scheduled_at"])


def downgrade() -> None:
    op.drop_index("ix_exams_scheduled_at", table_name="exams")
    op.drop_column("exams", "seat_quota")
    op.drop_column("exams", "scheduled_at")
    op.drop_index("ix_course_operators_operator_user_id", table_name="course_operators")
    op.drop_table("course_operators")
