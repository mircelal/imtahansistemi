import { api } from "./client";

export type ExamType = {
  id: number;
  slug: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_builtin: boolean;
  is_active: boolean;
  default_scoring_profile_id: number | null;
  created_at: string;
};

export async function listExamTypes(params?: { active_only?: boolean }) {
  const { data } = await api.get<ExamType[]>("/api/exam-types/", {
    params: { active_only: params?.active_only ?? true },
  });
  return data;
}

export async function getExamType(id: number) {
  const { data } = await api.get<ExamType>(`/api/exam-types/${id}`);
  return data;
}

export async function createExamType(payload: {
  slug: string;
  label: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
  default_scoring_profile_id?: number | null;
}) {
  const { data } = await api.post<ExamType>("/api/exam-types/", payload);
  return data;
}

export async function updateExamType(
  id: number,
  payload: {
    slug?: string;
    label?: string;
    description?: string | null;
    sort_order?: number;
    is_active?: boolean;
    default_scoring_profile_id?: number | null;
  },
) {
  const { data } = await api.put<ExamType>(`/api/exam-types/${id}`, payload);
  return data;
}

export async function deactivateExamType(id: number) {
  const { data } = await api.delete<{ message: string; id: number }>(`/api/exam-types/${id}`);
  return data;
}

/** Fallback labels when types API not yet loaded. */
export const EXAM_TYPE_LABELS_FALLBACK: Record<string, string> = {
  buraxilis: "Buraxılış",
  blok: "Blok",
  sinif: "Sinif",
  qebul: "Qəbul",
  custom: "Sərbəst",
};

export function examTypeLabelsMap(types: ExamType[] | undefined | null): Record<string, string> {
  const map = { ...EXAM_TYPE_LABELS_FALLBACK };
  for (const t of types ?? []) {
    map[t.slug] = t.label;
  }
  return map;
}
