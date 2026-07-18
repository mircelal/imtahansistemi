"""Exam scoring profiles + exam_category / scoring_profile_id

Revision ID: 20260717_0021
Revises: 20260716_0020
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from app.services.exam_scoring_profiles import BUILTIN_SCORING_PROFILES

revision = "20260717_0021"
down_revision = "20260716_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    json_type = JSONB() if bind.dialect.name == "postgresql" else sa.JSON()

    profiles = op.create_table(
        "exam_scoring_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(32), nullable=False, server_default="custom"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("formula_config", json_type, nullable=False),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_exam_scoring_profiles_category", "exam_scoring_profiles", ["category"])
    op.create_index("ix_exam_scoring_profiles_is_builtin", "exam_scoring_profiles", ["is_builtin"])
    op.create_index("ix_exam_scoring_profiles_is_active", "exam_scoring_profiles", ["is_active"])
    op.create_index("ix_exam_scoring_profiles_created_by_id", "exam_scoring_profiles", ["created_by_id"])

    op.add_column(
        "exams",
        sa.Column("exam_category", sa.String(32), nullable=False, server_default="custom"),
    )
    op.add_column(
        "exams",
        sa.Column("scoring_profile_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_exams_exam_category", "exams", ["exam_category"])
    op.create_index("ix_exams_scoring_profile_id", "exams", ["scoring_profile_id"])
    op.create_foreign_key(
        "fk_exams_scoring_profile_id_exam_scoring_profiles",
        "exams",
        "exam_scoring_profiles",
        ["scoring_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )

    now = datetime.utcnow()
    rows = []
    for p in BUILTIN_SCORING_PROFILES:
        fc = dict(p["formula_config"])
        fc["slug"] = p["slug"]
        rows.append(
            {
                "name": p["name"],
                "category": p["category"],
                "description": p.get("description"),
                "formula_config": fc,
                "is_builtin": True,
                "is_active": True,
                "created_at": now,
                "created_by_id": None,
            }
        )
    if rows:
        op.bulk_insert(profiles, rows)


def downgrade() -> None:
    op.drop_constraint("fk_exams_scoring_profile_id_exam_scoring_profiles", "exams", type_="foreignkey")
    op.drop_index("ix_exams_scoring_profile_id", table_name="exams")
    op.drop_index("ix_exams_exam_category", table_name="exams")
    op.drop_column("exams", "scoring_profile_id")
    op.drop_column("exams", "exam_category")
    op.drop_index("ix_exam_scoring_profiles_created_by_id", table_name="exam_scoring_profiles")
    op.drop_index("ix_exam_scoring_profiles_is_active", table_name="exam_scoring_profiles")
    op.drop_index("ix_exam_scoring_profiles_is_builtin", table_name="exam_scoring_profiles")
    op.drop_index("ix_exam_scoring_profiles_category", table_name="exam_scoring_profiles")
    op.drop_table("exam_scoring_profiles")
