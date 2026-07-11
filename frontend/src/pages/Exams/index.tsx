import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  downloadAnswerSheetPdf,
  finalizeAnswerSheetDraft,
  generateAnswerSheet,
  getApiErrorMessage,
  listExamSheetTemplates,
  saveAnswerSheetDraft
} from "../../api/answerSheets";
import { listCourses } from "../../api/courses";
import type { Exam } from "../../api/exams";
import {
  AnswerKeyRow,
  createExam,
  deleteExam,
  downloadExamBookletCover,
  downloadExamQuestionBooklet,
  downloadExamQuestionBookletDocx,
  getAnswerKey,
  getExam,
  getExamIntegrations,
  getExamReadiness,
  listExams,
  saveAnswerKey,
  updateExam,
  type ExamReadiness,
} from "../../api/exams";
import { listBankSubjects, listQuestionBank } from "../../api/questionBank";
import { listAnswerSheetPresets } from "../../api/sheetPresets";
import { addQuestionsFromBankBulk, createQuestion, deleteQuestion, importQuestionsCsv, listQuestions } from "../../api/questions";
import { useAuthStore } from "../../store/authStore";
import PageHeader from "../../components/ui/PageHeader";
import { plainTextFromHtml } from "../../utils/html";
import {
  buildAnswerSheetIdentityOverlay,
  defaultAnswerCardIdentity,
  type AnswerCardIdentitySelection,
} from "./buildAnswerCardIdentity";
import ExamCreateForm from "./components/ExamCreateForm";
import ExamListPage from "./components/ExamListPage";
import ExamIntegrationsStrip from "./components/ExamIntegrationsStrip";
import ExamSettingsEditor from "./components/ExamSettingsEditor";
import ExamWizardStepper from "./components/ExamWizardStepper";
import ExamQuestionBankPicker from "./components/ExamQuestionBankPicker";
import ExamQuestionsPanel, { ExamCsvImportZone, type QuestionAddMode } from "./components/ExamQuestionsPanel";
import ExamWizardGuide from "./components/ExamWizardGuide";
import ExamStepSubNav from "./components/ExamStepSubNav";
import SheetStatusBadge, { sheetStatusFromReadiness } from "./components/SheetStatusBadge";
import { examWizardSteps, type ExamStep1SubSection } from "./examWizardSteps";
import LiveSheetPreview from "../AnswerSheetDesigner/LiveSheetPreview";
import { RichHtmlEditor } from "../../components/RichHtmlEditor";
import { examInput, examLabel, examPrimaryBtn, examSecondaryBtn, examSection, examSectionBody } from "./components/examUiTokens";
import {
  DEFAULT_BOOKLET_VARIANTS,
  defaultBookletConfig,
  resolveBookletConfig,
} from "../../constants/bookletLayoutSpec";

type PaperSize = "A4" | "A3" | "A4L" | "A3L";

function paperSizeFromPreset(
  presetId: number | null | undefined,
  presets: { id: number; template_config?: Record<string, unknown> }[] | undefined,
): PaperSize {
  if (presetId == null || !presets?.length) return "A4";
  const p = presets.find((x) => x.id === presetId);
  const raw = p?.template_config?.paper_size;
  if (raw === "A3" || raw === "A4L" || raw === "A3L" || raw === "A4") return raw;
  return "A4";
}

type ExamBasicsForm = {
  course_id: number | "";
  title: string;
  description: string;
  question_count: number;
  options_per_question: number;
  columns_count: number;
  scheduled_at: string;
  seat_quota: string;
  venue: string;
  city: string;
  resale_enabled: boolean;
  add_ticket: boolean;
  ticket_title: string;
  ticket_description: string;
  ticket_price: number;
  ticket_quota: string;
  answer_sheet_preset_id: number | "";
  negative_marking: boolean;
  negative_ratio: number;
};

type QuestionForm = {
  order_index: number;
  qtype: "mcq" | "tf";
  stem: string;
  points: number;
  subject_id: string;
  difficulty: "" | "easy" | "medium" | "hard";
};

const steps = examWizardSteps;
const inputClass = examInput;
const labelClass = examLabel;

function answerKeyStepBlockedReason(
  plannedQuestionCount: number,
  registered: number,
  readiness: ExamReadiness | undefined,
): string | null {
  if (plannedQuestionCount === 0) {
    return "Planlı sual sayı 0-dır — əvvəlcə imtahan parametrlərində sual sayını təyin edin.";
  }
  if (registered > 0 && registered < plannedQuestionCount) {
    return `Qeydiyyatdan keçmiş sual sayı (${registered}) planlı saydan (${plannedQuestionCount}) azdır. Bütün sualları əlavə edin və ya planlı sayı düzəldin.`;
  }
  const qOk = readiness?.steps.find((s) => s.id === "questions")?.complete;
  if (!qOk && registered < plannedQuestionCount) {
    return `Cavab açarı üçün ən azı ${plannedQuestionCount} sual sətri lazımdır (hazırda ${registered}).`;
  }
  return null;
}

function ExamsWizardPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [umumiExam, setUmumiExam] = useState(false);
  const [step, setStep] = useState(0);
  const [examId, setExamId] = useState<number | null>(null);
  const [answerRows, setAnswerRows] = useState<AnswerKeyRow[]>([]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);
  const [participantLabel, setParticipantLabel] = useState("");
  const [participantCode, setParticipantCode] = useState("");
  const [institution, setInstitution] = useState("Təhsil müəssisəsi");
  const [examCode, setExamCode] = useState("");
  const [coverLine1, setCoverLine1] = useState("");
  const [coverLine2, setCoverLine2] = useState("");
  const [bookletDurationMinutes, setBookletDurationMinutes] = useState<number | "">("");
  const [bookletVariant, setBookletVariant] = useState("A");
  const [bookletOrganiser, setBookletOrganiser] = useState(defaultBookletConfig().organiser ?? "");
  const [bookletSector, setBookletSector] = useState("");
  const [bookletSeries, setBookletSeries] = useState("");
  const [bookletVariants, setBookletVariants] = useState<string[]>([...DEFAULT_BOOKLET_VARIANTS]);
  /** İki səhifəli PDF-də şəxsiyyət + MCQ tək şəkil/şablonda OMR üçün (backend `omr_two_page_stitched`). */
  const [omrTwoPageStitched, setOmrTwoPageStitched] = useState(false);
  const [gradingSubjectRows, setGradingSubjectRows] = useState<{ code: string; title: string }[]>([]);
  const [gradingBlockRows, setGradingBlockRows] = useState<
    { subject_code: string; from_q: number; to_q: number }[]
  >([]);
  const [gradingPolicyJson, setGradingPolicyJson] = useState("{}");
  const [showGradingAdvanced, setShowGradingAdvanced] = useState(false);
  const [answerCardIdentity, setAnswerCardIdentity] = useState<AnswerCardIdentitySelection>(() =>
    defaultAnswerCardIdentity(),
  );
  const [gradingLoadedForExamId, setGradingLoadedForExamId] = useState<number | null>(null);
  const [csvDragActive, setCsvDragActive] = useState(false);
  const [step1SubSection, setStep1SubSection] = useState<ExamStep1SubSection>("suallar");
  const [questionAddMode, setQuestionAddMode] = useState<QuestionAddMode>("bank");
  const [gradingSaveError, setGradingSaveError] = useState<string | null>(null);
  const [gradingSavedOk, setGradingSavedOk] = useState(false);
  const [bulkBankMsg, setBulkBankMsg] = useState<string | null>(null);
  const [deleteExamConfirm, setDeleteExamConfirm] = useState(false);

  const { register, handleSubmit, reset, watch, setValue } = useForm<ExamBasicsForm>({
    defaultValues: {
      course_id: "",
      question_count: 20,
      options_per_question: 4,
      columns_count: 2,
      title: "",
      description: "",
      scheduled_at: "",
      seat_quota: "",
      venue: "",
      city: "",
      resale_enabled: false,
      add_ticket: false,
      ticket_title: "",
      ticket_description: "",
      ticket_price: 0,
      ticket_quota: "",
      answer_sheet_preset_id: "",
      negative_marking: false,
      negative_ratio: 0.25,
    }
  });
  const qForm = useForm<QuestionForm>({
    defaultValues: { order_index: 1, qtype: "mcq", stem: "", points: 1, subject_id: "", difficulty: "" }
  });

  const examParam = searchParams.get("exam");
  const wizardStepParam = searchParams.get("wizardStep");
  useEffect(() => {
    if (examParam == null || examParam === "") return;
    const id = Number(String(examParam).trim());
    if (!Number.isFinite(id) || id < 1) return;
    setExamId(id);
    const wsRaw = wizardStepParam != null ? String(wizardStepParam).trim() : "";
    if (wsRaw !== "") {
      const ws = Number(wsRaw);
      if (Number.isFinite(ws) && ws >= 0 && ws <= 3) {
        setStep(ws);
        return;
      }
    }
    setStep(1);
  }, [examParam, wizardStepParam]);

  const coursesQuery = useQuery({ queryKey: ["courses"], queryFn: listCourses });

  useEffect(() => {
    const cs = coursesQuery.data;
    if (!cs?.length || umumiExam) return;
    const cur = watch("course_id");
    if (cur === "" || cur == null) {
      setValue("course_id", cs[0].id);
    }
  }, [coursesQuery.data, umumiExam, setValue, watch]);

  const createPresetsQuery = useQuery({
    queryKey: ["sheet-presets-create", umumiExam, watch("course_id")],
    queryFn: () => {
      if (umumiExam) return listAnswerSheetPresets({ scope: "global_only" });
      const cid = watch("course_id");
      return listAnswerSheetPresets(cid === "" ? undefined : { course_id: Number(cid) });
    },
    enabled: step === 0 && examId == null,
  });

  useEffect(() => {
    if (!umumiExam) return;
    setAnswerCardIdentity((prev) => ({ ...prev, student_code: false }));
    setValue("answer_sheet_preset_id", "");
  }, [umumiExam, setValue]);

  const examQuery = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => getExam(examId!),
    enabled: examId != null
  });

  useEffect(() => {
    if (examId == null) {
      setGradingLoadedForExamId(null);
      return;
    }
    const ex = examQuery.data;
    if (!ex || ex.id !== examId) return;
    if (gradingLoadedForExamId === examId) return;
    const gc = (ex.grading_config ?? {}) as Record<string, unknown>;
    const subs = Array.isArray(gc.subjects) ? gc.subjects : [];
    setGradingSubjectRows(
      subs
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((s) => ({
          code: String(s.code ?? "").trim(),
          title: String(s.title ?? s.code ?? "").trim(),
        }))
        .filter((r) => r.code.length > 0),
    );
    const blocks = Array.isArray(gc.question_blocks) ? gc.question_blocks : [];
    setGradingBlockRows(
      blocks
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((b) => ({
          subject_code: String(b.subject_code ?? "").trim(),
          from_q: Number(b.from_q) || 1,
          to_q: Number(b.to_q) || 1,
        }))
        .filter((r) => r.subject_code.length > 0),
    );
    setGradingPolicyJson(JSON.stringify(ex.grading_policy ?? {}, null, 2));
    const policy = (ex.grading_policy ?? {}) as Record<string, unknown>;
    const dur = policy.duration_minutes;
    if (typeof dur === "number" && dur > 0) {
      setBookletDurationMinutes(dur);
    } else {
      setBookletDurationMinutes("");
    }
    setExamCode(`IMT-${ex.id}`);
    const bc = resolveBookletConfig(gc as Record<string, unknown>);
    setBookletOrganiser(bc.organiser ?? defaultBookletConfig().organiser ?? "");
    setBookletSector(bc.sector ?? "");
    setBookletSeries(bc.exam_series ?? "");
    setBookletVariants(bc.variants ?? [...DEFAULT_BOOKLET_VARIANTS]);
    setBookletVariant(bc.variants?.[0] ?? "A");
    const ac = gc.answer_card_identity;
    if (ac && typeof ac === "object" && !Array.isArray(ac)) {
      setAnswerCardIdentity({ ...defaultAnswerCardIdentity(), ...(ac as Partial<AnswerCardIdentitySelection>) });
    } else {
      setAnswerCardIdentity(defaultAnswerCardIdentity());
    }
    setGradingLoadedForExamId(examId);
  }, [examId, examQuery.data, gradingLoadedForExamId]);
  const integrationsQuery = useQuery({
    queryKey: ["exam-integrations", examId],
    queryFn: () => getExamIntegrations(examId!),
    enabled: examId != null
  });
  const readinessQuery = useQuery({
    queryKey: ["exam-readiness", examId],
    queryFn: () => getExamReadiness(examId!),
    enabled: examId != null,
  });

  const sheetPresetsQuery = useQuery({
    queryKey: ["sheet-presets-exam", examQuery.data?.course_id],
    queryFn: () =>
      examQuery.data?.course_id == null
        ? listAnswerSheetPresets({ scope: "global_only" })
        : listAnswerSheetPresets({ course_id: examQuery.data!.course_id }),
    /** PDF addımına hazırlıq: cavab açarı mərhələsindən etibarən şablonları yüklə */
    enabled: examId != null && step >= 2 && examQuery.data != null
  });

  const linkSheetPresetMut = useMutation({
    mutationFn: (pid: number | null) => updateExam(examId!, { answer_sheet_preset_id: pid }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
    }
  });

  const questionsQuery = useQuery({
    queryKey: ["questions", examId],
    queryFn: () => listQuestions(examId!),
    enabled: examId != null
  });

  const [bankStemSearch, setBankStemSearch] = useState("");
  const [bankFilterSubjectId, setBankFilterSubjectId] = useState("");

  const bankPickQuery = useQuery({
    queryKey: ["question-bank-pick", examId, bankStemSearch, bankFilterSubjectId],
    queryFn: () =>
      listQuestionBank({
        search: bankStemSearch.trim() || undefined,
        limit: 150,
        subject_id: bankFilterSubjectId === "" ? undefined : Number(bankFilterSubjectId),
      }),
    enabled: examId != null && step === 1 && (user?.role === "admin" || user?.role === "manager"),
  });

  const bankSubjectsQuery = useQuery({
    queryKey: ["bank-subjects"],
    queryFn: () => listBankSubjects(true),
    enabled: examId != null && step === 1 && (user?.role === "admin" || user?.role === "manager")
  });

  const createExamMut = useMutation({
    mutationFn: (payload: ExamBasicsForm) => {
      const quotaRaw = payload.ticket_quota.trim();
      const quotaNum = quotaRaw === "" ? null : Number(quotaRaw);
      const bundled =
        !umumiExam &&
        payload.add_ticket &&
        payload.ticket_title.trim().length > 0
          ? {
              title: payload.ticket_title.trim(),
              description: payload.ticket_description.trim() || undefined,
              price_amount: Number(payload.ticket_price) || 0,
              currency: "AZN",
              quota: quotaNum != null && Number.isFinite(quotaNum) && quotaNum >= 1 ? quotaNum : null,
              is_active: true
            }
          : undefined;
      const sq = payload.seat_quota.trim();
      const seatQuotaNum = sq === "" ? NaN : Number(sq);
      return createExam({
        course_id: umumiExam ? null : payload.course_id === "" ? null : Number(payload.course_id),
        title: payload.title,
        description: payload.description || undefined,
        question_count: Number(payload.question_count),
        options_per_question: Number(payload.options_per_question),
        columns_count: Number(payload.columns_count),
        negative_marking: payload.negative_marking,
        negative_ratio: payload.negative_marking ? Number(payload.negative_ratio) || 0 : 0,
        is_active: true,
        scheduled_at: payload.scheduled_at.trim() ? new Date(payload.scheduled_at).toISOString() : undefined,
        seat_quota:
          sq !== "" && Number.isFinite(seatQuotaNum) && seatQuotaNum >= 1 ? Math.floor(seatQuotaNum) : undefined,
        resale_enabled: umumiExam ? payload.resale_enabled : false,
        city: payload.city.trim() || undefined,
        venue: payload.venue.trim() || undefined,
        answer_sheet_preset_id:
          payload.answer_sheet_preset_id === "" ? undefined : Number(payload.answer_sheet_preset_id),
        bundled_ticket: bundled
      });
    },
    onSuccess: (exam) => {
      setExamId(exam.id);
      setSearchParams({ exam: String(exam.id), wizardStep: "1" }, { replace: true });
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      queryClient.invalidateQueries({ queryKey: ["exam-integrations", exam.id] });
      setStep(1);
    }
  });

  const addQuestionMut = useMutation({
    mutationFn: (payload: QuestionForm) =>
      createQuestion(examId!, {
        order_index: payload.order_index,
        qtype: payload.qtype,
        stem: payload.stem,
        points: payload.points,
        subject_id: payload.subject_id.trim() === "" ? undefined : Number(payload.subject_id),
        difficulty: payload.difficulty === "" ? undefined : payload.difficulty
      }),
    onSuccess: async () => {
      qForm.reset({ order_index: 1, qtype: "mcq", stem: "", points: 1, subject_id: "", difficulty: "" });
      await queryClient.invalidateQueries({ queryKey: ["questions", examId] });
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
    }
  });

  const delQuestionMut = useMutation({
    mutationFn: (qid: number) => deleteQuestion(examId!, qid),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["questions", examId] });
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
    }
  });

  const delExamMut = useMutation({
    mutationFn: deleteExam,
    onSuccess: async () => {
      setExamId(null);
      setStep(0);
      setUmumiExam(false);
      reset();
      setSearchParams({}, { replace: true });
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      await queryClient.invalidateQueries({ queryKey: ["exam-integrations"] });
    }
  });

  /** İmtahan yaradılarkən təyin olunan planlı sual sayı — cavab açarı və kart bununla uyğunlaşır. */
  const plannedQuestionCount = Math.max(0, examQuery.data?.question_count ?? 0);

  function wizardStepAllowed(next: number, readiness: ExamReadiness | undefined): boolean {
    if (next < 0 || next > 3) return false;
    if (examId == null && next > 0) return false;
    if (next === 0) return true;
    if (next === 1) return examId != null;
    if (next === 2) {
      const registered = questionsQuery.data?.length ?? 0;
      if (registered === 0) return false;
      const qOk = readiness?.steps.find((s) => s.id === "questions")?.complete;
      if (registered > 0 && registered < plannedQuestionCount) {
        return false;
      }
      return Boolean(qOk || (plannedQuestionCount > 0 && registered >= plannedQuestionCount));
    }
    if (next === 3) {
      return Boolean(readiness?.steps.find((s) => s.id === "answer_key")?.complete);
    }
    return false;
  }

  useEffect(() => {
    if (examId == null) return;
    if (!wizardStepAllowed(step, readinessQuery.data)) {
      let clamp = 0;
      for (let i = Math.min(step, 3); i >= 0; i--) {
        if (wizardStepAllowed(i, readinessQuery.data)) {
          clamp = i;
          break;
        }
      }
      if (clamp !== step) {
        setStep(clamp);
        setSearchParams(
          (prev) => {
            const n = new URLSearchParams(prev);
            n.set("exam", String(examId));
            n.set("wizardStep", String(clamp));
            return n;
          },
          { replace: true },
        );
      }
    }
  }, [examId, step, readinessQuery.data, questionsQuery.data, plannedQuestionCount]);

  function goToWizardStep(next: number) {
    if (!wizardStepAllowed(next, readinessQuery.data)) return;
    setStep(next);
    if (examId != null) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("exam", String(examId));
          n.set("wizardStep", String(next));
          return n;
        },
        { replace: true },
      );
    }
  }

  /** Suallar order_index-ə görə — cavab açarı `question_number` ilə eyni olmalıdır */
  const orderedQuestions = useMemo(() => {
    const qs = [...(questionsQuery.data ?? [])];
    return qs.sort((a, b) => a.order_index - b.order_index);
  }, [questionsQuery.data]);

  const nextQuestionOrder = useMemo(() => {
    if (!orderedQuestions.length) return 1;
    return Math.max(...orderedQuestions.map((q) => q.order_index)) + 1;
  }, [orderedQuestions]);

  useEffect(() => {
    qForm.setValue("order_index", nextQuestionOrder);
  }, [nextQuestionOrder, qForm]);

  const canPickFromBank = user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    if (canPickFromBank) {
      setQuestionAddMode("bank");
    } else {
      setQuestionAddMode("csv");
    }
  }, [canPickFromBank]);

  const addBulkFromBankMut = useMutation({
    mutationFn: (bankIds: number[]) =>
      addQuestionsFromBankBulk(examId!, {
        bank_question_ids: bankIds,
        start_order_index: nextQuestionOrder,
      }),
    onSuccess: async (res) => {
      const parts = [`${res.imported} sual əlavə olundu`];
      if (res.skipped > 0) parts.push(`${res.skipped} keçildi`);
      if (res.errors.length) parts.push(res.errors.slice(0, 3).join("; "));
      setBulkBankMsg(parts.join(" · "));
      await queryClient.invalidateQueries({ queryKey: ["questions", examId] });
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
      await queryClient.invalidateQueries({ queryKey: ["question-bank-pick"] });
    },
    onError: () => {
      setBulkBankMsg("Toplu əlavə alınmadı — yenidən cəhd edin.");
    },
  });

  const registeredQuestionCount = questionsQuery.data?.length ?? 0;
  const answerKeyBlockedReason = answerKeyStepBlockedReason(
    plannedQuestionCount,
    registeredQuestionCount,
    readinessQuery.data,
  );
  const answerKeyComplete = Boolean(readinessQuery.data?.steps.find((s) => s.id === "answer_key")?.complete);
  const bookletDownloadReady =
    registeredQuestionCount >= plannedQuestionCount && plannedQuestionCount > 0;

  const canGoToAnswerKey = wizardStepAllowed(2, readinessQuery.data);

  const sheetsQuery = useQuery({
    queryKey: ["answerSheets", examId],
    queryFn: () => listExamSheetTemplates(examId!),
    enabled: examId != null,
  });

  useEffect(() => {
    if (step !== 2 || examId == null || plannedQuestionCount === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await getAnswerKey(examId);
        if (cancelled) return;
        if (existing.length === plannedQuestionCount) {
          setAnswerRows([...existing].sort((a, b) => a.question_number - b.question_number));
          return;
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      const byOrder = new Map(orderedQuestions.map((q) => [q.order_index, q]));
      setAnswerRows(
        Array.from({ length: plannedQuestionCount }, (_, i) => {
          const n = i + 1;
          const q = byOrder.get(n);
          return {
            question_number: n,
            correct_answer: q ? (q.qtype === "tf" ? "T" : "A") : "A",
            points: q ? q.points : 1
          };
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [step, examId, plannedQuestionCount, orderedQuestions]);

  const saveKeyMut = useMutation({
    mutationFn: () => saveAnswerKey(examId!, answerRows),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exam-readiness", examId] });
      goToWizardStep(3);
    },
    onError: () => {
      setImportMsg("Cavab açarı saxlanılmadı — bütün sətirləri yoxlayın.");
    },
  });

  const saveGradingMut = useMutation({
    mutationFn: async () => {
      if (examId == null) throw new Error("İmtahan yoxdur");
      const subjects = gradingSubjectRows
        .map((r) => ({ code: r.code.trim(), title: r.title.trim() || r.code.trim() }))
        .filter((r) => r.code.length > 0);
      const codes = new Set(subjects.map((s) => s.code));
      const question_blocks = gradingBlockRows
        .filter((r) => r.subject_code.trim())
        .map((r) => {
          const a = Math.max(1, Math.floor(Number(r.from_q)));
          const b = Math.max(1, Math.floor(Number(r.to_q)));
          return {
            subject_code: r.subject_code.trim(),
            from_q: Math.min(a, b),
            to_q: Math.max(a, b),
          };
        });
      for (const b of question_blocks) {
        if (!codes.has(b.subject_code)) {
          throw new Error(
            `Sual bloklarında «${b.subject_code}» kodu var, amma fənn siyahısında yoxdur — əvvəlcə fənn əlavə edin.`,
          );
        }
      }
      let grading_policy: Record<string, unknown>;
      try {
        grading_policy = JSON.parse(gradingPolicyJson) as Record<string, unknown>;
      } catch {
        throw new Error("Bal siyasəti (JSON) düzgün deyil.");
      }
      return updateExam(examId, {
        grading_config: {
          subjects,
          question_blocks,
          answer_card_identity: answerCardIdentity,
          booklet_config: {
            organiser: bookletOrganiser.trim() || defaultBookletConfig().organiser,
            sector: bookletSector.trim(),
            exam_series: bookletSeries.trim(),
            variants: bookletVariants.length > 0 ? bookletVariants : [...DEFAULT_BOOKLET_VARIANTS],
          },
        },
        grading_policy,
      });
    },
    onSuccess: async () => {
      setGradingLoadedForExamId(null);
      setGradingSavedOk(true);
      setGradingSaveError(null);
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
      await queryClient.invalidateQueries({ queryKey: ["exam-readiness", examId] });
    },
    onError: (err: Error) => {
      setGradingSaveError(err.message || "Bal/fənn parametrləri saxlanılmadı.");
    },
  });

  const genPdfMut = useMutation({
    mutationFn: async () => {
      const exam = examQuery.data;
      if (!exam || examId == null) throw new Error("İmtahan yüklənməyib");
      const qn = plannedQuestionCount > 0 ? plannedQuestionCount : exam.question_count;
      const paperSize = paperSizeFromPreset(exam.answer_sheet_preset_id, sheetPresetsQuery.data);
      const identityOv = buildAnswerSheetIdentityOverlay(answerCardIdentity, paperSize);
      const runtimeOverlay: Record<string, unknown> = {
        ...identityOv,
        participant_label: participantLabel.trim() || undefined,
        participant_code: participantCode.trim() || undefined,
        sheet_code: participantCode.trim() || undefined,
        ...(omrTwoPageStitched ? { omr_two_page_stitched: true } : {}),
      };
      const presetId = exam.answer_sheet_preset_id;
      const res =
        presetId != null
          ? await generateAnswerSheet(examId, {
              layout_preset_id: presetId,
              template_config: runtimeOverlay,
            })
          : await generateAnswerSheet(examId, {
              template_config: {
                question_count: qn,
                options_per_question: exam.options_per_question,
                columns_count: exam.columns_count,
                paper_size: paperSize,
                title: "CAVAB KARTI",
                header_subtitle: "",
                ...runtimeOverlay,
              },
            });
      await downloadAnswerSheetPdf(examId, res.sheet_uuid);
      return res;
    },
    onSuccess: (res) => {
      const lw = (res.layout_warnings ?? []).filter(Boolean);
      const extra =
        lw.length > 0 ? `\n\nLayout xəbərdarlığı:\n${lw.map((x) => `• ${x}`).join("\n")}` : "";
      setPdfMsg(`PDF yaradıldı və yükləndi. Kart UUID: ${res.sheet_uuid}${extra}`);
      queryClient.invalidateQueries({ queryKey: ["answerSheets", examId] });
      if (examId != null) queryClient.invalidateQueries({ queryKey: ["exam-integrations", examId] });
    }
  });

  const draftPdfMut = useMutation({
    mutationFn: async () => {
      const exam = examQuery.data;
      if (!exam || examId == null) throw new Error("İmtahan yüklənməyib");
      const qn = plannedQuestionCount > 0 ? plannedQuestionCount : exam.question_count;
      const paperSize = paperSizeFromPreset(exam.answer_sheet_preset_id, sheetPresetsQuery.data);
      const identityOv = buildAnswerSheetIdentityOverlay(answerCardIdentity, paperSize);
      const runtimeOverlay: Record<string, unknown> = {
        ...identityOv,
        participant_label: participantLabel.trim() || undefined,
        participant_code: participantCode.trim() || undefined,
        sheet_code: participantCode.trim() || undefined,
        ...(omrTwoPageStitched ? { omr_two_page_stitched: true } : {}),
      };
      const presetId = exam.answer_sheet_preset_id;
      if (presetId != null) {
        return saveAnswerSheetDraft(examId, {
          layout_preset_id: presetId,
          template_config: runtimeOverlay,
        });
      }
      return saveAnswerSheetDraft(examId, {
        template_config: {
          question_count: qn,
          options_per_question: exam.options_per_question,
          columns_count: exam.columns_count,
          paper_size: paperSize,
          title: "CAVAB KARTI",
          header_subtitle: "",
          ...runtimeOverlay,
        },
      });
    },
    onSuccess: async () => {
      setPdfMsg("Qaralama saxlanıldı — siyahıdan «PDF təsdiqlə» ilə yaradın.");
      await queryClient.invalidateQueries({ queryKey: ["answerSheets", examId] });
    }
  });

  const finalizePdfMut = useMutation({
    mutationFn: (templateId: number) => finalizeAnswerSheetDraft(examId!, templateId),
    onSuccess: async (res) => {
      setPdfMsg(`Kart təsdiqləndi: ${res.sheet_uuid}`);
      await queryClient.invalidateQueries({ queryKey: ["answerSheets", examId] });
      await queryClient.invalidateQueries({ queryKey: ["exam-integrations", examId] });
      await downloadAnswerSheetPdf(examId!, res.sheet_uuid);
    }
  });

  const courseIdForLinks = examQuery.data?.course_id ?? integrationsQuery.data?.course_id ?? null;

  const step3PreviewPayload = useMemo(() => {
    if (examId == null || !examQuery.data) return null;
    const paperSize = paperSizeFromPreset(examQuery.data.answer_sheet_preset_id, sheetPresetsQuery.data);
    const identity =
      examQuery.data.course_id == null
        ? { ...answerCardIdentity, student_code: false }
        : answerCardIdentity;
    return buildAnswerSheetIdentityOverlay(identity, paperSize);
  }, [
    examId,
    examQuery.data,
    sheetPresetsQuery.data,
    answerCardIdentity,
    participantLabel,
    participantCode,
    omrTwoPageStitched,
  ]);

  async function handleQuestionsCsvFile(file: File | undefined) {
    if (!file || examId == null) return;
    setImportMsg(null);
    const r = await importQuestionsCsv(examId, file);
    setImportMsg(`İdxal: ${r.imported} əlavə, ${r.skipped} keçildi`);
    await queryClient.invalidateQueries({ queryKey: ["questions", examId] });
    await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
  }

  return (
    <div className="page-container-wide mx-auto max-w-4xl space-y-4 px-0 py-0 sm:px-0 lg:py-0">
      <header className="space-y-3">
        <Link to="/exams" className="inline-flex text-[13px] font-medium text-slate-600 hover:text-slate-900">
          ← İmtahanlar
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {examId != null ? "İmtahan redaktəsi" : "Yeni imtahan"}
            </h1>
            <p className="mt-1 text-[13px] text-slate-500">
              {examId != null
                ? `№${examId}${examQuery.data?.title ? ` · ${examQuery.data.title}` : ""}`
                : "Parametrlər, bilet və kart addımları."}
            </p>
          </div>
          {examId != null ? (
            <button type="button" className={examSecondaryBtn} onClick={() => goToWizardStep(1)}>
              Suallara keç →
            </button>
          ) : null}
        </div>
      </header>

      <ExamWizardStepper
        step={step}
        examId={examId}
        onStep={goToWizardStep}
        stepAllowed={(i) => wizardStepAllowed(i, readinessQuery.data)}
      />

      <ExamWizardGuide
        step={step}
        step1SubSection={step1SubSection}
        examId={examId}
        plannedQuestionCount={plannedQuestionCount}
        registeredQuestionCount={registeredQuestionCount}
        gradingSaved={gradingSavedOk || Boolean(readinessQuery.data?.steps.find((s) => s.id === "grading")?.complete)}
        answerKeyComplete={Boolean(readinessQuery.data?.steps.find((s) => s.id === "answer_key")?.complete)}
        sheetConfirmed={Boolean(readinessQuery.data?.steps.find((s) => s.id === "sheet_template")?.complete)}
        canGoToAnswerKey={canGoToAnswerKey}
        onGoToSubSection={setStep1SubSection}
        onGoToStep={goToWizardStep}
      />

      {examId != null && (
        <SheetStatusBadge
          status={sheetStatusFromReadiness(
            readinessQuery.data,
            examQuery.data?.answer_sheet_preset_id,
            (sheetsQuery.data ?? []).filter((s) => s.is_draft).length,
            (sheetsQuery.data ?? []).filter((s) => !s.is_draft && s.pdf_path).length,
          )}
        />
      )}

      {examId != null && readinessQuery.data && step > 0 && (
        <section className={examSection} aria-label="Hazırlıq">
          <div className={examSectionBody}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hazırlıq</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {readinessQuery.data.steps.map((s) => (
                <span
                  key={s.id}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    s.complete ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {s.label}
                </span>
              ))}
            </div>
            {!readinessQuery.data.ready_for_scan && readinessQuery.data.missing.length > 0 ? (
              <p className="mt-2 text-[11px] text-amber-700">Çatışmayan: {readinessQuery.data.missing.join(" · ")}</p>
            ) : null}
          </div>
        </section>
      )}

      {examId != null && (
        <ExamIntegrationsStrip
          examId={examId}
          data={integrationsQuery.data}
          isLoading={integrationsQuery.isLoading}
          courseId={courseIdForLinks}
        />
      )}

      {examId != null && step === 1 && (
        <ExamStepSubNav
          active={step1SubSection}
          onChange={setStep1SubSection}
          status={{
            kart: gradingSavedOk || Boolean(readinessQuery.data?.steps.find((s) => s.id === "grading")?.complete),
            suallar:
              plannedQuestionCount > 0 && registeredQuestionCount >= plannedQuestionCount,
          }}
        />
      )}

      {examId != null && step === 1 && step1SubSection === "kart" && (
        <section className="card border-slate-200 bg-slate-50/50">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Fənnlər, cavab kartı və bal siyasəti</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Fənn kodları və sual diapazonları bal bölgüsü üçündür; cavab kartında hansı xanaların olacağını işarələyin.
                PDF yaradılanda seçimlər şablona tətbiq olunur (şablon seçilibsə, bu sahələr üstünlük verilir).
              </p>
            </div>
            <button
              type="button"
              className="mt-2 shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 sm:mt-0"
              disabled={saveGradingMut.isPending}
              onClick={() => {
                setGradingSaveError(null);
                saveGradingMut.mutate(undefined, {
                  onError: (e) =>
                    setGradingSaveError(e instanceof Error ? e.message : "Saxlama xətası"),
                });
              }}
            >
              Saxla
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <h3 className="text-sm font-semibold text-indigo-950">Cavab kartı — şəxsiyyət sahələri</h3>
            <p className="mt-1 text-xs text-indigo-950/80">
              Ad/soyad/ata adı üçün şaquli A–Z kod (PDF-də yan-yana bloklar); rəqəmlər balon ilə. Çox sual olduqda ikinci
              səhifə avtomatik ola bilər.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-900 hover:bg-indigo-50"
                onClick={() => setAnswerCardIdentity(defaultAnswerCardIdentity())}
              >
                Standart seçimlər
              </button>
              <button
                type="button"
                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-900 hover:bg-indigo-50"
                onClick={() =>
                  setAnswerCardIdentity({
                    ...defaultAnswerCardIdentity(),
                    first_name: false,
                    last_name: false,
                    father_name: false,
                    phone: false,
                    foreign_lang: false,
                  })
                }
              >
                Yalnız rəqəm və işarələr
              </button>
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["student_code", "Şagird nömrəsi (6 rəqəm)"],
                  ["school", "Məktəb nömrəsi"],
                  ["class_num", "Sinif"],
                  ["phone", "Əlaqə nömrəsi"],
                  ["first_name", "Ad"],
                  ["last_name", "Soyad"],
                  ["father_name", "Ata adı"],
                  ["foreign_lang", "Xarici dil"],
                  ["group", "Qrup (1–5)"],
                  ["variant", "Variant (A/B)"],
                  ["section", "Bölmə (Az/RU/GÜ)"],
                ] as const
              )
                .filter(([key]) => !(examQuery.data?.course_id == null && key === "student_code"))
                .map(([key, lab]) => (
                <li key={key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-sm text-slate-800 shadow-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={answerCardIdentity[key as keyof AnswerCardIdentitySelection]}
                      onChange={(e) =>
                        setAnswerCardIdentity((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                    />
                    <span>{lab}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">Fənnlər (bal bölgüsü üçün kodlar)</h3>
            <p className="mt-1 text-xs text-slate-600">
              Hər fənnə qısa kod verin (məs. <code className="rounded bg-slate-100 px-1">riyaz</code>); sual bloklarında həmin
              koddan istifadə ediləcək.
            </p>
            <div className="mt-3 space-y-2">
              {gradingSubjectRows.length === 0 && (
                <p className="text-sm text-slate-500">Hələ fənn yoxdur — əlavə edin və ya boş buraxın.</p>
              )}
              {gradingSubjectRows.map((row, idx) => (
                <div key={`sub-${idx}`} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
                  <label className={`${labelClass} min-w-[100px] flex-1`}>
                    Kod
                    <input
                      className={inputClass}
                      value={row.code}
                      onChange={(e) => {
                        const v = e.target.value;
                        setGradingSubjectRows((rs) => rs.map((r, i) => (i === idx ? { ...r, code: v } : r)));
                      }}
                      placeholder="məs. riyaz"
                    />
                  </label>
                  <label className={`${labelClass} min-w-[140px] flex-[2]`}>
                    Ad
                    <input
                      className={inputClass}
                      value={row.title}
                      onChange={(e) => {
                        const v = e.target.value;
                        setGradingSubjectRows((rs) => rs.map((r, i) => (i === idx ? { ...r, title: v } : r)));
                      }}
                      placeholder="Riyaziyyat"
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-2 py-2 text-sm text-red-700 hover:bg-red-50"
                    onClick={() => setGradingSubjectRows((rs) => rs.filter((_, i) => i !== idx))}
                  >
                    Sil
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                onClick={() => setGradingSubjectRows((rs) => [...rs, { code: "", title: "" }])}
              >
                + Fənn əlavə et
              </button>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">Sual blokları (fənnə görə sual aralıqları)</h3>
            <p className="mt-1 text-xs text-slate-600">
              Məsələn 1–20 riyaziyyat, 21–30 fizika — skan nəticəsində fənn üzrə alt-bal üçün istifadə olunur.
            </p>
            <div className="mt-3 space-y-2">
              {gradingBlockRows.map((row, idx) => (
                <div key={`blk-${idx}`} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
                  <label className={`${labelClass} min-w-[120px]`}>
                    Fənn kodu
                    <select
                      className={inputClass}
                      value={row.subject_code}
                      onChange={(e) => {
                        const v = e.target.value;
                        setGradingBlockRows((rs) => rs.map((r, i) => (i === idx ? { ...r, subject_code: v } : r)));
                      }}
                    >
                      <option value="">— seçin —</option>
                      {gradingSubjectRows
                        .map((r) => r.code.trim())
                        .filter((c) => c.length > 0)
                        .map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className={`${labelClass} w-24`}>
                    Başlanğıc sual
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      value={row.from_q}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setGradingBlockRows((rs) =>
                          rs.map((r, i) => (i === idx ? { ...r, from_q: Number.isFinite(v) ? v : 1 } : r)),
                        );
                      }}
                    />
                  </label>
                  <label className={`${labelClass} w-24`}>
                    Son sual
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      value={row.to_q}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setGradingBlockRows((rs) =>
                          rs.map((r, i) => (i === idx ? { ...r, to_q: Number.isFinite(v) ? v : 1 } : r)),
                        );
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-2 py-2 text-sm text-red-700 hover:bg-red-50"
                    onClick={() => setGradingBlockRows((rs) => rs.filter((_, i) => i !== idx))}
                  >
                    Sil
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                onClick={() =>
                  setGradingBlockRows((rs) => [...rs, { subject_code: "", from_q: 1, to_q: 1 }])
                }
              >
                + Blok əlavə et
              </button>
            </div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              className="text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              onClick={() => setShowGradingAdvanced((x) => !x)}
            >
              {showGradingAdvanced ? "Əlavə JSON-u gizlət" : "Əlavə: bal siyasəti (JSON)"}
            </button>
            {showGradingAdvanced && (
              <div className="mt-3">
                <label className={labelClass}>
                  grading_policy (JSON, istəyə bağlı)
                  <textarea
                    className={`${inputClass} mt-1 min-h-[100px] font-mono text-xs leading-relaxed`}
                    value={gradingPolicyJson}
                    onChange={(e) => setGradingPolicyJson(e.target.value)}
                    spellCheck={false}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Əksər imtahanlar üçün boş <code className="rounded bg-slate-100 px-1">{"{}"}</code> kifayətdir.
                </p>
              </div>
            )}
          </div>

          {gradingSaveError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {gradingSaveError}
            </p>
          )}
          {saveGradingMut.isError && !gradingSaveError && (
            <p className="mt-3 text-sm text-red-600">
              Saxlama alınmadı — məlumatları yoxlayın (fənn kodları və blok uyğunluğu).
            </p>
          )}
          {saveGradingMut.isSuccess && (
            <p className="mt-3 text-sm font-medium text-emerald-700">Dəyişikliklər saxlanıldı.</p>
          )}
        </section>
      )}

      {step === 0 && examId != null && examQuery.data && (
        <ExamSettingsEditor
          examId={examId}
          exam={examQuery.data}
          isAdmin={user?.role === "admin"}
          linkedTicketsCount={integrationsQuery.data?.linked_tickets.length ?? 0}
          courseId={examQuery.data.course_id}
        />
      )}

      {step === 0 && examId == null && (
        <ExamCreateForm
          register={register}
          watch={watch}
          setValue={setValue}
          courses={coursesQuery.data ?? []}
          sheetPresets={createPresetsQuery.data ?? []}
          umumiExam={umumiExam}
          onUmumiExamChange={setUmumiExam}
          isAdmin={user?.role === "admin"}
          isPending={createExamMut.isPending}
          isError={createExamMut.isError}
          onSubmit={handleSubmit((v) => createExamMut.mutate(v))}
        />
      )}

      {step >= 1 && examId != null && (
        <div className="card space-y-6">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Aktiv imtahan</p>
              <h2 className="mt-0.5 text-lg font-semibold text-slate-900">
                №{examId}
                {examQuery.data?.title ? ` — ${examQuery.data.title}` : ""}
              </h2>
            </div>
            {deleteExamConfirm ? (
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <span className="text-sm text-red-800">Silməyə əminsiniz?</span>
                <button
                  type="button"
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={delExamMut.isPending}
                  onClick={() => delExamMut.mutate(examId)}
                >
                  {delExamMut.isPending ? "Silinir…" : "Bəli, sil"}
                </button>
                <button
                  type="button"
                  className={examSecondaryBtn}
                  onClick={() => setDeleteExamConfirm(false)}
                >
                  Ləğv et
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="self-start rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100 sm:self-auto"
                onClick={() => setDeleteExamConfirm(true)}
              >
                İmtahanı sil
              </button>
            )}
          </div>


          {step === 1 && step1SubSection === "suallar" && (
            <ExamQuestionsPanel
              mode={questionAddMode}
              onModeChange={setQuestionAddMode}
              canUseBank={canPickFromBank}
              plannedQuestionCount={plannedQuestionCount}
              registeredQuestionCount={registeredQuestionCount}
              bankPanel={
                <ExamQuestionBankPicker
                  questions={bankPickQuery.data ?? []}
                  isLoading={bankPickQuery.isLoading}
                  isError={bankPickQuery.isError}
                  subjects={bankSubjectsQuery.data ?? []}
                  subjectsLoading={bankSubjectsQuery.isLoading}
                  plannedQuestionCount={plannedQuestionCount}
                  registeredQuestionCount={registeredQuestionCount}
                  nextOrderIndex={nextQuestionOrder}
                  isAdding={addBulkFromBankMut.isPending}
                  bulkResult={bulkBankMsg}
                  search={bankStemSearch}
                  subjectFilterId={bankFilterSubjectId}
                  onSearchChange={setBankStemSearch}
                  onSubjectFilterChange={setBankFilterSubjectId}
                  onBulkAdd={(ids) => {
                    setBulkBankMsg(null);
                    addBulkFromBankMut.mutate(ids);
                  }}
                />
              }
              csvPanel={
                <ExamCsvImportZone
                  csvDragActive={csvDragActive}
                  importMsg={importMsg}
                  onDragActive={setCsvDragActive}
                  onFile={async (f) => {
                    if (f && !f.name.toLowerCase().endsWith(".csv")) {
                      setImportMsg("Yalnız .csv faylı qəbul edilir.");
                      return;
                    }
                    await handleQuestionsCsvFile(f);
                  }}
                />
              }
              manualPanel={
                <form
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  onSubmit={qForm.handleSubmit((v) => addQuestionMut.mutate(v))}
                >
                  <p className="mb-3 text-sm font-medium text-slate-800">Tək sual əlavə et</p>
                  <div className="grid gap-3 sm:grid-cols-12">
                    <label className={`${labelClass} sm:col-span-2`}>
                      Sıra
                      <input
                        className={inputClass}
                        type="number"
                        {...qForm.register("order_index", { valueAsNumber: true })}
                      />
                    </label>
                    <label className={`${labelClass} sm:col-span-3`}>
                      Növ
                      <select className={inputClass} {...qForm.register("qtype")}>
                        <option value="mcq">Çoxtan seçimli</option>
                      </select>
                      <p className="mt-1 text-xs text-amber-800">
                        Doğru/Yanlış sualları hələ dəstəklənmir — OMR skan üçün yalnız MCQ istifadə edin.
                      </p>
                    </label>
                    <label className={`${labelClass} sm:col-span-12`}>
                      Sual mətni
                      <Controller
                        control={qForm.control}
                        name="stem"
                        render={({ field }) => (
                          <RichHtmlEditor
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Word-dən yapışdıra bilərsiniz. Boş buraxmaq da olar."
                            minHeightClass="min-h-[120px]"
                          />
                        )}
                      />
                    </label>
                    <label className={`${labelClass} sm:col-span-2`}>
                      Xal
                      <input className={inputClass} type="number" {...qForm.register("points", { valueAsNumber: true })} />
                    </label>
                    <label className={`${labelClass} sm:col-span-6`}>
                      Fənn
                      <select className={inputClass} disabled={bankSubjectsQuery.isLoading} {...qForm.register("subject_id")}>
                        <option value="">— seçilməyə bilər —</option>
                        {(bankSubjectsQuery.data ?? []).map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                            {s.short_code ? ` (${s.short_code})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={`${labelClass} sm:col-span-6`}>
                      Çətinlik
                      <select className={inputClass} {...qForm.register("difficulty")}>
                        <option value="">—</option>
                        <option value="easy">Asan</option>
                        <option value="medium">Orta</option>
                        <option value="hard">Çətin</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={addQuestionMut.isPending}
                    className={`${examPrimaryBtn} mt-4`}
                  >
                    {addQuestionMut.isPending ? "Əlavə olunur…" : "Sualı əlavə et"}
                  </button>
                </form>
              }
              listPanel={
                <>
                  {questionsQuery.isLoading && <p className="text-sm text-slate-500">Suallar yüklənir…</p>}
                  {!questionsQuery.isLoading && (questionsQuery.data ?? []).length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-3">№</th>
                            <th className="px-4 py-3">Mətn</th>
                            <th className="px-4 py-3">Növ</th>
                            <th className="px-4 py-3">Fənn</th>
                            <th className="px-4 py-3">Xal</th>
                            <th className="px-4 py-3 text-right">Əməl</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {(questionsQuery.data ?? []).map((q) => (
                            <tr key={q.id} className="hover:bg-slate-50/80">
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{q.order_index}</td>
                              <td className="max-w-md px-4 py-3 text-slate-700">
                                {plainTextFromHtml(q.stem || "").trim() ? (
                                  plainTextFromHtml(q.stem || "").slice(0, 120) +
                                  (plainTextFromHtml(q.stem || "").length > 120 ? "…" : "")
                                ) : (
                                  <span className="text-slate-400">— boş</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{q.qtype === "tf" ? "D/Y" : "MT"}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                {q.subject_short_code?.trim() || q.subject_name?.trim() || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{q.points}</td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  className="text-sm font-medium text-red-600 hover:text-red-800"
                                  onClick={() => delQuestionMut.mutate(q.id)}
                                >
                                  Sil
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!questionsQuery.isLoading && (questionsQuery.data ?? []).length === 0 && (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                      Hələ sual yoxdur. Yuxarıdan sual bazası, CSV və ya tək sual ilə əlavə edin.
                    </p>
                  )}
                </>
              }
            />
          )}

          {step === 1 && step1SubSection === "kitabca" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[#c0176a]/25 bg-[#fde8f3]/30 p-4">
                <h4 className="text-sm font-semibold text-[#9b1257]">Sual kitabçası (DİM standartı)</h4>
                <p className="mt-1 text-xs text-slate-700">
                  Process magenta başlıq, fiducial marker, variant kodu (A–D), QR, rəsmi təlimatlar — cavab kartı ilə
                  eyni vizual dil. Sektor və təşkilatçı dövlət səviyyəli imtahanlar üçün.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className={labelClass}>
                    Təşkilatçı
                    <input
                      className={inputClass}
                      value={bookletOrganiser}
                      onChange={(e) => setBookletOrganiser(e.target.value)}
                      placeholder="Dövlət İmtahan Mərkəzi"
                    />
                  </label>
                  <label className={labelClass}>
                    Sektor / sahə
                    <input
                      className={inputClass}
                      value={bookletSector}
                      onChange={(e) => setBookletSector(e.target.value)}
                      placeholder="Təhsil, həkimlik, dövlət qulluğu…"
                    />
                  </label>
                  <label className={labelClass}>
                    Müəssisə
                    <input
                      className={inputClass}
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                    />
                  </label>
                  <label className={labelClass}>
                    İmtahan kodu
                    <input
                      className={inputClass}
                      value={examCode}
                      onChange={(e) => setExamCode(e.target.value)}
                      placeholder={examId != null ? `IMT-${examId}` : "IMT-…"}
                    />
                  </label>
                  <label className={labelClass}>
                    Variant (endirmə)
                    <select className={inputClass} value={bookletVariant} onChange={(e) => setBookletVariant(e.target.value)}>
                      {(bookletVariants.length > 0 ? bookletVariants : [...DEFAULT_BOOKLET_VARIANTS]).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    Müddət (dəqiqə)
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      max={600}
                      value={bookletDurationMinutes}
                      onChange={(e) =>
                        setBookletDurationMinutes(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      placeholder="Məs: 90"
                    />
                  </label>
                  <label className={`${labelClass} sm:col-span-2`}>
                    Aktiv variantlar (cavab kartı ilə uyğun)
                    <input
                      className={inputClass}
                      value={bookletVariants.join(", ")}
                      onChange={(e) =>
                        setBookletVariants(
                          e.target.value
                            .split(/[,;\s]+/)
                            .map((x) => x.trim().toUpperCase())
                            .filter(Boolean),
                        )
                      }
                      placeholder="A, B, C, D"
                    />
                  </label>
                  <label className={labelClass}>
                    Seriya
                    <input className={inputClass} value={bookletSeries} onChange={(e) => setBookletSeries(e.target.value)} />
                  </label>
                  <label className={labelClass}>
                    Qeyd 1
                    <input className={inputClass} value={coverLine1} onChange={(e) => setCoverLine1(e.target.value)} />
                  </label>
                  <label className={labelClass}>
                    Qeyd 2
                    <input className={inputClass} value={coverLine2} onChange={(e) => setCoverLine2(e.target.value)} />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Kitabça parametrləri «Bal / fənn» saxlananda yadda saxlanır. Variant hərfi cavab kartındakı variant
                  sahəsi ilə eyni olmalıdır.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[#c0176a]/30 bg-white px-3 py-2 text-sm font-medium text-[#9b1257] hover:bg-[#fde8f3] disabled:opacity-40"
                    disabled={examId == null}
                    onClick={() =>
                      examId != null &&
                      downloadExamBookletCover(examId, {
                        institution: institution.trim(),
                        subtitle: examQuery.data?.description ?? "",
                        line1: coverLine1.trim(),
                        line2: coverLine2.trim(),
                        exam_code: examCode.trim() || undefined,
                        variant: bookletVariant,
                        duration_minutes:
                          typeof bookletDurationMinutes === "number" ? bookletDurationMinutes : undefined,
                      })
                    }
                  >
                    Üz qapağı (DİM PDF)
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[#c0176a] px-3 py-2 text-sm font-semibold text-white hover:bg-[#9b1257] disabled:opacity-40"
                    disabled={examId == null || !bookletDownloadReady}
                    title={
                      !bookletDownloadReady
                        ? `Sual kitabçası üçün ən azı ${plannedQuestionCount} qeydiyyatlı sual lazımdır (hazırda ${registeredQuestionCount})`
                        : undefined
                    }
                    onClick={() =>
                      examId != null &&
                      bookletDownloadReady &&
                      downloadExamQuestionBooklet(examId, {
                        cover_institution: institution.trim(),
                        cover_subtitle: examQuery.data?.description ?? "",
                        cover_line1: coverLine1.trim(),
                        cover_line2: coverLine2.trim(),
                        exam_code: examCode.trim() || undefined,
                        variant: bookletVariant,
                        duration_minutes:
                          typeof bookletDurationMinutes === "number" ? bookletDurationMinutes : undefined,
                      })
                    }
                  >
                    Tam kitabça (DİM PDF)
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[#c0176a]/40 bg-white px-3 py-2 text-sm font-medium text-[#9b1257] hover:bg-[#fde8f3] disabled:opacity-40"
                    disabled={examId == null || !bookletDownloadReady}
                    title={
                      !bookletDownloadReady
                        ? `Sual kitabçası üçün ən azı ${plannedQuestionCount} qeydiyyatlı sual lazımdır (hazırda ${registeredQuestionCount})`
                        : undefined
                    }
                    onClick={() =>
                      examId != null &&
                      bookletDownloadReady &&
                      downloadExamQuestionBookletDocx(examId, {
                        cover_institution: institution.trim(),
                        cover_subtitle: examQuery.data?.description ?? "",
                        cover_line1: coverLine1.trim(),
                        cover_line2: coverLine2.trim(),
                        exam_code: examCode.trim() || undefined,
                        variant: bookletVariant,
                        duration_minutes:
                          typeof bookletDurationMinutes === "number" ? bookletDurationMinutes : undefined,
                      })
                    }
                  >
                    Word (.docx)
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Planlı sual sayı: <strong className="text-slate-900">{plannedQuestionCount}</strong>
                  {orderedQuestions.length > 0 && (
                    <span className="text-slate-500">
                      {" "}
                      · DB sətirləri: {orderedQuestions.length}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => goToWizardStep(2)}
                  disabled={!canGoToAnswerKey}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cavab açarına keç
                </button>
              </div>
              {!canGoToAnswerKey && answerKeyBlockedReason ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {answerKeyBlockedReason}
                </p>
              ) : null}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Cavab açarı</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {plannedQuestionCount} sual üçün düzgün cavab və xal. Variant sayı:{" "}
                  <strong>{examQuery.data?.options_per_question ?? "—"}</strong>.
                </p>
              </div>
              <div className="max-h-[min(420px,55vh)] overflow-auto rounded-xl border border-slate-200 shadow-inner">
                <table className="w-full min-w-[320px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-semibold uppercase text-slate-600 shadow-sm">
                    <tr>
                      <th className="px-4 py-3">Sual №</th>
                      <th className="px-4 py-3">Düzgün cavab</th>
                      <th className="px-4 py-3">Xal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {answerRows.map((row, idx) => {
                      const optN = Math.min(5, Math.max(2, examQuery.data?.options_per_question ?? 4));
                      const letters = ["A", "B", "C", "D", "E"].slice(0, optN);
                      const qMeta = questionsQuery.data?.find((q) => q.order_index === row.question_number);
                      const isTf = qMeta?.qtype === "tf";
                      return (
                        <tr key={`${row.question_number}-${idx}`} className="hover:bg-slate-50/90">
                          <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">
                            {row.question_number}
                            {isTf ? (
                              <span className="ml-1 block text-[10px] font-normal text-amber-700">
                                D/Y — skan dəstəklənmir
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2">
                            <select
                              className={`${inputClass} !mt-0 max-w-[100px] py-1.5`}
                              value={isTf ? "A" : row.correct_answer}
                              onChange={(e) => {
                                const next = [...answerRows];
                                next[idx] = { ...next[idx], correct_answer: e.target.value };
                                setAnswerRows(next);
                              }}
                              disabled={isTf}
                            >
                              {letters.map((L) => (
                                <option key={L} value={L}>
                                  {L}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              className={`${inputClass} !mt-0 w-20 py-1.5`}
                              type="number"
                              value={row.points}
                              onChange={(e) => {
                                const next = [...answerRows];
                                next[idx] = { ...next[idx], points: Number(e.target.value) };
                                setAnswerRows(next);
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(answerRows.length !== plannedQuestionCount || plannedQuestionCount === 0) && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  Cavab sətirləri ({answerRows.length}) planlı sual sayı ({plannedQuestionCount}) ilə üst-üstə düşməlidir.
                </p>
              )}
              <button
                type="button"
                onClick={() => saveKeyMut.mutate()}
                disabled={
                  saveKeyMut.isPending || answerRows.length !== plannedQuestionCount || plannedQuestionCount === 0
                }
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saveKeyMut.isPending ? "Saxlanır…" : "Saxla və PDF addımına keç"}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Cavab kartı şəxsiyyəti və fənn/blok parametrlərini dəyişmək üçün{" "}
                <button
                  type="button"
                  className="font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900"
                  onClick={() => goToWizardStep(1)}
                >
                  1-ci addım — Suallar və fənnlər
                </button>{" "}
                keçin (əlavə et «Saxla» etməyi unutmayın).
              </p>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Cavab kartı PDF (DİM standartı)</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Şəxsiyyət xanaları «Suallar və fənnlər» addımında saxladığınız seçimlərdən generasiya olunur; mövcud
                  dizayn şablonu seçmisinizsə, həmin seçimlər şablon üzərinə tətbiq olunur. Sahələr yalnız dairə ilə
                  doldurulur.
                </p>
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-indigo-950">
                  Bu addımı bitirdikdən sonra <strong className="font-semibold">İmtahanlar siyahısında</strong> həmin
                  imtahanı görəcəksiniz. Cavab açarı tam olduqda skan və nəticə keçidləri aktiv olur.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["exams"] });
                    navigate("/exams");
                  }}
                  className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-900 ring-1 ring-indigo-200 transition hover:bg-indigo-50"
                >
                  Siyahıya qayıt
                </button>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                {examQuery.data?.course_id == null && (
                  <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    Bu imtahan heç bir kursa aid deyil — yalnız <strong>ümumi (qlobal)</strong> dizayn şablonları
                    seçilə bilər.
                  </p>
                )}
                <label className={labelClass}>
                  Dizayn şablonu (kitabxana)
                  <select
                    className={inputClass}
                    disabled={linkSheetPresetMut.isPending || sheetPresetsQuery.isLoading}
                    value={examQuery.data?.answer_sheet_preset_id ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      linkSheetPresetMut.mutate(raw === "" ? null : Number(raw));
                    }}
                  >
                    <option value="">Standart kart (şablonsuz — aşağıdakı şəxsiyyət seçimləri)</option>
                    {(sheetPresetsQuery.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.course_id == null ? " — ümumi" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-xs text-emerald-900/85">
                  Şablon saxlanmış cavab kartı tərtibatını (sahələr, ölçülər) tətbiq edir; sual sayı və variant sayı bu
                  imtahandan götürülür.
                  {(user?.role === "admin" || user?.role === "manager" || user?.role === "operator") ? (
                    <>
                      {" "}
                      <Link
                        className="font-medium text-emerald-800 underline"
                        to={`/designer?examId=${examId}${examQuery.data?.answer_sheet_preset_id ? `&presetId=${examQuery.data.answer_sheet_preset_id}` : ""}`}
                      >
                        Cavab kartı dizaynerində
                      </Link>{" "}
                      yeni şablon yaradıb saxlaya bilərsiniz.
                    </>
                  ) : (
                    " Yeni şablon tərtibi üçün menecer və ya administrator əlaqə saxlayın."
                  )}
                </p>
                {sheetPresetsQuery.isLoading && step === 3 && (
                  <p className="mt-2 text-xs text-emerald-800">Şablonlar yüklənir…</p>
                )}
                {examQuery.data?.answer_sheet_preset && (
                  <p className="mt-2 text-xs font-medium text-emerald-950">
                    İmtahanda bağlı: {examQuery.data.answer_sheet_preset.name}
                  </p>
                )}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className={labelClass}>
                  Müəssisə adı
                  <input className={inputClass} value={institution} onChange={(e) => setInstitution(e.target.value)} />
                </label>
                <label className={labelClass}>
                  İştirakçı / qrup təsviri
                  <input
                    className={inputClass}
                    placeholder="məs. 11B sinif — Azərbaycan bölməsi"
                    value={participantLabel}
                    onChange={(e) => setParticipantLabel(e.target.value)}
                  />
                </label>
                <label className={`${labelClass} lg:col-span-2`}>
                  İstinad kodu (QR-da da saxlanılır)
                  <input
                    className={inputClass}
                    placeholder="məs. 2026-0421"
                    value={participantCode}
                    onChange={(e) => setParticipantCode(e.target.value)}
                  />
                </label>
              </div>
              <label className="flex max-w-3xl cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={omrTwoPageStitched}
                  onChange={(e) => setOmrTwoPageStitched(e.target.checked)}
                />
                <span>
                  <span className="font-semibold text-slate-900">İki səhifəli kart + vahid OMR şablonu</span>
                  <span className="mt-1 block text-slate-600">
                    Şəxsiyyət bloku ilə MCQ eyni şaquli koordinat sistemində birləşir (skan üçün tək uzun şəkil). Çox
                    suallı kartlarda faydalıdır.
                  </span>
                </span>
              </label>
              {examId != null && step3PreviewPayload ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-slate-900">Canlı kart önizləməsi</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Seçilmiş dizayn şablonu və şəxsiyyət parametrləri üzrə PDF önizləmə.
                  </p>
                  <div className="mt-3 max-h-[480px] overflow-auto rounded-lg border border-slate-100">
                    <LiveSheetPreview
                      examId={examId}
                      templatePayload={{
                        ...step3PreviewPayload,
                        participant_label: participantLabel.trim() || undefined,
                        participant_code: participantCode.trim() || undefined,
                      }}
                      layoutPresetId={examQuery.data?.answer_sheet_preset_id}
                      depsKey={`${examId}-${JSON.stringify(step3PreviewPayload)}-${participantLabel}-${participantCode}`}
                    />
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                  onClick={() => genPdfMut.mutate()}
                  disabled={genPdfMut.isPending || !answerKeyComplete}
                  title={!answerKeyComplete ? "Əvvəlcə cavab açarını tam saxlayın" : undefined}
                >
                  {genPdfMut.isPending ? "Hazırlanır…" : "PDF yarat və endir"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                  onClick={() => draftPdfMut.mutate()}
                  disabled={draftPdfMut.isPending || genPdfMut.isPending || !answerKeyComplete}
                  title={!answerKeyComplete ? "Əvvəlcə cavab açarını tam saxlayın" : undefined}
                >
                  {draftPdfMut.isPending ? "Saxlanır…" : "Qaralama saxla"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => examId && downloadAnswerSheetPdf(examId)}
                  disabled={genPdfMut.isPending}
                >
                  Son təsdiqlənmiş kartı endir
                </button>
              </div>
              {pdfMsg && <p className="text-sm font-medium text-emerald-700">{pdfMsg}</p>}
              {readinessQuery.data?.ready_for_scan && examId != null && (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  <Link
                    to={`/scan?exam=${examId}`}
                    className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Skana keç
                  </Link>
                  <Link
                    to={`/reports?exam=${examId}`}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    Nəticələrə keç
                  </Link>
                </div>
              )}
              {genPdfMut.isError && (
                <p className="whitespace-pre-wrap text-sm text-red-600">{getApiErrorMessage(genPdfMut.error)}</p>
              )}
              {draftPdfMut.isError && (
                <p className="whitespace-pre-wrap text-sm text-red-600">{getApiErrorMessage(draftPdfMut.error)}</p>
              )}
              {finalizePdfMut.isError && (
                <p className="whitespace-pre-wrap text-sm text-red-600">{getApiErrorMessage(finalizePdfMut.error)}</p>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <h4 className="text-sm font-semibold text-slate-900">Yaradılmış kartlar</h4>
                {sheetsQuery.isLoading && <p className="mt-2 text-sm text-slate-500">Yüklənir…</p>}
                {(sheetsQuery.data ?? []).length === 0 && !sheetsQuery.isLoading && (
                  <p className="mt-2 text-sm text-slate-500">Hələ kart yoxdur.</p>
                )}
                <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-100 bg-white text-sm">
                  {(sheetsQuery.data ?? []).map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{s.sheet_uuid?.slice(0, 13)}…</code>
                        <span className="text-slate-600">{s.participant_label || "—"}</span>
                        {s.is_draft && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Qaralama
                          </span>
                        )}
                      </div>
                      {s.is_draft ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                          disabled={finalizePdfMut.isPending || !answerKeyComplete}
                          title={!answerKeyComplete ? "Əvvəlcə cavab açarını tam saxlayın" : undefined}
                          onClick={() => finalizePdfMut.mutate(s.id)}
                        >
                          PDF təsdiqlə
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                          onClick={() => s.sheet_uuid && downloadAnswerSheetPdf(examId, s.sheet_uuid)}
                        >
                          Endir
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExamsPage() {
  const location = useLocation();
  if (location.pathname.endsWith("/yarat")) {
    return <ExamsWizardPage />;
  }
  return <ExamListPage />;
}
