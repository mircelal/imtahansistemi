"""questions and tickets

Revision ID: 20260430_0002
Revises: 20260430_0001
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa

revision = "20260430_0002"
down_revision = "20260430_0001"
branch_labels = None
depends_on = None


question_type_enum = sa.Enum("MCQ", "TF", name="questiontype")
ticket_order_status_enum = sa.Enum("PENDING", "CONFIRMED", "CANCELLED", name="ticketorderstatus")


def upgrade() -> None:
    op.create_table(
        "questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id"), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("qtype", question_type_enum, nullable=False),
        sa.Column("stem", sa.Text(), nullable=False),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("points", sa.Float(), nullable=False, server_default="1"),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_questions_exam_id", "questions", ["exam_id"])
    op.create_index("ix_questions_order_index", "questions", ["order_index"])
    op.create_index("uq_questions_exam_order", "questions", ["exam_id", "order_index"], unique=True)

    op.add_column("answer_keys", sa.Column("question_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_answer_keys_question_id_questions",
        "answer_keys",
        "questions",
        ["question_id"],
        ["id"],
    )
    op.create_index("ix_answer_keys_question_id", "answer_keys", ["question_id"])

    op.create_table(
        "exam_tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_id", sa.Integer(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(8), nullable=False, server_default="AZN"),
        sa.Column("quota", sa.Integer(), nullable=True),
        sa.Column("starts_at", sa.DateTime(), nullable=True),
        sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_exam_tickets_course_id", "exam_tickets", ["course_id"])

    op.create_table(
        "ticket_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("exam_tickets.id"), nullable=False),
        sa.Column("buyer_name", sa.String(255), nullable=False),
        sa.Column("buyer_email", sa.String(255), nullable=False),
        sa.Column("buyer_phone", sa.String(64), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", ticket_order_status_enum, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_ticket_orders_ticket_id", "ticket_orders", ["ticket_id"])
    op.create_index("ix_ticket_orders_buyer_email", "ticket_orders", ["buyer_email"])


def downgrade() -> None:
    op.drop_index("ix_ticket_orders_buyer_email", table_name="ticket_orders")
    op.drop_index("ix_ticket_orders_ticket_id", table_name="ticket_orders")
    op.drop_table("ticket_orders")

    op.drop_index("ix_exam_tickets_course_id", table_name="exam_tickets")
    op.drop_table("exam_tickets")

    op.drop_index("ix_answer_keys_question_id", table_name="answer_keys")
    op.drop_constraint("fk_answer_keys_question_id_questions", "answer_keys", type_="foreignkey")
    op.drop_column("answer_keys", "question_id")

    op.drop_index("uq_questions_exam_order", table_name="questions")
    op.drop_index("ix_questions_order_index", table_name="questions")
    op.drop_index("ix_questions_exam_id", table_name="questions")
    op.drop_table("questions")

    ticket_order_status_enum.drop(op.get_bind(), checkfirst=True)
    question_type_enum.drop(op.get_bind(), checkfirst=True)
