"""mərkəzi sual bazası və questions.bank_question_id

Revision ID: 20260501_0008
Revises: 20260501_0007
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260501_0008"
down_revision = "20260501_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    qtype_enum = postgresql.ENUM("MCQ", "TF", name="questiontype", create_type=False)

    op.create_table(
        "bank_questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject_code", sa.String(64), nullable=False, server_default=""),
        sa.Column("difficulty", sa.String(16), nullable=False, server_default="medium"),
        sa.Column("qtype", qtype_enum, nullable=False),
        sa.Column("stem", sa.Text(), nullable=False),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("points", sa.Float(), nullable=False, server_default="1"),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_bank_questions_subject_code", "bank_questions", ["subject_code"])
    op.create_index("ix_bank_questions_difficulty", "bank_questions", ["difficulty"])

    op.add_column(
        "questions",
        sa.Column("bank_question_id", sa.Integer(), sa.ForeignKey("bank_questions.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_questions_bank_question_id", "questions", ["bank_question_id"])


def downgrade() -> None:
    op.drop_index("ix_questions_bank_question_id", table_name="questions")
    op.drop_column("questions", "bank_question_id")
    op.drop_index("ix_bank_questions_difficulty", table_name="bank_questions")
    op.drop_index("ix_bank_questions_subject_code", table_name="bank_questions")
    op.drop_table("bank_questions")
