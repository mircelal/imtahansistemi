import { api } from "./client";

export type GenerateAnswerSheetResponse = {
  pdf_path: string;
  sheet_uuid: string;
  download_url: string;
};

export type SheetListItem = {
  id: number;
  sheet_uuid: string | null;
  participant_label: string | null;
  participant_code: string | null;
  pdf_path: string | null;
  is_draft: boolean;
  created_at: string;
};

export async function generateAnswerSheet(
  examId: number,
  payload: {
    template_config?: Record<string, unknown>;
    layout_preset_id?: number;
  },
) {
  const { data } = await api.post<GenerateAnswerSheetResponse>("/api/answer-sheets/generate", {
    exam_id: examId,
    ...payload
  });
  return data;
}

export type AnswerSheetDraftSaved = { id: number; sheet_uuid: string; message?: string };

export async function saveAnswerSheetDraft(
  examId: number,
  payload: { template_config?: Record<string, unknown>; layout_preset_id?: number },
) {
  const { data } = await api.post<AnswerSheetDraftSaved>("/api/answer-sheets/draft", {
    exam_id: examId,
    ...payload
  });
  return data;
}

export async function finalizeAnswerSheetDraft(examId: number, templateId: number) {
  const { data } = await api.post<GenerateAnswerSheetResponse>(
    `/api/answer-sheets/exam/${examId}/templates/${templateId}/finalize`,
    {},
  );
  return data;
}

/** JWT ilə PDF yükləyir (window.open yox — token göndərilir). */
export async function downloadAnswerSheetPdf(examId: number, sheetUuid?: string | null) {
  const path = sheetUuid
    ? `/api/answer-sheets/exam/${examId}/download-by-sheet/${sheetUuid}`
    : `/api/answer-sheets/${examId}/download`;
  const res = await api.get(path, { responseType: "blob" });
  const blob = new Blob([res.data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sheetUuid ? `cavab-karti-${examId}-${sheetUuid.slice(0, 8)}.pdf` : `cavab-karti-${examId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function listExamSheetTemplates(examId: number) {
  const { data } = await api.get<SheetListItem[]>(`/api/answer-sheets/exam/${examId}/templates`);
  return data;
}

/** Serverdə PDF səhifəsini PNG kimi — canlı önizləmə. */
export async function previewAnswerSheetPng(
  examId: number,
  payload: { template_config?: Record<string, unknown>; layout_preset_id?: number },
  page_index = 0,
) {
  const res = await api.post(
    "/api/answer-sheets/preview",
    { exam_id: examId, page_index, ...payload },
    { responseType: "blob" },
  );
  return URL.createObjectURL(res.data);
}
