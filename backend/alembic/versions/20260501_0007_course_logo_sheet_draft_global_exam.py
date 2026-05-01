"""course logo; answer sheet draft; optional exam course_id

Revision ID: 20260501_0007
Revises: 20260501_0006
"""

from alembic import op
import sqlalchemy as sa

revision = "20260501_0007"
down_revision = "20260501_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("logo_object_key", sa.String(512), nullable=True))
    op.add_column("courses", sa.Column("logo_content_type", sa.String(64), nullable=True))

    op.alter_column("exams", "course_id", existing_type=sa.Integer(), nullable=True)

    op.add_column(
        "answer_sheet_templates",
        sa.Column("is_draft", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.alter_column("answer_sheet_templates", "pdf_path", existing_type=sa.String(512), nullable=True)


def downgrade() -> None:
    op.execute(
        """
        UPDATE answer_sheet_templates SET pdf_path = '' WHERE pdf_path IS NULL;
        """
    )
    op.alter_column("answer_sheet_templates", "pdf_path", existing_type=sa.String(512), nullable=False)

    op.drop_column("answer_sheet_templates", "is_draft")

    op.alter_column("exams", "course_id", existing_type=sa.Integer(), nullable=False)

    op.drop_column("courses", "logo_content_type")
    op.drop_column("courses", "logo_object_key")
