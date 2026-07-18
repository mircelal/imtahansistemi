"""Student marketplace: FIN, refresh tokens, regions, devices, audit

Revision ID: 20260718_0026
Revises: 20260718_0025
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260718_0026"
down_revision = "20260718_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("fin_code", sa.String(length=7), nullable=True))
    op.add_column("users", sa.Column("phone", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("preferred_region_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("preferred_area_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index("ix_users_fin_code", "users", ["fin_code"], unique=True)

    op.create_table(
        "regions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_regions_slug", "regions", ["slug"], unique=True)
    op.create_index("ix_regions_sort_order", "regions", ["sort_order"])

    op.create_table(
        "areas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("region_id", sa.Integer(), sa.ForeignKey("regions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("region_id", "slug", name="uq_areas_region_slug"),
    )
    op.create_index("ix_areas_region_id", "areas", ["region_id"])

    op.create_table(
        "exam_venues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("area_id", sa.Integer(), sa.ForeignKey("areas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.String(length=512), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_exam_venues_area_id", "exam_venues", ["area_id"])

    op.add_column(
        "exams",
        sa.Column("region_id", sa.Integer(), sa.ForeignKey("regions.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "exams",
        sa.Column("area_id", sa.Integer(), sa.ForeignKey("areas.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "exams",
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("exam_venues.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_exams_region_id", "exams", ["region_id"])
    op.create_index("ix_exams_area_id", "exams", ["area_id"])
    op.create_index("ix_exams_venue_id", "exams", ["venue_id"])

    op.create_foreign_key(
        "fk_users_preferred_region_id",
        "users",
        "regions",
        ["preferred_region_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_users_preferred_area_id",
        "users",
        "areas",
        ["preferred_area_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
    )
    op.create_index("ix_refresh_tokens_jti", "refresh_tokens", ["jti"], unique=True)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])

    op.create_table(
        "student_devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("push_token", sa.String(length=512), nullable=False),
        sa.Column("app_version", sa.String(length=32), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("user_id", "push_token", name="uq_student_devices_user_token"),
    )
    op.create_index("ix_student_devices_user_id", "student_devices", ["user_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=True),
        sa.Column("resource_id", sa.String(length=64), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"])

    op.add_column("ticket_orders", sa.Column("idempotency_key", sa.String(length=128), nullable=True))
    op.create_index(
        "uq_ticket_orders_idempotency_key",
        "ticket_orders",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    # Seed default regions / areas (Azerbaijan economic regions — simplified)
    op.execute(
        sa.text(
            """
            INSERT INTO regions (name, slug, sort_order, is_active, created_at) VALUES
            ('Bakı', 'baki', 1, true, NOW()),
            ('Abşeron-Xızı', 'absheron-xizi', 2, true, NOW()),
            ('Gəncə-Daşkəsən', 'gence-daskesen', 3, true, NOW()),
            ('Şəki-Zaqatala', 'seki-zaqatala', 4, true, NOW()),
            ('Lənkəran-Astara', 'lenkeran-astara', 5, true, NOW()),
            ('Quba-Xaçmaz', 'quba-xacmaz', 6, true, NOW()),
            ('Mərkəzi Aran', 'merkezi-aran', 7, true, NOW()),
            ('Qarabağ', 'qarabag', 8, true, NOW()),
            ('Naxçıvan', 'naxcivan', 9, true, NOW()),
            ('Digər', 'diger', 99, true, NOW())
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO areas (region_id, name, slug, sort_order, is_active, created_at)
            SELECT r.id, a.name, a.slug, a.sort_order, true, NOW()
            FROM regions r
            JOIN (
                VALUES
                    ('baki', 'Yasamal', 'yasamal', 1),
                    ('baki', 'Nəsimi', 'nasimi', 2),
                    ('baki', 'Nərimanov', 'narimanov', 3),
                    ('baki', 'Xətai', 'xetai', 4),
                    ('baki', 'Səbail', 'sabail', 5),
                    ('baki', 'Binəqədi', 'bineqedi', 6),
                    ('baki', 'Suraxanı', 'suraxani', 7),
                    ('baki', 'Sabunçu', 'sabuncu', 8),
                    ('baki', 'Qaradağ', 'qaradag', 9),
                    ('baki', 'Pirallahı', 'pirallahi', 10),
                    ('absheron-xizi', 'Sumqayıt', 'sumqayit', 1),
                    ('absheron-xizi', 'Xırdalan', 'xirdalan', 2),
                    ('gence-daskesen', 'Gəncə', 'gence', 1),
                    ('naxcivan', 'Naxçıvan şəhəri', 'naxcivan-seher', 1),
                    ('diger', 'Ümumi', 'umumi', 1)
            ) AS a(region_slug, name, slug, sort_order)
              ON r.slug = a.region_slug
            """
        )
    )


def downgrade() -> None:
    op.drop_index("uq_ticket_orders_idempotency_key", table_name="ticket_orders")
    op.drop_column("ticket_orders", "idempotency_key")
    op.drop_table("audit_logs")
    op.drop_table("student_devices")
    op.drop_table("refresh_tokens")
    op.drop_constraint("fk_users_preferred_area_id", "users", type_="foreignkey")
    op.drop_constraint("fk_users_preferred_region_id", "users", type_="foreignkey")
    op.drop_index("ix_exams_venue_id", table_name="exams")
    op.drop_index("ix_exams_area_id", table_name="exams")
    op.drop_index("ix_exams_region_id", table_name="exams")
    op.drop_column("exams", "venue_id")
    op.drop_column("exams", "area_id")
    op.drop_column("exams", "region_id")
    op.drop_table("exam_venues")
    op.drop_table("areas")
    op.drop_table("regions")
    op.drop_index("ix_users_fin_code", table_name="users")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "preferred_area_id")
    op.drop_column("users", "preferred_region_id")
    op.drop_column("users", "phone")
    op.drop_column("users", "fin_code")
