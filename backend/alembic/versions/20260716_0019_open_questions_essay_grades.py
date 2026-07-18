"""grid_in/essay question types + essay_grades + answer_key length

Revision ID: 20260716_0019
Revises: 20260714_0018
"""

from alembic import op
import sqlalchemy as sa

revision = "20260716_0019"
down_revision = "20260714_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TYPE questiontype ADD VALUE IF NOT EXISTS 'GRID_IN'"))
        op.execute(sa.text("ALTER TYPE questiontype ADD VALUE IF NOT EXISTS 'ESSAY'"))
        # SQLAlchemy Enum(QuestionType) stores member *names* by default (MCQ/TF),
        # but values are lowercase (mcq/tf). Add lowercase aliases too for safety.
        op.execute(sa.text("ALTER TYPE questiontype ADD VALUE IF NOT EXISTS 'grid_in'"))
        op.execute(sa.text("ALTER TYPE questiontype ADD VALUE IF NOT EXISTS 'essay'"))

    op.alter_column(
        "answer_keys",
        "correct_answer",
        existing_type=sa.String(length=8),
        type_=sa.String(length=64),
        existing_nullable=False,
    )

    op.create_table(
        "essay_grades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scan_result_id", sa.Integer(), sa.ForeignKey("scan_results.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("question_number", sa.Integer(), nullable=False),
        sa.Column("awarded_points", sa.Float(), nullable=False, server_default="0"),
        sa.Column("max_points", sa.Float(), nullable=False, server_default="1"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("graded_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("graded_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_essay_grades_scan_result_id", "essay_grades", ["scan_result_id"])
    op.create_index("ix_essay_grades_question_id", "essay_grades", ["question_id"])
    op.create_unique_constraint(
        "uq_essay_grades_result_qnum",
        "essay_grades",
        ["scan_result_id", "question_number"],
    )

    # ScanResult: essay crop paths (question_number -> image path)
    op.add_column(
        "scan_results",
        sa.Column("essay_crops", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scan_results", "essay_crops")
    op.drop_constraint("uq_essay_grades_result_qnum", "essay_grades", type_="unique")
    op.drop_index("ix_essay_grades_question_id", table_name="essay_grades")
    op.drop_index("ix_essay_grades_scan_result_id", table_name="essay_grades")
    op.drop_table("essay_grades")
    op.alter_column(
        "answer_keys",
        "correct_answer",
        existing_type=sa.String(length=64),
        type_=sa.String(length=8),
        existing_nullable=False,
    )
    # PostgreSQL enum values cannot be removed easily — leave them.
