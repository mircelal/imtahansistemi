"""Cavab kartı dizayn şablonları (answer_sheet_layout_presets) və imtahan əlaqəsi."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012_answer_sheet_layout_presets"
down_revision = "20260501_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "answer_sheet_layout_presets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("template_config", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index(
        "ix_answer_sheet_layout_presets_name_course",
        "answer_sheet_layout_presets",
        ["course_id", "name"],
    )

    op.add_column(
        "exams",
        sa.Column(
            "answer_sheet_preset_id",
            sa.Integer(),
            sa.ForeignKey("answer_sheet_layout_presets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_exams_answer_sheet_preset_id", "exams", ["answer_sheet_preset_id"])

    op.add_column(
        "answer_sheet_templates",
        sa.Column(
            "layout_preset_id",
            sa.Integer(),
            sa.ForeignKey("answer_sheet_layout_presets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_answer_sheet_templates_layout_preset_id",
        "answer_sheet_templates",
        ["layout_preset_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_answer_sheet_templates_layout_preset_id", table_name="answer_sheet_templates")
    op.drop_column("answer_sheet_templates", "layout_preset_id")

    op.drop_index("ix_exams_answer_sheet_preset_id", table_name="exams")
    op.drop_column("exams", "answer_sheet_preset_id")

    op.drop_index("ix_answer_sheet_layout_presets_name_course", table_name="answer_sheet_layout_presets")
    op.drop_table("answer_sheet_layout_presets")
