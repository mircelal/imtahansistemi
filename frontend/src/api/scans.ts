import { api } from "./client";

export type ScanSession = {
  id: number;
  exam_id: number;
  exam_title: string | null;
  operator_id: number;
  operator_full_name: string | null;
  status: string;
  total_images: number;
  processed_images: number;
  created_at: string;
  finished_at: string | null;
};

export type ScanResult = {
  id: number;
  session_id: number;
  student_id: number | null;
  student_number?: string | null;
  student_full_name?: string | null;
  /** Kurs DB-də olmasa belə kartdan OMR kodu */
  card_student_number?: string | null;
  card_full_name?: string | null;
  card_identity?: Record<string, string> | null;
  image_path: string;
  detected_answers: Record<string, unknown>;
  score: number | null;
  max_score: number | null;
  score_breakdown?: Record<string, unknown> | null;
  status: string;
  error_message: string | null;
  processed_at: string;
  essay_crops?: Record<string, string> | null;
};

/** Backend `ScanReadingOut` — kanonik OMR oxunuşu. */
export type ScanReading = {
  version: string;
  scan_result_id: number;
  session_id: number;
  exam_id: number;
  exam_title: string | null;
  sheet_uuid: string | null;
  qr: Record<string, unknown>;
  scores: Record<string, unknown>;
  status: string;
  error_message: string | null;
  image_path: string;
  processed_at: string | null;
  field_labels: Record<string, string>;
  identity: Record<string, string>;
  identity_summary?: Record<string, string> | null;
  mcq: Record<string, string>;
  meta: Record<string, unknown>;
  raw_detected: Record<string, unknown>;
  template_hints: Record<string, unknown> | null;
  effective_answer_key?: Record<string, string> | null;
};

export async function listScanSessions(examId?: number) {
  const { data } = await api.get<ScanSession[]>("/api/scans/sessions", {
    params: examId != null ? { exam_id: examId } : undefined,
  });
  return data;
}

export async function getScanSession(sessionId: number) {
  const { data } = await api.get<ScanSession>(`/api/scans/sessions/${sessionId}`);
  return data;
}

export async function createScanSession(payload: { exam_id: number; operator_id: number }) {
  const { data } = await api.post<ScanSession>("/api/scans/sessions", payload);
  return data;
}

/** İmtahan üçün aktiv skan partiyasını tap və ya avtomatik yarat (manual oturum seçimi lazım deyil). */
export async function ensureScanSession(examId: number, forceNew = false) {
  const { data } = await api.post<ScanSession>("/api/scans/sessions/ensure", {
    exam_id: examId,
    force_new: forceNew,
  });
  return data;
}

export type ScanQrDetect = {
  qr_raw: string | null;
  sheet_uuid: string | null;
  exam_id: number | null;
  exam_title: string | null;
  source_file: string | null;
};

export type ScanQuickUpload = {
  session: ScanSession;
  uploaded: number;
  queued: boolean;
  qr: ScanQrDetect;
};

/** QR-dan imtahanı avtomatik tanıyıb skan partiyasını açır və faylları yükləyir. */
export async function quickUploadScanFiles(files: File[], autoProcess = true) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const { data } = await api.post<ScanQuickUpload>("/api/scans/quick-upload", form, {
    params: { auto_process: autoProcess },
  });
  return data;
}

export async function detectScanQr(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<ScanQrDetect>("/api/scans/detect-qr", form);
  return data;
}

export async function uploadScanFiles(sessionId: number, files: File[], autoProcess = true) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const { data } = await api.post<{ session_id: number; uploaded: number; queued: boolean }>(
    `/api/scans/sessions/${sessionId}/upload`,
    form,
    { params: { auto_process: autoProcess } }
  );
  return data;
}

export async function queueProcessSession(sessionId: number) {
  const { data } = await api.post<{ session_id: number; queued: boolean }>(
    `/api/scans/sessions/${sessionId}/process`
  );
  return data;
}

export async function listScanResults(sessionId: number) {
  const { data } = await api.get<ScanResult[]>(`/api/scans/sessions/${sessionId}/results`);
  return data;
}

export async function getScanResult(resultId: number) {
  const { data } = await api.get<ScanResult>(`/api/scans/results/${resultId}`);
  return data;
}

export async function getScanReading(resultId: number) {
  const { data } = await api.get<ScanReading>(`/api/scans/results/${resultId}/reading`);
  return data;
}

export async function downloadSessionReadingJson(sessionId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/api/scans/sessions/${sessionId}/results/export-reading.json`, {
    responseType: "blob"
  });
  return data;
}

export async function assignScanStudent(
  resultId: number,
  payload: { student_id?: number; student_number?: string },
) {
  const { data } = await api.put<ScanResult>(`/api/scans/results/${resultId}/assign-student`, payload);
  return data;
}

export async function saveScanCorrection(resultId: number, corrected_answers: Record<string, unknown>) {
  const { data } = await api.put<ScanResult>(`/api/scans/results/${resultId}/correct`, { corrected_answers });
  return data;
}

export async function downloadScanResultsCsv(sessionId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/api/scans/sessions/${sessionId}/results/export`, {
    responseType: "blob"
  });
  return data;
}

export type EssayGrade = {
  id: number;
  scan_result_id: number;
  question_number: number;
  awarded_points: number;
  max_points: number;
  notes: string | null;
  graded_by: number;
  graded_at: string;
};

export async function saveEssayGrade(
  resultId: number,
  payload: { question_number: number; awarded_points: number; notes?: string | null },
) {
  const { data } = await api.post<EssayGrade>(`/api/scans/results/${resultId}/essay-grade`, payload);
  return data;
}

export async function listEssayGrades(resultId: number) {
  const { data } = await api.get<EssayGrade[]>(`/api/scans/results/${resultId}/essay-grades`);
  return data;
}

export function essayCropUrl(resultId: number, questionNumber: number) {
  return `/api/scans/results/${resultId}/essay-crop/${questionNumber}`;
}
