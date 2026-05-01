"""sual bazası fənlər (bank_subjects) və bank_questions.subject_id

Revision ID: 20260501_0011
Revises: 20260501_0010
"""

from alembic import op
import sqlalchemy as sa

revision = "20260501_0011"
down_revision = "20260501_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bank_subjects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("short_code", sa.String(32), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_bank_subjects_name", "bank_subjects", ["name"])
    op.create_index("ix_bank_subjects_sort_order", "bank_subjects", ["sort_order"])
    op.create_unique_constraint("uq_bank_subjects_short_code", "bank_subjects", ["short_code"])

    op.add_column(
        "bank_questions",
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("bank_subjects.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_bank_questions_subject_id", "bank_questions", ["subject_id"])

    conn = op.get_bind()
    res = conn.execute(
        sa.text(
            "SELECT DISTINCT TRIM(subject_code) AS c FROM bank_questions "
            "WHERE subject_code IS NOT NULL AND TRIM(subject_code) <> ''"
        )
    )
    codes = [row[0] for row in res.fetchall()]
    for i, code in enumerate(codes):
        name = (code or "")[:255]
        short = (code or "").strip()[:32] or None
        conn.execute(
            sa.text(
                "INSERT INTO bank_subjects (name, short_code, sort_order, is_active) "
                "VALUES (:name, :short_code, :sort_order, true)"
            ),
            {"name": name, "short_code": short, "sort_order": i},
        )

    conn.execute(
        sa.text(
            "UPDATE bank_questions AS b SET subject_id = s.id "
            "FROM bank_subjects AS s WHERE TRIM(b.subject_code) = s.short_code"
        )
    )

    op.drop_index("ix_bank_questions_subject_code", table_name="bank_questions")
    op.drop_column("bank_questions", "subject_code")


def downgrade() -> None:
    op.add_column(
        "bank_questions",
        sa.Column("subject_code", sa.String(64), nullable=False, server_default=""),
    )
    op.create_index("ix_bank_questions_subject_code", "bank_questions", ["subject_code"])

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE bank_questions AS b SET subject_code = COALESCE(s.short_code, s.name, '') "
            "FROM bank_subjects AS s WHERE b.subject_id = s.id"
        )
    )

    op.drop_index("ix_bank_questions_subject_id", table_name="bank_questions")
    op.drop_column("bank_questions", "subject_id")
    op.drop_constraint("uq_bank_subjects_short_code", "bank_subjects", type_="unique")
    op.drop_index("ix_bank_subjects_sort_order", table_name="bank_subjects")
    op.drop_index("ix_bank_subjects_name", table_name="bank_subjects")
    op.drop_table("bank_subjects")
