import { isAxiosError } from "axios";

import { api } from "./client";

export type GenerateAnswerSheetResponse = {
  pdf_path: string;
  sheet_uuid: string;
  download_url: string;
  layout_warnings?: string[];
};

export type AnswerSheetAuditResponse = {
  paper: string;
  page_mm: number[];
  content_right_mm: number;
  safe_bottom_mm: number;
  layout_warnings: string[];
  print_checklist: string[];
  font_status?: Record<string, unknown>;
  /** Server L_BASE / timing mm snapshot — dizayner ilə uyğunluq */
  dim_layout_mm_reference?: Record<string, number>;
  two_page_required?: boolean;
  effective_single_page_layout?: boolean;
  publishable?: boolean;
  /** PDF generasiyası üçün merge+enrich+normalize sonrası konfiq */
  effective_template_config?: Record<string, unknown>;
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

/** 422 LAYOUT_NOT_PUBLISHABLE — istifadəçiyə göstəriləcək mətn */
export function getLayoutPublishErrorMessage(err: unknown): string | null {
  if (!isAxiosError(err) || err.response?.status !== 422) return null;
  const raw = err.response?.data as { detail?: unknown } | undefined;
  const detail = raw?.detail;
  if (!detail || typeof detail !== "object") return null;
  const o = detail as {
    code?: string;
    layout_warnings?: string[];
    message?: string;
  };
  const ws = Array.isArray(o.layout_warnings) ? o.layout_warnings.filter((x) => String(x).trim()) : [];
  if (o.code !== "LAYOUT_NOT_PUBLISHABLE" && ws.length === 0) return null;
  const lines: string[] = [];
  if (o.message) lines.push(o.message);
  for (const w of ws) {
    lines.push(`• ${String(w).trim()}`);
  }
  return lines.length ? lines.join("\n") : null;
}

export function getApiErrorMessage(err: unknown): string {
  const layout = getLayoutPublishErrorMessage(err);
  if (layout) return layout;
  if (isAxiosError(err)) {
    const d = err.response?.data as { detail?: unknown } | undefined;
    if (typeof d?.detail === "string") return d.detail;
    if (d?.detail != null && typeof d.detail === "object") {
      const o = d.detail as { message?: string; issues?: string[] };
      if (o.message) {
        const extra = Array.isArray(o.issues) ? `\n${o.issues.join("\n")}` : "";
        return o.message + extra;
      }
    }
    if (err.message) return err.message;
  }
  return err instanceof Error ? err.message : "Xəta baş verdi";
}

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
): Promise<{ url: string; publishable?: boolean; layoutWarnings?: string[] }> {
  const res = await api.post(
    "/api/answer-sheets/preview",
    { exam_id: examId, page_index, ...payload },
    { responseType: "blob" },
  );
  const pubHeader = res.headers["x-publishable"];
  const publishable = pubHeader === "true" ? true : pubHeader === "false" ? false : undefined;
  let layoutWarnings: string[] | undefined;
  const warnRaw = res.headers["x-layout-warnings"];
  if (typeof warnRaw === "string" && warnRaw) {
    try {
      layoutWarnings = JSON.parse(warnRaw) as string[];
    } catch {
      layoutWarnings = undefined;
    }
  }
  return {
    url: URL.createObjectURL(res.data as Blob),
    publishable,
    layoutWarnings,
  };
}

export async function auditAnswerSheetLayout(
  examId: number,
  payload: { template_config?: Record<string, unknown>; layout_preset_id?: number; page_index?: number },
) {
  const { data } = await api.post<AnswerSheetAuditResponse>("/api/answer-sheets/audit", {
    exam_id: examId,
    page_index: 0,
    ...payload,
  });
  return data;
}
