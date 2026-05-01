import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  downloadAnswerSheetPdf,
  finalizeAnswerSheetDraft,
  generateAnswerSheet,
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
  getAnswerKey,
  getExam,
  getExamIntegrations,
  listExams,
  saveAnswerKey,
  updateExam
} from "../../api/exams";
import { listBankSubjects, listQuestionBank } from "../../api/questionBank";
import { listAnswerSheetPresets } from "../../api/sheetPresets";
import { addQuestionFromBank, createQuestion, deleteQuestion, importQuestionsCsv, listQuestions } from "../../api/questions";
import type { BankQuestion } from "../../api/questionBank";
import { useAuthStore } from "../../store/authStore";
import { plainTextFromHtml } from "../../utils/html";
import {
  buildAnswerSheetIdentityOverlay,
  defaultAnswerCardIdentity,
  type AnswerCardIdentitySelection,
} from "./buildAnswerCardIdentity";

type ExamBasicsForm = {
  course_id: number;
  title: string;
  description: string;
  question_count: number;
  options_per_question: number;
  columns_count: number;
  scheduled_at: string;
  seat_quota: string;
  add_ticket: boolean;
  ticket_title: string;
  ticket_description: string;
  ticket_price: number;
  ticket_quota: string;
};

type QuestionForm = {
  order_index: number;
  qtype: "mcq" | "tf";
  stem: string;
  points: number;
  subject_id: string;
  difficulty: "" | "easy" | "medium" | "hard";
};

const steps = ["İmtahan", "Suallar və fənnlər", "Cavab açarı", "PDF kartı"] as const;

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const labelClass = "block text-sm font-medium text-slate-700";

function toDatetimeLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ExamScheduleEditor({ examId, exam }: { examId: number; exam: Exam }) {
  const qc = useQueryClient();
  const [scheduled, setScheduled] = useState("");
  const [quota, setQuota] = useState("");

  useEffect(() => {
    setScheduled(toDatetimeLocalInput(exam.scheduled_at));
    setQuota(exam.seat_quota != null ? String(exam.seat_quota) : "");
  }, [exam.id, exam.scheduled_at, exam.seat_quota]);

  const saveMut = useMutation({
    mutationFn: () => {
      const qRaw = quota.trim();
      let seat_quota: number | null = null;
      if (qRaw !== "") {
        const n = Number(qRaw);
        if (!Number.isFinite(n) || n < 1) {
          throw new Error("Yer/kontingent ən azı 1 olmalıdır və ya boş saxlanılmalıdır.");
        }
        seat_quota = n;
      }
      return updateExam(examId, {
        scheduled_at: scheduled.trim() === "" ? null : new Date(scheduled).toISOString(),
        seat_quota
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["exam", examId] });
      await qc.invalidateQueries({ queryKey: ["exams"] });
    }
  });

  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-sky-950">İmtahan planı</h3>
      <p className="mt-1 text-xs text-sky-900/85">
        Keçirilmə vaxtı və ən çox neçə iştirakçı (yer/kontingent). Əlavə məhdudiyyət üçün biletin öz kvotasını da
        istifadə edə bilərsiniz.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className={`${labelClass} sm:col-span-1`}>
          Planlaşdırılmış tarix / saat
          <input
            type="datetime-local"
            className={inputClass}
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
          />
        </label>
        <label className={`${labelClass} sm:col-span-1`}>
          Yer sayı (iştirakçı limiti)
          <input
            type="number"
            min={1}
            className={inputClass}
            placeholder="Boş = limit yoxdur"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
          />
        </label>
        <div className="flex items-end sm:col-span-1">
          <button
            type="button"
            disabled={saveMut.isPending}
            className="w-full rounded-lg bg-sky-800 px-4 py-2 text-sm font-medium text-white hover:bg-sky-900 disabled:opacity-50"
            onClick={() => {
              saveMut.mutate(undefined, {
                onError: (e) => {
                  window.alert(e instanceof Error ? e.message : "Yadda saxlama xətası");
                }
              });
            }}
          >
            {saveMut.isPending ? "Saxlanılır…" : "Planı saxla"}
          </button>
        </div>
      </div>
      {saveMut.isError && (
        <p className="mt-2 text-xs text-red-700">
          Dəyərləri yoxlayın (tarix və ya yer sayı).
        </p>
      )}
    </div>
  );
}

function difficultyAz(d: string | null | undefined) {
  if (!d) return "—";
  switch (d) {
    case "easy":
      return "Asan";
    case "medium":
      return "Orta";
    case "hard":
      return "Çətin";
    default:
      return d;
  }
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

  const { register, handleSubmit, reset, watch } = useForm<ExamBasicsForm>({
    defaultValues: {
      course_id: 1,
      question_count: 20,
      options_per_question: 4,
      columns_count: 2,
      title: "",
      description: "",
      scheduled_at: "",
      seat_quota: "",
      add_ticket: false,
      ticket_title: "",
      ticket_description: "",
      ticket_price: 0,
      ticket_quota: ""
    }
  });
  const addTicketEnabled = watch("add_ticket");

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
  const [pickBankId, setPickBankId] = useState("");
  const [pickOrderIndex, setPickOrderIndex] = useState(1);

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
        course_id: umumiExam ? null : Number(payload.course_id),
        title: payload.title,
        description: payload.description || undefined,
        question_count: Number(payload.question_count),
        options_per_question: Number(payload.options_per_question),
        columns_count: Number(payload.columns_count),
        negative_marking: false,
        negative_ratio: 0,
        is_active: true,
        scheduled_at: payload.scheduled_at.trim() ? new Date(payload.scheduled_at).toISOString() : undefined,
        seat_quota:
          sq !== "" && Number.isFinite(seatQuotaNum) && seatQuotaNum >= 1 ? Math.floor(seatQuotaNum) : undefined,
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

  const addFromBankMut = useMutation({
    mutationFn: () =>
      addQuestionFromBank(examId!, {
        bank_question_id: Number(pickBankId),
        order_index: pickOrderIndex
      }),
    onSuccess: async () => {
      setPickBankId("");
      await queryClient.invalidateQueries({ queryKey: ["questions", examId] });
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
      await queryClient.invalidateQueries({ queryKey: ["question-bank-pick"] });
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

  function goToWizardStep(next: number) {
    if (next < 0 || next > 3) return;
    if (examId == null && next > 0) return;
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
    setPickOrderIndex(nextQuestionOrder);
  }, [nextQuestionOrder]);

  /** İmtahan yaradılarkən təyin olunan planlı sual sayı — cavab açarı və kart bununla uyğunlaşır. */
  const plannedQuestionCount = Math.max(0, examQuery.data?.question_count ?? 0);

  const canPickFromBank = user?.role === "admin" || user?.role === "manager";

  const sheetsQuery = useQuery({
    queryKey: ["answerSheets", examId],
    queryFn: () => listExamSheetTemplates(examId!),
    enabled: examId != null && step === 3
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
    onSuccess: () => goToWizardStep(3),
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
        grading_config: { subjects, question_blocks, answer_card_identity: answerCardIdentity },
        grading_policy,
      });
    },
    onSuccess: async () => {
      setGradingLoadedForExamId(null);
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
    }
  });

  const genPdfMut = useMutation({
    mutationFn: async () => {
      const exam = examQuery.data;
      if (!exam || examId == null) throw new Error("İmtahan yüklənməyib");
      const qn = plannedQuestionCount > 0 ? plannedQuestionCount : exam.question_count;
      const identityOv = buildAnswerSheetIdentityOverlay(answerCardIdentity);
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
                paper_size: "A4",
                title: "CAVAB KARTI",
                header_subtitle: "",
                ...runtimeOverlay,
              },
            });
      await downloadAnswerSheetPdf(examId, res.sheet_uuid);
      return res;
    },
    onSuccess: (res) => {
      setPdfMsg(`PDF yaradıldı və yükləndi. Kart UUID: ${res.sheet_uuid}`);
      queryClient.invalidateQueries({ queryKey: ["answerSheets", examId] });
      if (examId != null) queryClient.invalidateQueries({ queryKey: ["exam-integrations", examId] });
    }
  });

  const draftPdfMut = useMutation({
    mutationFn: async () => {
      const exam = examQuery.data;
      if (!exam || examId == null) throw new Error("İmtahan yüklənməyib");
      const qn = plannedQuestionCount > 0 ? plannedQuestionCount : exam.question_count;
      const identityOv = buildAnswerSheetIdentityOverlay(answerCardIdentity);
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
          paper_size: "A4",
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

  async function handleQuestionsCsvFile(file: File | undefined) {
    if (!file || examId == null) return;
    setImportMsg(null);
    const r = await importQuestionsCsv(examId, file);
    setImportMsg(`İdxal: ${r.imported} əlavə, ${r.skipped} keçildi`);
    await queryClient.invalidateQueries({ queryKey: ["questions", examId] });
    await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/exams"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            ← İmtahanlar siyahısı
          </Link>
          {examId != null ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              №{examId}
            </span>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.65rem]">İmtahan yaratma</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
          Dörd addımda imtahanı qurun: əsas parametrlər, suallar və fənn konfiqurasiyası, cavab açarı, sonra cavab
          kartı PDF-i. Addımlar arasında istənilən vaxt keçid edə bilərsiniz.
        </p>
      </header>

      {/* Addım göstəricisi */}
      <nav aria-label="Sihirbaz addımları" className="card !p-4 sm:!p-5">
        <ol className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1">
          {steps.map((label, i) => {
            const disabled = examId == null && i > 0;
            const active = step === i;
            const done = examId != null && step > i;
            return (
              <li key={label} className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    goToWizardStep(i);
                  }}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition sm:w-auto sm:py-2",
                    disabled
                      ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                      : active
                        ? "border-indigo-200 bg-indigo-50 text-indigo-950 shadow-sm ring-1 ring-indigo-100"
                        : done
                          ? "border-emerald-100 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-50"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      active
                        ? "bg-indigo-600 text-white"
                        : done
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-200 text-slate-700"
                    ].join(" ")}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0 font-medium leading-snug">{label}</span>
                </button>
                {i < steps.length - 1 && (
                  <span
                    className="mx-1 hidden h-px w-6 shrink-0 bg-slate-200 sm:block"
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {examId != null && (
        <section
          className="card border-indigo-100 bg-gradient-to-br from-indigo-50/90 to-white !shadow-sm"
          aria-label="İmtahan inteqrasiyaları"
        >
          <h2 className="text-base font-semibold text-indigo-950">Kurs, bilet, kart və yoxlama</h2>
          <p className="mt-1 text-sm text-slate-600">
            {integrationsQuery.data?.course_id == null
              ? "Ümumi imtahan (kurs bağlantısı yoxdur). Şagird kodu bu kontekstdə tətbiq olunmur; skan üçün kart şablonları saxlanılır."
              : "Bu imtahan seçilmiş kursa bağlıdır; skan və şagird məlumatları həmin kurs kontekstindədir."}
          </p>
          {integrationsQuery.isLoading && <p className="mt-3 text-sm text-slate-500">Yüklənir...</p>}
          {integrationsQuery.data && (
            <ul className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
              <li className="rounded-lg border border-indigo-100/80 bg-white/70 px-3 py-2">
                <span className="font-medium text-slate-900">Kurs</span>
                <span className="mt-0.5 block text-slate-600">
                  {integrationsQuery.data.course_id == null ? "Ümumi (yox)" : `№${integrationsQuery.data.course_id}`}
                </span>
              </li>
              <li className="rounded-lg border border-indigo-100/80 bg-white/70 px-3 py-2">
                <span className="font-medium text-slate-900">Bilet</span>
                <span className="mt-0.5 block text-slate-600">
                  {integrationsQuery.data.linked_tickets.length === 0
                    ? "Bağlı aktiv bilet yoxdur"
                    : integrationsQuery.data.linked_tickets.map((t) => `№${t.id} «${t.title}»`).join(", ")}
                </span>
              </li>
              <li className="rounded-lg border border-indigo-100/80 bg-white/70 px-3 py-2">
                <span className="font-medium text-slate-900">Cavab kartı şablonları</span>
                <span className="mt-0.5 block text-slate-600">
                  {integrationsQuery.data.answer_sheet_templates_count} (PDF addımında artır)
                </span>
              </li>
              <li className="rounded-lg border border-indigo-100/80 bg-white/70 px-3 py-2">
                <span className="font-medium text-slate-900">Skan oturumları</span>
                <span className="mt-0.5 block text-slate-600">
                  cəmi {integrationsQuery.data.scan_sessions_total}, aktiv {integrationsQuery.data.scan_sessions_active}
                </span>
              </li>
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-indigo-100/80 pt-4">
            {courseIdForLinks != null && (
              <Link
                className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                to={`/courses/${courseIdForLinks}`}
              >
                Kurs paneli
              </Link>
            )}
            <Link
              className="inline-flex items-center rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-800 transition hover:bg-indigo-50"
              to={`/scan?exam=${examId}`}
            >
              Skan — bu imtahan
            </Link>
            {courseIdForLinks != null && (
              <Link
                className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                to={`/students?course=${courseIdForLinks}`}
              >
                Şagirdlər (kurs)
              </Link>
            )}
          </div>
        </section>
      )}

      {examId != null && step === 1 && (
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
              onClick={() =>
                saveGradingMut.mutate(undefined, {
                  onError: (e) => window.alert(e instanceof Error ? e.message : "Saxlama xətası"),
                })
              }
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
              ).map(([key, lab]) => (
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

          {saveGradingMut.isError && (
            <p className="mt-3 text-sm text-red-600">
              Saxlama alınmadı — məlumatları yoxlayın (fənn kodları və blok uyğunluğu).
            </p>
          )}
          {saveGradingMut.isSuccess && (
            <p className="mt-3 text-sm font-medium text-emerald-700">Dəyişikliklər saxlanıldı.</p>
          )}
        </section>
      )}

      {step === 0 && examId != null && (
        <div className="card flex flex-col gap-4 border-amber-100 bg-amber-50/40 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-slate-900">Cari imtahan №{examId}</p>
            <p className="mt-1 text-sm text-slate-600">Davam edin və ya sıfırdan yeni imtahan yaradın.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              onClick={() => goToWizardStep(1)}
            >
              Suallara keç
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setExamId(null);
                setUmumiExam(false);
                setImportMsg(null);
                setPdfMsg(null);
                reset();
              }}
            >
              Yeni imtahan
            </button>
          </div>
        </div>
      )}

      {step === 0 && examId == null && (
        <form className="card space-y-6" onSubmit={handleSubmit((v) => createExamMut.mutate(v))}>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Əsas məlumatlar</h2>
            <p className="mt-1 text-sm text-slate-600">Kurs və imtahan parametrlərini daxil edin.</p>
          </div>
          {user?.role === "admin" && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={umumiExam}
                onChange={(e) => setUmumiExam(e.target.checked)}
              />
              <span>
                <strong className="font-semibold">Ümumi imtahan</strong>
                <span className="mt-1 block text-slate-600">
                  Kurs seçilmir; qapaq və cavab kartında sistem logosu istifadə olunur. Bilet əlavə etmək mümkün deyil.
                </span>
              </span>
            </label>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={labelClass}>
              Kurs
              <select
                className={inputClass}
                disabled={umumiExam}
                {...register("course_id", { valueAsNumber: true })}
              >
                {(coursesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Başlıq
              <input className={inputClass} placeholder="məs. Riyaziyyat — buraxılış" {...register("title", { required: true })} />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Təsvir
              <input className={inputClass} placeholder="Qısa təsvir (istəyə bağlı)" {...register("description")} />
            </label>
            <label className={labelClass}>
              Planlaşdırılan sual sayı
              <input className={inputClass} type="number" min={1} {...register("question_count", { valueAsNumber: true })} />
            </label>
            <label className={labelClass}>
              Hər sual üçün variant
              <input className={inputClass} type="number" min={2} max={5} {...register("options_per_question", { valueAsNumber: true })} />
            </label>
            <label className={labelClass}>
              Sütun sayı (kartda)
              <input className={inputClass} type="number" min={1} max={4} {...register("columns_count", { valueAsNumber: true })} />
            </label>
            <label className={labelClass}>
              İmtahan tarixi / saat (istəyə bağlı)
              <input className={inputClass} type="datetime-local" {...register("scheduled_at")} />
            </label>
            <label className={labelClass}>
              Yer sayı — limit (istəyə bağlı)
              <input className={inputClass} type="number" min={1} placeholder="Boş = limitsiz" {...register("seat_quota")} />
            </label>
          </div>

          {!umumiExam && (
          <fieldset className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-800">Bilet (kurs satışı)</legend>
            <p className="mb-3 text-xs text-slate-600">İmtahan yaradılarkən kursa avtomatik bağlanan bilet.</p>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                {...register("add_ticket")}
              />
              <span>Bu imtahan üçün dərhal bilet yaradın</span>
            </label>
            {addTicketEnabled && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className={`${labelClass} sm:col-span-2`}>
                  Bilet başlığı
                  <input
                    className={inputClass}
                    placeholder="məs. Riyaziyyat buraxılış — 2026"
                    {...register("ticket_title", {
                      validate: (v) =>
                        !addTicketEnabled || (v && v.trim().length > 0) || "Bilet başlığı mütləqdir"
                    })}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Qısa təsvir
                  <input className={inputClass} placeholder="İstəyə bağlı" {...register("ticket_description")} />
                </label>
                <label className={labelClass}>
                  Qiymət (AZN)
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    {...register("ticket_price", { valueAsNumber: true })}
                  />
                </label>
                <label className={labelClass}>
                  Kontingent (boş = limitsiz)
                  <input className={inputClass} type="number" min={1} placeholder="—" {...register("ticket_quota")} />
                </label>
              </div>
            )}
          </fieldset>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <button
              type="submit"
              disabled={createExamMut.isPending}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {createExamMut.isPending ? "Yaradılır…" : "İmtahan yarat və davam et"}
            </button>
            {createExamMut.isError && <p className="text-sm text-red-600">Yaratma xətası — məlumatları yoxlayın.</p>}
          </div>
        </form>
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
            <button
              type="button"
              className="self-start rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100 sm:self-auto"
              onClick={() => delExamMut.mutate(examId)}
            >
              İmtahanı sil
            </button>
          </div>

          {examQuery.data && step === 1 ? <ExamScheduleEditor examId={examId} exam={examQuery.data} /> : null}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Suallar</h3>
                <p className="mt-1 text-sm text-slate-600">
                  CSV: <code className="text-xs">order_index</code>, <code className="text-xs">stem</code>; istəyə görə{" "}
                  <code className="text-xs">qtype</code> (mcq/tf), <code className="text-xs">points</code>,{" "}
                  <code className="text-xs">options_json</code>, <code className="text-xs">subject_id</code>,{" "}
                  <code className="text-xs">subject_short_code</code> (və ya köhnə{" "}
                  <code className="text-xs">subject_code</code>), <code className="text-xs">difficulty</code>{" "}
                  (easy/medium/hard).
                </p>
              </div>

              <div
                className={[
                  "rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
                  csvDragActive
                    ? "border-indigo-400 bg-indigo-50/60"
                    : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
                ].join(" ")}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCsvDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setCsvDragActive(false);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCsvDragActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && !f.name.toLowerCase().endsWith(".csv")) {
                    setImportMsg("Yalnız .csv faylı qəbul edilir.");
                    return;
                  }
                  await handleQuestionsCsvFile(f);
                }}
              >
                <label className="cursor-pointer text-sm font-medium text-indigo-700 hover:text-indigo-900">
                  <span>CSV fayl seçin və ya buraya buraxın</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      await handleQuestionsCsvFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {importMsg && (
                  <p
                    className={
                      importMsg.includes("Yalnız") ? "mt-3 text-sm text-amber-800" : "mt-3 text-sm text-emerald-700"
                    }
                  >
                    {importMsg}
                  </p>
                )}
              </div>

              {canPickFromBank && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
                  <p className="mb-1 text-sm font-semibold text-emerald-950">Sual bazasından əlavə et</p>
                  <p className="mb-3 text-xs text-emerald-900/85">
                    Kartdan sualı seçin; sıra nömrəsini təyin edin (adətən növbəti boş sıra).
                  </p>
                  <div className="mb-4 grid gap-3 sm:grid-cols-12">
                    <label className={`${labelClass} sm:col-span-5`}>
                      Axtarış
                      <input
                        className={inputClass}
                        value={bankStemSearch}
                        onChange={(e) => setBankStemSearch(e.target.value)}
                        placeholder="Sual mətninə görə"
                      />
                    </label>
                    <label className={`${labelClass} sm:col-span-4`}>
                      Fənn üzrə süzgəc
                      <select
                        className={inputClass}
                        value={bankFilterSubjectId}
                        onChange={(e) => setBankFilterSubjectId(e.target.value)}
                        disabled={bankSubjectsQuery.isLoading}
                      >
                        <option value="">Hamısı</option>
                        {(bankSubjectsQuery.data ?? []).map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                            {s.short_code ? ` (${s.short_code})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={`${labelClass} sm:col-span-3`}>
                      İmtahanda sıra №
                      <input
                        className={inputClass}
                        type="number"
                        min={1}
                        value={pickOrderIndex}
                        onChange={(e) => setPickOrderIndex(Number(e.target.value))}
                      />
                    </label>
                  </div>

                  {bankPickQuery.isLoading && <p className="text-sm text-emerald-900/80">Yüklənir…</p>}
                  {!bankPickQuery.isLoading && (bankPickQuery.data ?? []).length === 0 && (
                    <p className="rounded-lg bg-white/80 px-3 py-4 text-center text-sm text-slate-600">
                      Uyğun sual tapılmadı — axtarışı dəyişin və ya süzgəci təmizləyin.
                    </p>
                  )}
                  <div className="grid max-h-[min(420px,50vh)] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                    {(bankPickQuery.data ?? []).map((b: BankQuestion) => {
                      const plain = plainTextFromHtml(b.stem || "");
                      const preview = plain.trim() ? plain.slice(0, 220) + (plain.length > 220 ? "…" : "") : "(mətn yoxdur)";
                      const sel = pickBankId === String(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setPickBankId(String(b.id))}
                          className={[
                            "rounded-xl border p-3 text-left text-sm transition",
                            sel
                              ? "border-emerald-600 bg-white shadow-md ring-2 ring-emerald-300"
                              : "border-emerald-100/90 bg-white/90 hover:border-emerald-300 hover:bg-white",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-emerald-950">#{b.id}</span>
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-900">
                              {b.qtype === "tf" ? "D/Y" : "MT"}
                            </span>
                          </div>
                          {b.subject ? (
                            <p className="mt-1 text-xs font-medium text-emerald-900/90">
                              {b.subject.short_code || b.subject.name}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-slate-400">Fənn yoxdur</p>
                          )}
                          <p className="mt-2 line-clamp-4 text-slate-700">{preview}</p>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={pickBankId === "" || addFromBankMut.isPending}
                    className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 sm:w-auto"
                    onClick={() => addFromBankMut.mutate()}
                  >
                    {addFromBankMut.isPending ? "Əlavə olunur…" : "Seçilmiş sualı əlavə et"}
                  </button>
                  {bankPickQuery.isError ? (
                    <p className="mt-2 text-xs text-red-700">Sual bazası yüklənmədi — yenidən yoxlayın.</p>
                  ) : null}
                </div>
              )}

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
                      <option value="tf">Doğru / Yanlış</option>
                    </select>
                  </label>
                  <label className={`${labelClass} sm:col-span-5`}>
                    Sual mətni
                    <input
                      className={inputClass}
                      placeholder="Boş buraxıla bilər (yalnız sıra)"
                      {...qForm.register("stem")}
                    />
                  </label>
                  <label className={`${labelClass} sm:col-span-2`}>
                    Xal
                    <input className={inputClass} type="number" {...qForm.register("points", { valueAsNumber: true })} />
                  </label>
                  <label className={`${labelClass} sm:col-span-6`}>
                    Fənn (sual bazası)
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
                  className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Əlavə et
                </button>
              </form>

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
                        <th className="px-4 py-3">Çətinlik</th>
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
                              plainTextFromHtml(q.stem || "").slice(0, 160) +
                              (plainTextFromHtml(q.stem || "").length > 160 ? "…" : "")
                            ) : (
                              <span className="text-slate-400">— boş</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{q.qtype}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {q.subject_short_code?.trim() || q.subject_name?.trim() ? (
                              <>
                                {q.subject_short_code?.trim() ?? ""}
                                {q.subject_short_code?.trim() && q.subject_name?.trim() ? " · " : ""}
                                {q.subject_name?.trim() ?? ""}
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{difficultyAz(q.difficulty)}</td>
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
                <p className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Əlavə edilmiş sual sətiri yoxdur — istəsəniz CSV ilə və ya tək-tək əlavə edin. Cavab açarı və kitabça
                  planlı sual sayına ({plannedQuestionCount}) uyğun qurulacaq; mətn boş ola bilər.
                </p>
              )}

              <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                <h4 className="text-sm font-semibold text-violet-950">Sual kitabçası PDF</h4>
                <p className="mt-1 text-xs text-violet-900/80">
                  Üz qapağında logo (kurs və ya sistem), tam kitabçada isə planlı say qədər yer — mətni sonradan əlavə
                  etsəniz yenidən yükləyin.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-900 hover:bg-violet-50 disabled:opacity-40"
                    disabled={examId == null}
                    onClick={() =>
                      examId != null &&
                      downloadExamBookletCover(examId, {
                        institution: institution.trim(),
                        subtitle: examQuery.data?.description ?? ""
                      })
                    }
                  >
                    Üz qapağı endir
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
                    disabled={examId == null || plannedQuestionCount < 1}
                    onClick={() =>
                      examId != null &&
                      downloadExamQuestionBooklet(examId, {
                        cover_institution: institution.trim(),
                        cover_subtitle: examQuery.data?.description ?? ""
                      })
                    }
                  >
                    Tam kitabça endir
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
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
                  disabled={plannedQuestionCount === 0}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cavab açarına keç
                </button>
              </div>
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
                          <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">{row.question_number}</td>
                          <td className="px-4 py-2">
                            {isTf ? (
                              <select
                                className={`${inputClass} !mt-0 max-w-[140px] py-1.5`}
                                value={row.correct_answer}
                                onChange={(e) => {
                                  const next = [...answerRows];
                                  next[idx] = { ...next[idx], correct_answer: e.target.value };
                                  setAnswerRows(next);
                                }}
                              >
                                <option value="T">T (Doğru)</option>
                                <option value="F">F (Yanlış)</option>
                              </select>
                            ) : (
                              <select
                                className={`${inputClass} !mt-0 max-w-[100px] py-1.5`}
                                value={row.correct_answer}
                                onChange={(e) => {
                                  const next = [...answerRows];
                                  next[idx] = { ...next[idx], correct_answer: e.target.value };
                                  setAnswerRows(next);
                                }}
                              >
                                {letters.map((L) => (
                                  <option key={L} value={L}>
                                    {L}
                                  </option>
                                ))}
                              </select>
                            )}
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
                <label className={labelClass}>
                  Mövcud cavab kartı şablonu
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
                      <Link className="font-medium text-emerald-800 underline" to="/designer">
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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                  onClick={() => genPdfMut.mutate()}
                  disabled={genPdfMut.isPending}
                >
                  {genPdfMut.isPending ? "Hazırlanır…" : "PDF yarat və endir"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                  onClick={() => draftPdfMut.mutate()}
                  disabled={draftPdfMut.isPending || genPdfMut.isPending}
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
              {genPdfMut.isError && <p className="text-sm text-red-600">Xəta — yenidən cəhd edin.</p>}
              {draftPdfMut.isError && <p className="text-sm text-red-600">Qaralama saxlanmadı.</p>}
              {finalizePdfMut.isError && <p className="text-sm text-red-600">Təsdiqləmə xətası.</p>}

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
                          disabled={finalizePdfMut.isPending}
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

function examOperationalReady(e: Exam): boolean {
  const ak = e.answer_key_rows ?? 0;
  return e.question_count > 0 && ak >= e.question_count;
}

function ExamListPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [courseFilter, setCourseFilter] = useState<number | "">("");
  const examsQuery = useQuery({
    queryKey: ["exams", courseFilter === "" ? "all" : courseFilter],
    queryFn: () => listExams(courseFilter === "" ? undefined : Number(courseFilter))
  });
  const coursesQuery = useQuery({ queryKey: ["courses"], queryFn: listCourses });

  const courseName = (id: number | null) => {
    if (id == null) return "Ümumi";
    const c = (coursesQuery.data ?? []).find((x) => x.id === id);
    return c?.name ?? `Kurs #${id}`;
  };

  if (user?.role === "student") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-slate-600">Bu səhifə şagirdlər üçün mövcud deyil.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">İmtahanlar</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Yeni imtahan yaradıldıqda avtomatik burada görünür. Planlı sual sayına uyğun cavab açarı saxlanandan sonra
            həmin imtahan üzrə skan və nəticələrə keçə bilərsiniz.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/exams/yarat")}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          Yeni imtahan yarat
        </button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Kurs üzrə süzgəc
          <select
            className={`${inputClass} mt-1 block w-full min-w-[220px] sm:w-auto`}
            value={courseFilter === "" ? "" : String(courseFilter)}
            onChange={(e) => setCourseFilter(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Hamısı</option>
            {(coursesQuery.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {examsQuery.isLoading && <p className="text-sm text-slate-500">Yüklənir…</p>}
      {examsQuery.isError && <p className="text-sm text-red-600">Siyahı yüklənmədi.</p>}

      {!examsQuery.isLoading && (examsQuery.data ?? []).length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
          <p className="text-slate-600">Hələ imtahan yoxdur.</p>
          <button
            type="button"
            onClick={() => navigate("/exams/yarat")}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            İlk imtahanı yaradın
          </button>
        </div>
      )}

      {(examsQuery.data ?? []).length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">№</th>
                <th className="px-4 py-3">Başlıq</th>
                <th className="px-4 py-3">Kurs</th>
                <th className="px-4 py-3">Hazırlıq</th>
                <th className="px-4 py-3 text-right">Əməllər</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(examsQuery.data ?? []).map((e) => {
                const ready = examOperationalReady(e);
                const qr = e.questions_registered ?? 0;
                const ak = e.answer_key_rows ?? 0;
                const sheets = e.confirmed_sheet_templates ?? 0;
                return (
                  <tr key={e.id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{e.id}</td>
                    <td className="max-w-[200px] px-4 py-3 text-slate-800 sm:max-w-md">
                      <span className="line-clamp-2">{e.title}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{courseName(e.course_id)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          ready
                            ? "inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900"
                            : "inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900"
                        }
                      >
                        {ready ? "Əməliyyata hazır" : "Qurulur"}
                      </span>
                      <p className="mt-1 text-[11px] leading-snug text-slate-500">
                        Cavab açarı: {ak}/{e.question_count} · DB sualı: {qr}
                        {ready && sheets === 0 ? " · kart şablonu təsdiqlənməyib" : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Link
                          to={`/exams/yarat?exam=${e.id}`}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                        >
                          Quruluş
                        </Link>
                        {ready ? (
                          <Link
                            to={`/scan?exam=${e.id}`}
                            className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            Skan
                          </Link>
                        ) : (
                          <span
                            className="cursor-not-allowed rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-400"
                            title="Cavab açarını tam saxlayın"
                          >
                            Skan
                          </span>
                        )}
                        {ready ? (
                          <Link
                            to={`/reports?exam=${e.id}`}
                            className="rounded-lg border border-violet-200 px-2 py-1 text-xs font-medium text-violet-900 hover:bg-violet-50"
                          >
                            Nəticə
                          </Link>
                        ) : (
                          <span
                            className="cursor-not-allowed rounded-lg border border-slate-100 px-2 py-1 text-xs text-slate-400"
                            title="Cavab açarını tam saxlayın"
                          >
                            Nəticə
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
