"""Scoring formula presets (named engines + default params)

Revision ID: 20260718_0023
Revises: 20260718_0022
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from app.services.scoring_formula_presets import BUILTIN_FORMULA_PRESETS

revision = "20260718_0023"
down_revision = "20260718_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    json_type = JSONB() if bind.dialect.name == "postgresql" else sa.JSON()

    presets = op.create_table(
        "scoring_formula_presets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(48), nullable=False),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("engine", sa.String(32), nullable=False, server_default="raw_sum"),
        sa.Column("default_params", json_type, nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("slug", name="uq_scoring_formula_presets_slug"),
    )
    op.create_index("ix_scoring_formula_presets_slug", "scoring_formula_presets", ["slug"])
    op.create_index("ix_scoring_formula_presets_engine", "scoring_formula_presets", ["engine"])
    op.create_index("ix_scoring_formula_presets_sort_order", "scoring_formula_presets", ["sort_order"])
    op.create_index("ix_scoring_formula_presets_is_builtin", "scoring_formula_presets", ["is_builtin"])
    op.create_index("ix_scoring_formula_presets_is_active", "scoring_formula_presets", ["is_active"])
    op.create_index("ix_scoring_formula_presets_created_by_id", "scoring_formula_presets", ["created_by_id"])

    now = datetime.utcnow()
    rows = [
        {
            "slug": p["slug"],
            "label": p["label"],
            "description": p.get("description"),
            "engine": p["engine"],
            "default_params": dict(p.get("default_params") or {}),
            "sort_order": int(p.get("sort_order") or 0),
            "is_builtin": True,
            "is_active": True,
            "created_at": now,
            "created_by_id": None,
        }
        for p in BUILTIN_FORMULA_PRESETS
    ]
    if rows:
        op.bulk_insert(presets, rows)


def downgrade() -> None:
    op.drop_index("ix_scoring_formula_presets_created_by_id", table_name="scoring_formula_presets")
    op.drop_index("ix_scoring_formula_presets_is_active", table_name="scoring_formula_presets")
    op.drop_index("ix_scoring_formula_presets_is_builtin", table_name="scoring_formula_presets")
    op.drop_index("ix_scoring_formula_presets_sort_order", table_name="scoring_formula_presets")
    op.drop_index("ix_scoring_formula_presets_engine", table_name="scoring_formula_presets")
    op.drop_index("ix_scoring_formula_presets_slug", table_name="scoring_formula_presets")
    op.drop_table("scoring_formula_presets")
