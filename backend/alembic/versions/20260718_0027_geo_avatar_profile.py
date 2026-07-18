"""Geo coordinates for map discovery (regions + venues)

Revision ID: 20260718_0027
Revises: 20260718_0026
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260718_0027"
down_revision = "20260718_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("regions", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("regions", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column("exam_venues", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("exam_venues", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column("users", sa.Column("avatar_object_key", sa.String(length=512), nullable=True))
    op.add_column("users", sa.Column("bio", sa.String(length=512), nullable=True))
    op.add_column("users", sa.Column("school_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("grade_label", sa.String(length=64), nullable=True))

    # Approximate region centers (Azerbaijan)
    op.execute(
        sa.text(
            """
            UPDATE regions SET latitude = v.lat, longitude = v.lng
            FROM (VALUES
                ('baki', 40.4093, 49.8671),
                ('absheron-xizi', 40.5897, 49.6686),
                ('gence-daskesen', 40.6828, 46.3606),
                ('seki-zaqatala', 41.1919, 47.1706),
                ('lenkeran-astara', 38.7543, 48.8512),
                ('quba-xacmaz', 41.3597, 48.5122),
                ('merkezi-aran', 40.0030, 47.8750),
                ('qarabag', 39.8265, 46.7656),
                ('naxcivan', 39.2089, 45.4122),
                ('diger', 40.1431, 47.5769)
            ) AS v(slug, lat, lng)
            WHERE regions.slug = v.slug
            """
        )
    )


def downgrade() -> None:
    op.drop_column("users", "grade_label")
    op.drop_column("users", "school_name")
    op.drop_column("users", "bio")
    op.drop_column("users", "avatar_object_key")
    op.drop_column("exam_venues", "longitude")
    op.drop_column("exam_venues", "latitude")
    op.drop_column("regions", "longitude")
    op.drop_column("regions", "latitude")
