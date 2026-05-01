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
  scheduled_at: string | null;
  seat_quota: number | null;
  created_at: string;
  is_active: boolean;
  /** İmtahanlar siyahısı (GET /api/exams/) */
  questions_registered?: number;
  answer_key_rows?: number;
  confirmed_sheet_templates?: number;
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
    scheduled_at?: string | null;
    seat_quota?: number | null;
    bundled_ticket?: ExamTicketBundled | null;
    answer_sheet_preset_id?: number | null;
}) {
  const { data } = await api.post<Exam>("/api/exams/", payload);
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
    seat_quota: number | null;
    answer_sheet_preset_id: number | null;
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
  params?: { subtitle?: string; line1?: string; line2?: string; institution?: string },
) {
  const res = await api.get(`/api/exams/${examId}/documents/booklet-cover`, {
    params: params ?? {},
    responseType: "blob",
  });
  downloadBlob(res.data, `imtahan-${examId}-kitabc-qapaq.pdf`);
}

export async function downloadExamQuestionBooklet(
  examId: number,
  params?: {
    cover_subtitle?: string;
    cover_line1?: string;
    cover_line2?: string;
    cover_institution?: string;
  },
) {
  const res = await api.get(`/api/exams/${examId}/documents/question-booklet`, {
    params: params ?? {},
    responseType: "blob",
  });
  downloadBlob(res.data, `imtahan-${examId}-sual-kitabcasi.pdf`);
}
