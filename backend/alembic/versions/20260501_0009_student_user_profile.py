"""student role + users.linked_student_id

Revision ID: 20260501_0009
Revises: 20260501_0008
"""

from alembic import op
import sqlalchemy as sa

revision = "20260501_0009"
down_revision = "20260501_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'student'"))

    op.add_column(
        "users",
        sa.Column("linked_student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_users_linked_student_id", "users", ["linked_student_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_linked_student_id", table_name="users")
    op.drop_column("users", "linked_student_id")
