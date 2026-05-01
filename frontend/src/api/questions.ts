import { api } from "./client";

export type Question = {
  id: number;
  exam_id: number;
  bank_question_id: number | null;
  subject_id: number | null;
  subject_name: string | null;
  subject_short_code: string | null;
  difficulty: string | null;
  order_index: number;
  qtype: "mcq" | "tf";
  stem: string;
  options: unknown;
  points: number;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export async function listQuestions(examId: number) {
  const { data } = await api.get<Question[]>(`/api/exams/${examId}/questions`);
  return data;
}

export async function createQuestion(
  examId: number,
  payload: {
    order_index: number;
    qtype: "mcq" | "tf";
    stem: string;
    points?: number;
    options?: unknown;
    subject_id?: number;
    difficulty?: "easy" | "medium" | "hard" | null;
  }
) {
  const { data } = await api.post<Question>(`/api/exams/${examId}/questions`, payload);
  return data;
}

export async function addQuestionFromBank(examId: number, payload: { bank_question_id: number; order_index: number }) {
  const { data } = await api.post<Question>(`/api/exams/${examId}/questions/from-bank`, payload);
  return data;
}

export async function deleteQuestion(examId: number, questionId: number) {
  await api.delete(`/api/exams/${examId}/questions/${questionId}`);
}

export async function importQuestionsCsv(examId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ imported: number; skipped: number }>(
    `/api/exams/${examId}/questions/import`,
    form
  );
  return data;
}
