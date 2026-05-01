"""add sheet_uuid to answer_sheet_templates

Revision ID: 0003_sheet_uuid
Revises: 0002_questions_tickets
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = "20260430_0003"
down_revision = "20260430_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "answer_sheet_templates",
        sa.Column("sheet_uuid", sa.String(64), nullable=True),
    )
    op.create_index(
        "ix_answer_sheet_templates_sheet_uuid",
        "answer_sheet_templates",
        ["sheet_uuid"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_answer_sheet_templates_sheet_uuid", table_name="answer_sheet_templates")
    op.drop_column("answer_sheet_templates", "sheet_uuid")
