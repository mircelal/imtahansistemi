"""students.course_id optional (platform / self-register)

Revision ID: 20260718_0025
Revises: 20260718_0024
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260718_0025"
down_revision = "20260718_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "students",
        "course_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.drop_constraint("uq_students_course_student_number", "students", type_="unique")
    op.create_index(
        "uq_students_course_student_number_not_null",
        "students",
        ["course_id", "student_number"],
        unique=True,
        postgresql_where=sa.text("course_id IS NOT NULL"),
    )
    op.create_index(
        "uq_students_student_number_no_course",
        "students",
        ["student_number"],
        unique=True,
        postgresql_where=sa.text("course_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_students_student_number_no_course", table_name="students")
    op.drop_index("uq_students_course_student_number_not_null", table_name="students")
    # Fail if any null course_id remains
    op.execute("UPDATE students SET course_id = (SELECT id FROM courses ORDER BY id LIMIT 1) WHERE course_id IS NULL")
    op.alter_column(
        "students",
        "course_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.create_unique_constraint(
        "uq_students_course_student_number",
        "students",
        ["course_id", "student_number"],
    )
