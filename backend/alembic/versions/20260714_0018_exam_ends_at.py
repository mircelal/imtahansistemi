"""imtahan bitmə vaxtı (ends_at)

Revision ID: 20260714_0018
Revises: 20260712_0017
"""

from alembic import op
import sqlalchemy as sa

revision = "20260714_0018"
down_revision = "20260712_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("ends_at", sa.DateTime(), nullable=True))
    op.create_index("ix_exams_ends_at", "exams", ["ends_at"])
    # Köhnə imtahanlar: planlaşdırılmış vaxtdan 4 saat sonra bitmiş sayılır
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                """
                UPDATE exams
                SET ends_at = scheduled_at + INTERVAL '4 hours'
                WHERE scheduled_at IS NOT NULL AND ends_at IS NULL
                """
            )
        )
    else:
        # SQLite / digər: datetime('…', '+4 hours')
        op.execute(
            sa.text(
                """
                UPDATE exams
                SET ends_at = datetime(scheduled_at, '+4 hours')
                WHERE scheduled_at IS NOT NULL AND ends_at IS NULL
                """
            )
        )


def downgrade() -> None:
    op.drop_index("ix_exams_ends_at", table_name="exams")
    op.drop_column("exams", "ends_at")
