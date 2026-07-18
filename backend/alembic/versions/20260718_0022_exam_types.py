"""Exam types table + seed of builtin categories

Revision ID: 20260718_0022
Revises: 20260717_0021
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa

revision = "20260718_0022"
down_revision = "20260717_0021"
branch_labels = None
depends_on = None

_BUILTIN_TYPES = (
    ("buraxilis", "Buraxılış", "DİM buraxılış imtahanı", 10),
    ("blok", "Blok", "Blok imtahanı", 20),
    ("sinif", "Sinif", "Sinif / məktəb imtahanı", 30),
    ("qebul", "Qəbul", "DİM qəbul (ixtisas qrupları)", 40),
    ("custom", "Sərbəst", "Sərbəst / xüsusi imtahan növü", 50),
)


def upgrade() -> None:
    exam_types = op.create_table(
        "exam_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(32), nullable=False),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("default_scoring_profile_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(
            ["default_scoring_profile_id"],
            ["exam_scoring_profiles.id"],
            name="fk_exam_types_default_scoring_profile_id",
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("slug", name="uq_exam_types_slug"),
    )
    op.create_index("ix_exam_types_slug", "exam_types", ["slug"])
    op.create_index("ix_exam_types_sort_order", "exam_types", ["sort_order"])
    op.create_index("ix_exam_types_is_builtin", "exam_types", ["is_builtin"])
    op.create_index("ix_exam_types_is_active", "exam_types", ["is_active"])
    op.create_index("ix_exam_types_default_scoring_profile_id", "exam_types", ["default_scoring_profile_id"])

    now = datetime.utcnow()
    rows = [
        {
            "slug": slug,
            "label": label,
            "description": description,
            "sort_order": sort_order,
            "is_builtin": True,
            "is_active": True,
            "default_scoring_profile_id": None,
            "created_at": now,
        }
        for slug, label, description, sort_order in _BUILTIN_TYPES
    ]
    op.bulk_insert(exam_types, rows)

    bind = op.get_bind()
    for type_slug in ("buraxilis", "qebul"):
        profile_id = bind.execute(
            sa.text(
                "SELECT id FROM exam_scoring_profiles "
                "WHERE is_builtin = true AND category = :cat "
                "ORDER BY id ASC LIMIT 1"
            ),
            {"cat": type_slug},
        ).scalar()
        if profile_id is not None:
            bind.execute(
                sa.text(
                    "UPDATE exam_types SET default_scoring_profile_id = :pid WHERE slug = :slug"
                ),
                {"pid": int(profile_id), "slug": type_slug},
            )


def downgrade() -> None:
    op.drop_index("ix_exam_types_default_scoring_profile_id", table_name="exam_types")
    op.drop_index("ix_exam_types_is_active", table_name="exam_types")
    op.drop_index("ix_exam_types_is_builtin", table_name="exam_types")
    op.drop_index("ix_exam_types_sort_order", table_name="exam_types")
    op.drop_index("ix_exam_types_slug", table_name="exam_types")
    op.drop_table("exam_types")
