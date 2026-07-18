import { api } from "./client";

export type FormulaEngine = "raw_sum" | "weighted_linear" | string;

export type FormulaDefaultParams = {
  closed_coeff?: number;
  open_coded_coeff?: number;
  open_written_coeff?: number;
  relative_max?: number;
  round_step?: number;
  guess_correction?: boolean;
  options_k?: number;
  [key: string]: unknown;
};

export type ScoringFormulaPreset = {
  id: number;
  slug: string;
  label: string;
  description: string | null;
  engine: FormulaEngine;
  default_params: FormulaDefaultParams;
  sort_order: number;
  is_builtin: boolean;
  is_active: boolean;
  created_at: string;
  created_by_id: number | null;
};

export async function listScoringFormulaPresets(params?: { active_only?: boolean }) {
  const { data } = await api.get<ScoringFormulaPreset[]>("/api/scoring-formula-presets/", {
    params: { active_only: params?.active_only ?? true },
  });
  return data;
}

export async function createScoringFormulaPreset(payload: {
  slug: string;
  label: string;
  description?: string | null;
  engine?: string;
  default_params?: FormulaDefaultParams;
  sort_order?: number;
  is_active?: boolean;
}) {
  const { data } = await api.post<ScoringFormulaPreset>("/api/scoring-formula-presets/", payload);
  return data;
}

export async function updateScoringFormulaPreset(
  id: number,
  payload: {
    slug?: string;
    label?: string;
    description?: string | null;
    engine?: string;
    default_params?: FormulaDefaultParams;
    sort_order?: number;
    is_active?: boolean;
  },
) {
  const { data } = await api.put<ScoringFormulaPreset>(`/api/scoring-formula-presets/${id}`, payload);
  return data;
}

export async function deactivateScoringFormulaPreset(id: number) {
  const { data } = await api.delete<{ message: string; id: number }>(
    `/api/scoring-formula-presets/${id}`,
  );
  return data;
}
