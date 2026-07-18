"""AnswerKey unique (exam_id, question_number); CASCADE on exam FKs

Revision ID: 20260716_0020
Revises: 20260716_0019
"""

from alembic import op
import sqlalchemy as sa


revision = "20260716_0020"
down_revision = "20260716_0019"
branch_labels = None
depends_on = None


def _fk_name(inspector, table: str, column: str) -> str | None:
    for fk in inspector.get_foreign_keys(table):
        cols = fk.get("constrained_columns") or []
        if cols == [column]:
            return fk.get("name")
    return None


def _recreate_exam_fk(table: str, column: str, *, ondelete: str | None) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    old = _fk_name(inspector, table, column)
    if old:
        op.drop_constraint(old, table, type_="foreignkey")
    kwargs: dict = {
        "constraint_name": f"fk_{table}_{column}_exams",
        "source_table": table,
        "referent_table": "exams",
        "local_cols": [column],
        "remote_cols": ["id"],
    }
    if ondelete:
        kwargs["ondelete"] = ondelete
    op.create_foreign_key(**kwargs)


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # Duplicate answer_key rows-u unique-dən əvvəl təmizlə (ən kiçik id qalır)
    if dialect == "postgresql":
        op.execute(
            sa.text(
                """
                DELETE FROM answer_keys ak
                USING answer_keys ak2
                WHERE ak.exam_id = ak2.exam_id
                  AND ak.question_number = ak2.question_number
                  AND ak.id > ak2.id
                """
            )
        )
    else:
        op.execute(
            sa.text(
                """
                DELETE FROM answer_keys
                WHERE id NOT IN (
                    SELECT MIN(id) FROM answer_keys GROUP BY exam_id, question_number
                )
                """
            )
        )

    inspector = sa.inspect(bind)
    existing_uq = {uq.get("name") for uq in inspector.get_unique_constraints("answer_keys")}

    if dialect == "sqlite":
        if "uq_answer_keys_exam_question" not in existing_uq:
            with op.batch_alter_table("answer_keys") as batch:
                batch.create_unique_constraint(
                    "uq_answer_keys_exam_question",
                    ["exam_id", "question_number"],
                )
        # SQLite FK ondelete is only applied on table recreate; model already has CASCADE.
        return

    if "uq_answer_keys_exam_question" not in existing_uq:
        op.create_unique_constraint(
            "uq_answer_keys_exam_question",
            "answer_keys",
            ["exam_id", "question_number"],
        )

    for table, column in (
        ("answer_keys", "exam_id"),
        ("questions", "exam_id"),
        ("scan_sessions", "exam_id"),
    ):
        _recreate_exam_fk(table, column, ondelete="CASCADE")


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        with op.batch_alter_table("answer_keys") as batch:
            batch.drop_constraint("uq_answer_keys_exam_question", type_="unique")
        return

    op.drop_constraint("uq_answer_keys_exam_question", "answer_keys", type_="unique")
    for table, column in (
        ("answer_keys", "exam_id"),
        ("questions", "exam_id"),
        ("scan_sessions", "exam_id"),
    ):
        _recreate_exam_fk(table, column, ondelete=None)
