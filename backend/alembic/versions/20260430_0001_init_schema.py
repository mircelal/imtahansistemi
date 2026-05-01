"""init schema

Revision ID: 20260430_0001
Revises:
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa

revision = "20260430_0001"
down_revision = None
branch_labels = None
depends_on = None


user_role_enum = sa.Enum("ADMIN", "MANAGER", "OPERATOR", name="userrole")
session_status_enum = sa.Enum("PENDING", "PROCESSING", "DONE", "ERROR", name="sessionstatus")
result_status_enum = sa.Enum("OK", "MANUAL_REVIEW", "ERROR", name="resultstatus")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", user_role_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "courses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("manager_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, default=True),
    )
    op.create_index("ix_courses_manager_id", "courses", ["manager_id"])

    op.create_table(
        "exams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("question_count", sa.Integer(), nullable=False),
        sa.Column("options_per_question", sa.Integer(), nullable=False),
        sa.Column("columns_count", sa.Integer(), nullable=False),
        sa.Column("negative_marking", sa.Boolean(), nullable=False, default=False),
        sa.Column("negative_ratio", sa.Float(), nullable=False, default=0),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, default=True),
    )
    op.create_index("ix_exams_course_id", "exams", ["course_id"])

    op.create_table(
        "answer_keys",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id"), nullable=False),
        sa.Column("question_number", sa.Integer(), nullable=False),
        sa.Column("correct_answer", sa.String(8), nullable=False),
        sa.Column("points", sa.Float(), nullable=False, default=1.0),
    )
    op.create_index("ix_answer_keys_exam_id", "answer_keys", ["exam_id"])

    op.create_table(
        "answer_sheet_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id"), nullable=False),
        sa.Column("template_config", sa.JSON(), nullable=False),
        sa.Column("pdf_path", sa.String(512), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_answer_sheet_templates_exam_id", "answer_sheet_templates", ["exam_id"])

    op.create_table(
        "students",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("student_number", sa.String(64), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_students_course_id", "students", ["course_id"])
    op.create_index("ix_students_student_number", "students", ["student_number"])

    op.create_table(
        "scan_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id"), nullable=False),
        sa.Column("operator_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", session_status_enum, nullable=False),
        sa.Column("total_images", sa.Integer(), nullable=False, default=0),
        sa.Column("processed_images", sa.Integer(), nullable=False, default=0),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "scan_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("scan_sessions.id"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=True),
        sa.Column("image_path", sa.String(512), nullable=False),
        sa.Column("detected_answers", sa.JSON(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("max_score", sa.Float(), nullable=True),
        sa.Column("status", result_status_enum, nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "manual_corrections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scan_result_id", sa.Integer(), sa.ForeignKey("scan_results.id"), nullable=False),
        sa.Column("corrected_answers", sa.JSON(), nullable=False),
        sa.Column("corrected_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("corrected_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("manual_corrections")
    op.drop_table("scan_results")
    op.drop_table("scan_sessions")
    op.drop_index("ix_students_student_number", table_name="students")
    op.drop_index("ix_students_course_id", table_name="students")
    op.drop_table("students")
    op.drop_index("ix_answer_sheet_templates_exam_id", table_name="answer_sheet_templates")
    op.drop_table("answer_sheet_templates")
    op.drop_index("ix_answer_keys_exam_id", table_name="answer_keys")
    op.drop_table("answer_keys")
    op.drop_index("ix_exams_course_id", table_name="exams")
    op.drop_table("exams")
    op.drop_index("ix_courses_manager_id", table_name="courses")
    op.drop_table("courses")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
