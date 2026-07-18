import { api } from "./client";

export type ExamCategory = string;

export type SubjectFormulaParams = {
  closed_coeff?: number;
  open_coded_coeff?: number;
  open_written_coeff?: number;
  relative_max?: number;
  round_step?: number;
  guess_correction?: boolean;
  options_k?: number;
};

export type ScoringProfileSubject = {
  code: string;
  title: string;
  weight?: number;
  priority?: number;
  formula?: "raw_sum" | "weighted_linear" | string;
  formula_params?: SubjectFormulaParams;
  from_q?: number;
  to_q?: number;
};

export type ScoringProfileFormulaConfig = {
  version?: number;
  slug?: string;
  question_count?: number;
  options_per_question?: number;
  negative_marking?: boolean;
  max_total?: number;
  subjects?: ScoringProfileSubject[];
  [key: string]: unknown;
};

export type ExamScoringProfile = {
  id: number;
  name: string;
  category: ExamCategory | string;
  description: string | null;
  formula_config: ScoringProfileFormulaConfig;
  is_builtin: boolean;
  is_active: boolean;
  created_at: string;
  created_by_id: number | null;
};

/** @deprecated Prefer examTypeLabelsMap(listExamTypes()) — kept as offline fallback */
export const EXAM_CATEGORY_LABELS: Record<string, string> = {
  buraxilis: "Buraxılış",
  blok: "Blok",
  sinif: "Sinif",
  qebul: "Qəbul",
  custom: "Sərbəst",
};

export async function listExamScoringProfiles(params?: {
  category?: string;
  active_only?: boolean;
}) {
  const { data } = await api.get<ExamScoringProfile[]>("/api/exam-scoring-profiles/", {
    params: {
      category: params?.category,
      active_only: params?.active_only ?? true,
    },
  });
  return data;
}

export async function getExamScoringProfile(id: number) {
  const { data } = await api.get<ExamScoringProfile>(`/api/exam-scoring-profiles/${id}`);
  return data;
}

export async function createExamScoringProfile(payload: {
  name: string;
  category?: string;
  description?: string | null;
  formula_config?: ScoringProfileFormulaConfig;
  is_active?: boolean;
}) {
  const { data } = await api.post<ExamScoringProfile>("/api/exam-scoring-profiles/", payload);
  return data;
}

export async function updateExamScoringProfile(
  id: number,
  payload: {
    name?: string;
    category?: string;
    description?: string | null;
    formula_config?: ScoringProfileFormulaConfig;
    is_active?: boolean;
  },
) {
  const { data } = await api.put<ExamScoringProfile>(`/api/exam-scoring-profiles/${id}`, payload);
  return data;
}

export async function cloneExamScoringProfile(id: number) {
  const { data } = await api.post<ExamScoringProfile>(`/api/exam-scoring-profiles/${id}/clone`);
  return data;
}

export async function deleteExamScoringProfile(id: number) {
  const { data } = await api.delete<{ message: string; id: number }>(
    `/api/exam-scoring-profiles/${id}`,
  );
  return data;
}

export async function applyExamScoringProfile(
  examId: number,
  profileId: number,
  opts?: { replace_blocks?: boolean; update_exam_fields?: boolean },
) {
  const { data } = await api.post<{
    message: string;
    exam_id: number;
    scoring_profile_id: number;
    exam_category: string;
    grading_config: Record<string, unknown>;
    grading_policy: Record<string, unknown>;
    question_count: number;
    options_per_question: number;
    negative_marking: boolean;
  }>(`/api/exams/${examId}/apply-scoring-profile/${profileId}`, {
    replace_blocks: opts?.replace_blocks ?? true,
    update_exam_fields: opts?.update_exam_fields ?? true,
  });
  return data;
}
