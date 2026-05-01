"""students unique per course; exam grading_config / grading_policy; scan score_breakdown

Revision ID: 20260501_0006
Revises: 20260430_0005
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa

revision = "20260501_0006"
down_revision = "20260430_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_students_course_student_number", "students", ["course_id", "student_number"])
    op.add_column(
        "exams",
        sa.Column(
            "grading_config",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )
    op.add_column(
        "exams",
        sa.Column(
            "grading_policy",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )
    op.add_column(
        "scan_results",
        sa.Column("score_breakdown", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scan_results", "score_breakdown")
    op.drop_column("exams", "grading_policy")
    op.drop_column("exams", "grading_config")
    op.drop_constraint("uq_students_course_student_number", "students", type_="unique")
