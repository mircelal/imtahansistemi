from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Boolean, DateTime, Enum as SqlEnum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    OPERATOR = "operator"
    STUDENT = "student"


class SessionStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


class ResultStatus(str, Enum):
    OK = "ok"
    MANUAL_REVIEW = "manual_review"
    ERROR = "error"


class QuestionType(str, Enum):
    MCQ = "mcq"
    TF = "tf"
    GRID_IN = "grid_in"
    ESSAY = "essay"


class QuestionDifficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class TicketOrderStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class ExamDeliveryMode(str, Enum):
    IN_PERSON = "in_person"
    ONLINE = "online"
    HYBRID = "hybrid"


class ExamCategory(str, Enum):
    """İmtahan növü — buraxılış, blok, sinif, qəbul və ya sərbəst."""

    BURAXILIS = "buraxilis"
    BLOK = "blok"
    SINIF = "sinif"
    QEBUL = "qebul"
    CUSTOM = "custom"


class WalletTransactionType(str, Enum):
    DEPOSIT = "deposit"
    TICKET_DEBIT = "ticket_debit"
    REFUND = "refund"
    ADJUSTMENT = "adjustment"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(SqlEnum(UserRole), index=True)
    linked_student_id: Mapped[int | None] = mapped_column(
        ForeignKey("students.id", ondelete="SET NULL"), nullable=True, unique=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SystemSetting(Base):
    """Açar-dəyər sistem parametrləri (məs. sistem adı, logo obyekti)."""

    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class Course(Base):
    __tablename__ = "courses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    logo_object_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    logo_content_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CourseOperator(Base):
    """Kurs meneceri/administrator tərəfindən təyin olunan operator — yalnız bu kurs üzrə tam icazə."""

    __tablename__ = "course_operators"

    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True)
    operator_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)


class ExamScoringProfile(Base):
    """Yenidən istifadə olunan bal hesablama profili (DİM qrupları, buraxılış və s.)."""

    __tablename__ = "exam_scoring_profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(32), index=True, default=ExamCategory.CUSTOM.value)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    formula_config: Mapped[dict] = mapped_column(JSON, default=dict)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


class ExamType(Base):
    """İdarə olunan imtahan növü — slug, Exam.exam_category / profil.category ilə uyğunlaşır."""

    __tablename__ = "exam_types"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    default_scoring_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("exam_scoring_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ScoringFormulaPreset(Base):
    """Adlı formula şablonu — mühərrik (raw_sum/weighted_linear) + default əmsallar."""

    __tablename__ = "scoring_formula_presets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    engine: Mapped[str] = mapped_column(String(32), default="raw_sum", index=True)
    default_params: Mapped[dict] = mapped_column(JSON, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


class Exam(Base):
    __tablename__ = "exams"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_count: Mapped[int] = mapped_column(Integer)
    options_per_question: Mapped[int] = mapped_column(Integer)
    columns_count: Mapped[int] = mapped_column(Integer)
    negative_marking: Mapped[bool] = mapped_column(Boolean, default=False)
    negative_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    grading_config: Mapped[dict] = mapped_column(JSON, default=dict)
    grading_policy: Mapped[dict] = mapped_column(JSON, default=dict)
    exam_category: Mapped[str] = mapped_column(
        String(32), default=ExamCategory.CUSTOM.value, index=True
    )
    scoring_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("exam_scoring_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    seat_quota: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resale_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    delivery_mode: Mapped[str] = mapped_column(String(16), default=ExamDeliveryMode.IN_PERSON.value)
    venue: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    list_price_amount: Mapped[float] = mapped_column(Float, default=0.0)
    list_price_currency: Mapped[str] = mapped_column(String(8), default="AZN")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    answer_sheet_preset_id: Mapped[int | None] = mapped_column(
        ForeignKey("answer_sheet_layout_presets.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


class BankSubject(Base):
    """Sual bazası üçün fənlər (riyaziyyat, fizika və s.)."""

    __tablename__ = "bank_subjects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    short_code: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    bank_questions: Mapped[list["BankQuestion"]] = relationship(back_populates="subject_ref")


class BankQuestion(Base):
    """Mərkəzi sual bazası — imtahan sualları buradan kopiyalanır və ya yaradılarkən avtomatik əlavə olunur."""

    __tablename__ = "bank_questions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_subjects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    difficulty: Mapped[str] = mapped_column(String(16), default=QuestionDifficulty.MEDIUM.value, index=True)
    qtype: Mapped[QuestionType] = mapped_column(SqlEnum(QuestionType), default=QuestionType.MCQ)
    stem: Mapped[str] = mapped_column(Text)
    options: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    points: Mapped[float] = mapped_column(Float, default=1.0)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    subject_ref: Mapped[BankSubject | None] = relationship(back_populates="bank_questions")
    exam_questions: Mapped[list["Question"]] = relationship(back_populates="bank_question")


class Question(Base):
    __tablename__ = "questions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), index=True)
    bank_question_id: Mapped[int | None] = mapped_column(
        ForeignKey("bank_questions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, index=True)
    qtype: Mapped[QuestionType] = mapped_column(SqlEnum(QuestionType), default=QuestionType.MCQ)
    stem: Mapped[str] = mapped_column(Text)
    options: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    points: Mapped[float] = mapped_column(Float, default=1.0)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    bank_question: Mapped[BankQuestion | None] = relationship(back_populates="exam_questions")


class AnswerKey(Base):
    __tablename__ = "answer_keys"
    __table_args__ = (UniqueConstraint("exam_id", "question_number", name="uq_answer_keys_exam_question"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id"), nullable=True, index=True)
    question_number: Mapped[int] = mapped_column(Integer)
    # MCQ: "A"–"E"; grid_in: çoxsimvollu (məs. "042"); essay: boş ("") — əl ilə qiymətləndirilir
    correct_answer: Mapped[str] = mapped_column(String(64))
    points: Mapped[float] = mapped_column(Float, default=1.0)


class AnswerSheetLayoutPreset(Base):
    """Yenidən istifadə olunan cavab kartı dizaynı (layout + parametrlər); imtahanlar seçə bilər."""

    __tablename__ = "answer_sheet_layout_presets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int | None] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    template_config: Mapped[dict] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AnswerSheetTemplate(Base):
    __tablename__ = "answer_sheet_templates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), index=True)
    sheet_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    template_config: Mapped[dict] = mapped_column(JSON)
    pdf_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    layout_preset_id: Mapped[int | None] = mapped_column(
        ForeignKey("answer_sheet_layout_presets.id", ondelete="SET NULL"), nullable=True, index=True
    )


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (UniqueConstraint("course_id", "student_number", name="uq_students_course_student_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    student_number: Mapped[str] = mapped_column(String(64), index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ExamTicket(Base):
    __tablename__ = "exam_tickets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    exam_id: Mapped[int | None] = mapped_column(ForeignKey("exams.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="AZN")
    quota: Mapped[int | None] = mapped_column(Integer, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TicketOrder(Base):
    __tablename__ = "ticket_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("exam_tickets.id"), index=True)
    buyer_name: Mapped[str] = mapped_column(String(255))
    buyer_email: Mapped[str] = mapped_column(String(255), index=True)
    buyer_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[TicketOrderStatus] = mapped_column(SqlEnum(TicketOrderStatus), default=TicketOrderStatus.PENDING)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    student_id: Mapped[int | None] = mapped_column(
        ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True
    )
    payment_method: Mapped[str] = mapped_column(String(32), default="fiscal")
    cashier_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_intent_id: Mapped[int | None] = mapped_column(
        ForeignKey("payment_intents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PaymentIntent(Base):
    """Online ödəniş — wallet top-up və ya bilet sifarişi."""

    __tablename__ = "payment_intents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    purpose: Mapped[str] = mapped_column(String(32), index=True)  # wallet_topup | ticket_order
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="AZN")
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    driver: Mapped[str] = mapped_column(String(32), index=True)
    external_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    checkout_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    course_id: Mapped[int | None] = mapped_column(
        ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    ticket_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("ticket_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    buyer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CourseWallet(Base):
    """Kurs balansı — bilet gəliri və online top-up."""

    __tablename__ = "course_wallets"
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True)
    balance_cents: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(8), default="AZN")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    tx_type: Mapped[str] = mapped_column(String(32))
    ref_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ScanSession(Base):
    __tablename__ = "scan_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), index=True)
    operator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[SessionStatus] = mapped_column(SqlEnum(SessionStatus), default=SessionStatus.PENDING)
    total_images: Mapped[int] = mapped_column(Integer, default=0)
    processed_images: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ScanResult(Base):
    __tablename__ = "scan_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("scan_sessions.id"), index=True)
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id"), nullable=True)
    image_path: Mapped[str] = mapped_column(String(512))
    detected_answers: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_breakdown: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[ResultStatus] = mapped_column(SqlEnum(ResultStatus), default=ResultStatus.OK)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # question_number (str) -> relative image path for essay crop
    essay_crops: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class ManualCorrection(Base):
    __tablename__ = "manual_corrections"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scan_result_id: Mapped[int] = mapped_column(ForeignKey("scan_results.id"), index=True)
    corrected_answers: Mapped[dict] = mapped_column(JSON, default=dict)
    corrected_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    corrected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EssayGrade(Base):
    """Sərbəst mətn (essay) sualı üçün əl ilə verilən bal."""

    __tablename__ = "essay_grades"
    __table_args__ = (
        UniqueConstraint("scan_result_id", "question_number", name="uq_essay_grades_result_qnum"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scan_result_id: Mapped[int] = mapped_column(ForeignKey("scan_results.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id", ondelete="SET NULL"), nullable=True, index=True)
    question_number: Mapped[int] = mapped_column(Integer)
    awarded_points: Mapped[float] = mapped_column(Float, default=0.0)
    max_points: Mapped[float] = mapped_column(Float, default=1.0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    graded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    graded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
