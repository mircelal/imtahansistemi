import { api } from "./client";

export type AnswerSheetPresetOut = {
  id: number;
  course_id: number | null;
  name: string;
  description: string | null;
  template_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  exams_linked_count: number;
};

export async function listAnswerSheetPresets(params?: {
  course_id?: number;
  scope?: "global_only";
}) {
  const { data } = await api.get<AnswerSheetPresetOut[]>("/api/answer-sheet-presets/", {
    params: params ?? undefined
  });
  return data;
}

export async function getAnswerSheetPreset(id: number) {
  const { data } = await api.get<AnswerSheetPresetOut>(`/api/answer-sheet-presets/${id}`);
  return data;
}

export async function createAnswerSheetPreset(payload: {
  course_id?: number | null;
  name: string;
  description?: string | null;
  template_config: Record<string, unknown>;
  is_active?: boolean;
}) {
  const { data } = await api.post<AnswerSheetPresetOut>("/api/answer-sheet-presets/", payload);
  return data;
}

export async function updateAnswerSheetPreset(
  id: number,
  payload: Partial<{
    name: string;
    description: string | null;
    template_config: Record<string, unknown>;
    is_active: boolean;
  }>,
) {
  const { data } = await api.put<AnswerSheetPresetOut>(`/api/answer-sheet-presets/${id}`, payload);
  return data;
}

export async function deleteAnswerSheetPreset(id: number) {
  await api.delete(`/api/answer-sheet-presets/${id}`);
}

export async function duplicateAnswerSheetPreset(id: number, nameSuffix = "surəti") {
  const { data } = await api.post<AnswerSheetPresetOut>(`/api/answer-sheet-presets/${id}/duplicate`, {}, {
    params: { name_suffix: nameSuffix },
  });
  return data;
}
