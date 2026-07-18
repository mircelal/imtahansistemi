"""userrole: STUDENT (SQLAlchemy enum adı ilə uyğun)

Revision ID: 20260705_0016
Revises: 20260501_0015

0009 migrasiyası səhvən kiçik 'student' əlavə etmişdi; ORM isə ADMIN/MANAGER/OPERATOR
kimi böyük hərfli enum adını (STUDENT) yazır.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260705_0016"
down_revision = "20260501_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'STUDENT'"))


def downgrade() -> None:
    pass
