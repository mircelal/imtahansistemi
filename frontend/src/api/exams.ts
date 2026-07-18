import { api } from "./client";

export type Exam = {
  id: number;
  course_id: number | null;
  answer_sheet_preset_id?: number | null;
  answer_sheet_preset?: { id: number; name: string } | null;
  title: string;
  description: string | null;
  question_count: number;
  options_per_question: number;
  columns_count: number;
  negative_marking: boolean;
  negative_ratio: number;
  grading_config: Record<string, unknown>;
  grading_policy: Record<string, unknown>;
  exam_category?: string;
  scoring_profile_id?: number | null;
  scheduled_at: string | null;
  ends_at?: string | null;
  seat_quota: number | null;
  resale_enabled?: boolean;
  delivery_mode?: string;
  venue?: string | null;
  city?: string | null;
  created_at: string;
  is_active: boolean;
  lifecycle_status?: "draft" | "scheduled" | "live" | "ended" | string;
  is_locked?: boolean;
  effective_ends_at?: string | null;
  /** İmtahanlar siyahısı (GET /api/exams/) */
  questions_registered?: number;
  answer_key_rows?: number;
  confirmed_sheet_templates?: number;
  list_price_amount?: number;
  list_price_currency?: string;
};

export async function listExams(courseId?: number) {
  const { data } = await api.get<Exam[]>("/api/exams/", {
    params: courseId ? { course_id: courseId } : undefined
  });
  return data;
}

export type ExamTicketBundled = {
  title: string;
  description?: string;
  price_amount: number;
  currency?: string;
  quota?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
};

export type ExamIntegrations = {
  exam_id: number;
  course_id: number | null;
  exam_title: string;
  linked_tickets: Array<{
    id: number;
    course_id: number;
    exam_id: number | null;
    title: string;
    description: string | null;
    price_amount: number;
    currency: string;
    quota: number | null;
    starts_at: string | null;
    ends_at: string | null;
    is_active: boolean;
    created_at: string;
  }>;
  answer_sheet_templates_count: number;
  scan_sessions_total: number;
  scan_sessions_active: number;
};

export async function createExam(payload: {
  course_id?: number | null;
  title: string;
  description?: string;
  question_count: number;
  options_per_question: number;
  columns_count: number;
  negative_marking: boolean;
  negative_ratio: number;
  is_active: boolean;
    scheduled_at: string;
    ends_at: string;
    seat_quota?: number | null;
    resale_enabled?: boolean;
    delivery_mode?: string;
    venue?: string | null;
    city?: string | null;
    bundled_ticket?: ExamTicketBundled | null;
    answer_sheet_preset_id?: number | null;
    list_price_amount?: number;
    list_price_currency?: string;
    use_dim_preset?: boolean;
    exam_category?: string;
    scoring_profile_id?: number | null;
}) {
  const { data } = await api.post<Exam>("/api/exams/", payload);
  return data;
}

export async function applyDimExamPreset(examId: number, forceQuestionCount = false) {
  const { data } = await api.post<{
    message: string;
    options_per_question: number;
    negative_marking: boolean;
    question_count: number;
    questions_updated: number;
    answer_keys_updated: number;
    grading_policy: Record<string, unknown>;
  }>(`/api/exams/${examId}/apply-dim-preset`, null, {
    params: { force_question_count: forceQuestionCount },
  });
  return data;
}

export async function getExamIntegrations(examId: number) {
  const { data } = await api.get<ExamIntegrations>(`/api/exams/${examId}/integrations`);
  return data;
}

export async function deleteExam(examId: number) {
  await api.delete(`/api/exams/${examId}`);
}

export async function getExam(examId: number) {
  const { data } = await api.get<Exam>(`/api/exams/${examId}`);
  return data;
}

export type ExamReadinessStep = {
  id: string;
  label: string;
  complete: boolean;
  detail?: string | null;
};

export type ExamReadiness = {
  exam_id: number;
  ready_for_scan: boolean;
  ready_for_results: boolean;
  steps: ExamReadinessStep[];
  missing: string[];
  counts: {
    questions_registered: number;
    answer_key_rows: number;
    confirmed_sheet_templates: number;
    course_students: number;
    question_count: number;
  };
};

export async function getExamReadiness(examId: number) {
  const { data } = await api.get<ExamReadiness>(`/api/exams/${examId}/readiness`);
  return data;
}

export async function updateExam(
  examId: number,
  payload: Partial<{
    title: string;
    description: string;
    question_count: number;
    options_per_question: number;
    columns_count: number;
    negative_marking: boolean;
    negative_ratio: number;
    is_active: boolean;
    grading_config: Record<string, unknown>;
    grading_policy: Record<string, unknown>;
    scheduled_at: string | null;
    ends_at: string | null;
    seat_quota: number | null;
    resale_enabled: boolean;
    delivery_mode: string;
    venue: string | null;
    city: string | null;
    answer_sheet_preset_id: number | null;
    list_price_amount: number;
    list_price_currency: string;
  }>
) {
  const { data } = await api.put<Exam>(`/api/exams/${examId}`, payload);
  return data;
}

export type AnswerKeyRow = { question_number: number; correct_answer: string; points: number };

export async function getAnswerKey(examId: number) {
  const { data } = await api.get<AnswerKeyRow[]>(`/api/exams/${examId}/answer-key`);
  return data;
}

export async function saveAnswerKey(examId: number, rows: AnswerKeyRow[]) {
  await api.post(`/api/exams/${examId}/answer-key`, rows);
}

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadExamBookletCover(
  examId: number,
  params?: {
    subtitle?: string;
    line1?: string;
    line2?: string;
    institution?: string;
    exam_code?: string;
    variant?: string;
    duration_minutes?: number;
  },
) {
  const res = await api.get(`/api/exams/${examId}/documents/booklet-cover`, {
    params: params ?? {},
    responseType: "blob",
  });
  const v = params?.variant?.toUpperCase() ?? "A";
  downloadBlob(res.data, `imtahan-${examId}-v${v}-kitabc-qapaq.pdf`);
}

export async function downloadExamQuestionBooklet(
  examId: number,
  params?: {
    cover_subtitle?: string;
    cover_line1?: string;
    cover_line2?: string;
    cover_institution?: string;
    exam_code?: string;
    variant?: string;
    duration_minutes?: number;
  },
) {
  const res = await api.get(`/api/exams/${examId}/documents/question-booklet`, {
    params: params ?? {},
    responseType: "blob",
  });
  const v = params?.variant?.toUpperCase() ?? "A";
  downloadBlob(res.data, `imtahan-${examId}-v${v}-sual-kitabcasi.pdf`);
}

export async function downloadExamQuestionBookletDocx(
  examId: number,
  params?: {
    cover_subtitle?: string;
    cover_line1?: string;
    cover_line2?: string;
    cover_institution?: string;
    exam_code?: string;
    variant?: string;
    duration_minutes?: number;
  },
) {
  const res = await api.get(`/api/exams/${examId}/documents/question-booklet.docx`, {
    params: params ?? {},
    responseType: "blob",
  });
  const v = params?.variant?.toUpperCase() ?? "A";
  downloadBlob(res.data, `imtahan-${examId}-v${v}-sual-kitabcasi.docx`);
}

export type ExamBookletAudit = {
  booklet_config: Record<string, unknown>;
  dim_booklet_layout_mm_reference: Record<string, unknown>;
  print_checklist: string[];
  layout_warnings: string[];
  publishable: boolean;
};

export async function getExamBookletAudit(examId: number, variant = "A") {
  const { data } = await api.get<ExamBookletAudit>(`/api/exams/${examId}/booklet-audit`, {
    params: { variant },
    });
  return data;
}

export type ExamDashboard = {
  exam_id: number;
  title: string;
  course_id: number | null;
  course_name: string | null;
  question_count: number;
  scheduled_at: string | null;
  ends_at: string | null;
  effective_ends_at: string | null;
  lifecycle_status: string;
  is_locked: boolean;
  ops: {
    seat_quota: number | null;
    participation: number;
    attendance_rate: number | null;
    scan_rows: number;
    unresolved_sheets: number;
    manual_review: number;
    error_sheets: number;
    ok_sheets: number;
    scan_sessions_total: number;
    venue: string | null;
    city: string | null;
  };
  summary: {
    average: number;
    minimum: number;
    maximum: number;
    median_score?: number;
    average_percent: number | null;
    median_percent: number | null;
    pass_rate: number | null;
    pass_threshold_percent?: number;
    participation: number;
    unique_students: number;
    scan_rows: number;
    percent_histogram?: Array<{ from: number; to: number; count: number }>;
  };
  status_breakdown: Record<string, number>;
  results: Array<{
    rank: number | null;
    student_id: number;
    student_number: string | null;
    student_full_name: string | null;
    score: number | null;
    max_score: number | null;
    percent: number;
    status: string;
  }>;
  insights: Array<{ key: string; title: string; message: string; tone: string }>;
};

export async function getExamDashboard(examId: number) {
  const { data } = await api.get<ExamDashboard>(`/api/exams/${examId}/dashboard`);
  return data;
}
