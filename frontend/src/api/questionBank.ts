import { api } from "./client";

export type BankSubjectBrief = {
  id: number;
  name: string;
  short_code: string | null;
};

export type BankSubject = {
  id: number;
  name: string;
  short_code: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type BankQuestion = {
  id: number;
  subject_id: number | null;
  subject: BankSubjectBrief | null;
  difficulty: string;
  qtype: "mcq" | "tf";
  stem: string;
  options: unknown;
  points: number;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export async function listBankSubjects(activeOnly = false) {
  const { data } = await api.get<BankSubject[]>("/api/question-bank/subjects", {
    params: { active_only: activeOnly }
  });
  return data;
}

export async function createBankSubject(payload: {
  name: string;
  short_code?: string | null;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}) {
  const { data } = await api.post<BankSubject>("/api/question-bank/subjects", payload);
  return data;
}

export async function updateBankSubject(
  id: number,
  payload: Partial<{
    name: string;
    short_code: string | null;
    description: string | null;
    sort_order: number;
    is_active: boolean;
  }>
) {
  const { data } = await api.put<BankSubject>(`/api/question-bank/subjects/${id}`, payload);
  return data;
}

export async function deleteBankSubject(id: number) {
  await api.delete(`/api/question-bank/subjects/${id}`);
}

export async function listQuestionBank(params?: {
  subject_id?: number;
  difficulty?: string;
  qtype?: string;
  search?: string;
  limit?: number;
}) {
  const { data } = await api.get<BankQuestion[]>("/api/question-bank/", {
    params: { ...params, limit: params?.limit ?? 300 }
  });
  return data;
}

export async function createBankQuestion(payload: {
  subject_id?: number | null;
  difficulty?: string | null;
  qtype: "mcq" | "tf";
  stem: string;
  points?: number;
  options?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const { data } = await api.post<BankQuestion>("/api/question-bank/", payload);
  return data;
}

export async function updateBankQuestion(
  id: number,
  payload: Partial<{
    subject_id: number | null;
    difficulty: string | null;
    qtype: "mcq" | "tf";
    stem: string;
    points: number;
    options: unknown;
    metadata: Record<string, unknown>;
  }>
) {
  const { data } = await api.put<BankQuestion>(`/api/question-bank/${id}`, payload);
  return data;
}

export async function deleteBankQuestion(id: number) {
  await api.delete(`/api/question-bank/${id}`);
}
