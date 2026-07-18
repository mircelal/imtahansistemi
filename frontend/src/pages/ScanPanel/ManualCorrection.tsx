import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { api } from "../../api/client";
import { getAnswerKey, getExam } from "../../api/exams";
import type { ScanResult } from "../../api/scans";
import { assignScanStudent, essayCropUrl, getScanReading, getScanResult, listEssayGrades, listScanResults, saveEssayGrade, saveScanCorrection } from "../../api/scans";
import { formatScoreBreakdownSummary } from "./scoreBreakdownDisplay";

function isNotFoundError(e: unknown): boolean {
  return axios.isAxiosError(e) && e.response?.status === 404;
}

type Props = {
  examId: number | null;
  courseId: number | null;
  sessionId: number | null;
  resultId: number | null;
  onSelectResult: (id: number | null) => void;
};

/** MCQ cavabları: yalnız Qn/qn açarları (şəxsiyyət id_* müstəqildir). */
function extractMcqAnswers(detected: Record<string, unknown>): Record<number, string> {
  const acc: Record<number, string> = {};
  for (const [k, v] of Object.entries(detected)) {
    if (k.startsWith("__")) continue;
    const m = /^q?(\d+)$/i.exec(k);
    if (!m) continue;
    const n = Number(m[1]);
    const raw = v == null ? "" : String(v).trim().toUpperCase();
    // MCQ tək hərf və ya grid_in çoxsimvollu
    acc[n] = raw;
  }
  return acc;
}

/** Skan yüklənmə sırası üzrə növbəti / əvvəlki gözləyən kart (minlərlə kart üçün axın). */
function findNextPendingId(rows: ScanResult[], currentId: number | null): number | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  const pendingIds = new Set(
    rows.filter((r) => r.status === "manual_review" || r.status === "error").map((r) => r.id)
  );
  if (!pendingIds.size) return null;
  if (currentId == null) return [...pendingIds].sort((a, b) => a - b)[0];
  const ix = sorted.findIndex((r) => r.id === currentId);
  const start = ix < 0 ? 0 : ix + 1;
  for (let i = start; i < sorted.length; i++) {
    if (pendingIds.has(sorted[i].id)) return sorted[i].id;
  }
  return null;
}

function findPrevPendingId(rows: ScanResult[], currentId: number | null): number | null {
  if (!rows.length || currentId == null) return null;
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  const pendingIds = new Set(
    rows.filter((r) => r.status === "manual_review" || r.status === "error").map((r) => r.id)
  );
  const ix = sorted.findIndex((r) => r.id === currentId);
  for (let i = ix - 1; i >= 0; i--) {
    if (pendingIds.has(sorted[i].id)) return sorted[i].id;
  }
  return null;
}

export default function ManualCorrection({ examId, courseId, sessionId, resultId, onSelectResult }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [omrSnapshot, setOmrSnapshot] = useState<Record<number, string>>({});
  const [zoomPct, setZoomPct] = useState(100);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [assignCode, setAssignCode] = useState("");
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resultQ = useQuery({
    queryKey: ["scan-result", resultId],
    queryFn: () => getScanResult(resultId!),
    enabled: resultId != null,
    retry: (count, err) => !isNotFoundError(err) && count < 2,
  });

  const readingQ = useQuery({
    queryKey: ["scan-reading", resultId],
    queryFn: () => getScanReading(resultId!),
    enabled: resultId != null,
    retry: (count, err) => !isNotFoundError(err) && count < 2,
  });

  const sessionResultsQ = useQuery({
    queryKey: ["scan-results", sessionId],
    queryFn: () => listScanResults(sessionId!),
    enabled: sessionId != null
  });

  /** Reprocess sonrası köhnə result id — seçimi təmizlə, siyahını yenilə. */
  useEffect(() => {
    if (resultId == null) return;
    if (!isNotFoundError(resultQ.error) && !isNotFoundError(readingQ.error)) return;
    onSelectResult(null);
    void queryClient.invalidateQueries({ queryKey: ["scan-results", sessionId] });
    void queryClient.removeQueries({ queryKey: ["scan-result", resultId] });
    void queryClient.removeQueries({ queryKey: ["scan-reading", resultId] });
  }, [resultId, resultQ.error, readingQ.error, onSelectResult, queryClient, sessionId]);

  const examQ = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => getExam(examId!),
    enabled: examId != null && resultId != null
  });

  const keyQ = useQuery({
    queryKey: ["answer-key", examId],
    queryFn: () => getAnswerKey(examId!),
    enabled: examId != null && resultId != null
  });

  const snapshotKey = resultQ.data
    ? JSON.stringify(resultQ.data.detected_answers ?? {})
    : "";

  useEffect(() => {
    if (!resultQ.data) return;
    const det = (resultQ.data.detected_answers ?? {}) as Record<string, unknown>;
    const m = extractMcqAnswers(det);
    setOmrSnapshot({ ...m });
    setDraft({ ...m });
    setMsg(null);
    setErr(null);
  }, [resultQ.data?.id, snapshotKey]);

  useEffect(() => {
    if (resultId == null) {
      setImgUrl(null);
      setImgErr(null);
      return;
    }
    let cancelled = false;
    setImgErr(null);
    setImgUrl(null);
    (async () => {
      try {
        const { data } = await api.get<Blob>(`/api/scans/results/${resultId}/image`, { responseType: "blob" });
        if (cancelled) return;
        const url = URL.createObjectURL(data);
        setImgUrl(url);
      } catch (e) {
        if (cancelled) return;
        if (isNotFoundError(e)) {
          setImgErr("Nəticə artıq yoxdur (yenidən emal olunub). Siyahıdan yeni nəticə seçin.");
          onSelectResult(null);
          void queryClient.invalidateQueries({ queryKey: ["scan-results", sessionId] });
        } else {
          setImgErr("Şəkil yüklənmədi (ZIP və ya fayl yolu). Kartın PDF çıxışından təkrar skan edin.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resultId, onSelectResult, queryClient, sessionId]);

  useEffect(() => {
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [imgUrl]);

  const questionNumbers = useMemo(() => {
    const fromKey = (keyQ.data ?? []).map((k) => k.question_number);
    if (fromKey.length) return [...new Set(fromKey)].sort((a, b) => a - b);
    const fromDet = Object.keys(draft)
      .map(Number)
      .filter(Number.isFinite);
    return [...new Set(fromDet)].sort((a, b) => a - b);
  }, [keyQ.data, draft]);

  const keyByQ = useMemo(() => {
    const eff = readingQ.data?.effective_answer_key;
    if (eff && Object.keys(eff).length > 0) {
      const entries: [number, string][] = [];
      for (const [qn, ca] of Object.entries(eff)) {
        const n = Number(qn);
        if (Number.isFinite(n)) entries.push([n, ca]);
      }
      return new Map(entries);
    }
    return new Map((keyQ.data ?? []).map((k) => [k.question_number, k.correct_answer] as [number, string]));
  }, [readingQ.data?.effective_answer_key, keyQ.data]);

  const optCount = Math.min(5, Math.max(2, examQ.data?.options_per_question ?? 5));
  const optionLetters = useMemo(() => Array.from({ length: optCount }, (_, i) => String.fromCharCode(65 + i)), [optCount]);

  const pendingRows = useMemo(
    () =>
      (sessionResultsQ.data ?? []).filter((r) => r.status === "manual_review" || r.status === "error"),
    [sessionResultsQ.data]
  );

  const nextPendingId = useMemo(
    () => findNextPendingId(sessionResultsQ.data ?? [], resultId),
    [sessionResultsQ.data, resultId]
  );
  const prevPendingId = useMemo(
    () => findPrevPendingId(sessionResultsQ.data ?? [], resultId),
    [sessionResultsQ.data, resultId]
  );

  const confirmLeave = () => !dirty || window.confirm("Saxlanmamış dəyişikliklər var. Keçid etmək istəyirsiniz?");

  const dirty = useMemo(() => {
    for (const n of questionNumbers) {
      const a = (draft[n] ?? "").trim();
      const b = (omrSnapshot[n] ?? "").trim();
      if (a !== b) return true;
    }
    return false;
  }, [draft, omrSnapshot, questionNumbers]);

  const save = useCallback(async () => {
    if (resultId == null) return;
    setErr(null);
    setMsg(null);
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const n of questionNumbers) {
        const v = (draft[n] ?? "").trim().toUpperCase();
        payload[`Q${n}`] = /^[A-E]$/.test(v) ? v : "";
      }
      const updated = await saveScanCorrection(resultId, payload);
      queryClient.setQueryData(["scan-result", resultId], updated);
      await queryClient.invalidateQueries({ queryKey: ["scan-results", sessionId] });
      await queryClient.invalidateQueries({ queryKey: ["scan-reading", resultId] });
      setMsg("Yekun cavablar saxlanıldı; bal yenidən hesablandı.");
    } catch {
      setErr("Saxlanılmadı — şəbəkə və ya icazəni yoxlayın.");
    } finally {
      setSaving(false);
    }
  }, [draft, questionNumbers, queryClient, resultId, sessionId]);

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (resultId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "s") return;
      e.preventDefault();
      void saveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resultId]);

  const resetDraft = () => {
    setDraft({ ...omrSnapshot });
    setMsg(null);
    setErr(null);
  };

  if (resultId == null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Əl ilə yoxlama (DİM standartı)</h3>
        <p className="mt-1 text-sm text-slate-500">Skan nəticəsi seçildikdən sonra kart şəkli və cavab cədvəli burada açılır.</p>
      </div>
    );
  }

  const r = resultQ.data;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Əl ilə yoxlama · kart №{resultId}</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Elektron skan üzərindən OMR oxunuşunu təsdiqləyin və ya düzəldin. Yekun cavablar rəsmi qiymətləndirmə üçün əsas götürülür.
            </p>
            {r ? (
              <div className="mt-2 space-y-1 text-sm text-slate-800">
                <p>
                  <span className="font-semibold text-slate-900">Şagird: </span>
                  {r.student_number || r.card_student_number ? (
                    <>
                      <span className="font-mono font-semibold">
                        {r.student_number || r.card_student_number}
                      </span>
                      {r.student_full_name || r.card_full_name ? (
                        <span className="text-slate-700">
                          {" "}
                          · {r.student_full_name || r.card_full_name}
                        </span>
                      ) : null}
                      {!r.student_id ? (
                        <span className="ml-2 text-xs font-medium text-amber-800">
                          (kursda qeydiyyat yoxdur — kartdan oxunub)
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-amber-800">təyin olunmayıb — aşağıda kod daxil edin</span>
                  )}
                </p>
                {r.card_identity && Object.keys(r.card_identity).length > 0 ? (
                  <p className="text-xs text-slate-600">
                    {[
                      r.card_identity.school ? `Məktəb ${r.card_identity.school}` : null,
                      r.card_identity.class ? `Sinif ${r.card_identity.class}` : null,
                      r.card_identity.variant ? `Variant ${r.card_identity.variant}` : null,
                      r.card_identity.language ? `Dil ${r.card_identity.language}` : null,
                      r.card_identity.group ? `Qrup ${r.card_identity.group}` : null,
                      r.card_identity.section ? `Bölmə ${r.card_identity.section}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {r && (
              <>
                <span className="rounded-md bg-white px-2.5 py-1 font-medium tabular-nums text-slate-800 shadow-sm ring-1 ring-slate-200">
                  Bal: {r.score != null ? r.score.toFixed(2) : "—"} / {r.max_score != null ? r.max_score.toFixed(2) : "—"}
                </span>
                {r.score_breakdown && typeof r.score_breakdown === "object" ? (
                  (() => {
                    const summary = formatScoreBreakdownSummary(
                      r.score_breakdown as Record<string, unknown>,
                      examQ.data?.negative_marking,
                    );
                    return summary ? (
                      <span className="rounded-md bg-violet-50 px-2 py-1 text-[11px] text-violet-900" title={summary}>
                        {summary}
                      </span>
                    ) : null;
                  })()
                ) : null}
                <span
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                    r.status === "ok"
                      ? "bg-emerald-100 text-emerald-900"
                      : r.status === "manual_review"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-red-100 text-red-900"
                  }`}
                >
                  {r.status === "ok"
                    ? "Təsdiqlənib"
                    : r.status === "manual_review"
                      ? "Əl yoxlaması"
                      : r.status === "error"
                        ? "Xəta"
                        : r.status}
                </span>
              </>
            )}
            {sessionId != null && (
              <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-900">
                Gözləyən kart: {pendingRows.length}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(280px,1fr)_minmax(360px,520px)]">
        {/* Sol: elektron skan */}
        <div className="border-b border-slate-200 p-4 sm:p-5 xl:border-b-0 xl:border-r">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Elektron surət (skan)</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                onClick={() => setZoomPct((z) => Math.max(40, z - 15))}
              >
                −
              </button>
              <span className="min-w-[3rem] text-center text-xs tabular-nums text-slate-600">{zoomPct}%</span>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                onClick={() => setZoomPct((z) => Math.min(200, z + 15))}
              >
                +
              </button>
              <button
                type="button"
                className="ml-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                onClick={() => setZoomPct(100)}
              >
                100%
              </button>
            </div>
          </div>
          <div className="max-h-[min(78vh,820px)] overflow-auto rounded-lg border border-slate-300 bg-[#f4f4f5] shadow-inner">
            {imgUrl && (
              <img
                src={imgUrl}
                alt="Skan olunmuş cavab kartı"
                className="block h-auto min-w-full"
                style={{ width: `${zoomPct}%` }}
              />
            )}
            {!imgUrl && !imgErr && resultQ.isLoading && (
              <div className="flex h-48 items-center justify-center text-sm text-slate-500">Şəkil yüklənir…</div>
            )}
            {imgErr && (
              <div className="p-4 text-sm text-amber-900">{imgErr}</div>
            )}
          </div>
          {r?.error_message ? (
            <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-800">{r.error_message}</p>
          ) : null}
          <p className="mt-2 break-all text-[11px] text-slate-400">{r?.image_path}</p>
          {r?.essay_crops && Object.keys(r.essay_crops).length > 0 && (
            <div className="mt-4 space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900">Essay qiymətləndirmə</p>
              {Object.keys(r.essay_crops)
                .sort((a, b) => Number(a) - Number(b))
                .map((qn) => (
                  <EssayGradeRow key={qn} resultId={r.id} questionNumber={Number(qn)} maxHint={Number((r.score_breakdown as any)?.by_question?.[qn]?.max ?? 1)} />
                ))}
            </div>
          )}
        </div>

        {/* Sağ: DİM tipli cədvəl */}
        <div className="flex flex-col p-4 sm:p-5">
          {courseId != null && resultId != null && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold text-amber-950">
                {r?.student_id == null ? "Şagird kodunu təyin et" : "Şagird kodunu dəyişdir"}
              </p>
              <p className="mt-1 text-[11px] text-amber-900/90">6 rəqəmli kurs kodunu daxil edin.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  className="w-32 rounded border border-amber-300 px-2 py-1.5 font-mono text-sm"
                  placeholder="123456"
                  maxLength={6}
                  value={assignCode}
                  onChange={(e) => setAssignCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <button
                  type="button"
                  className="rounded-md bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-900"
                  onClick={async () => {
                    if (assignCode.length !== 6) {
                      setAssignMsg("6 rəqəm daxil edin");
                      return;
                    }
                    try {
                      const updated = await assignScanStudent(resultId, { student_number: assignCode });
                      queryClient.setQueryData(["scan-result", resultId], updated);
                      await queryClient.invalidateQueries({ queryKey: ["scan-results", sessionId] });
                      setAssignMsg("Şagird təyin olundu.");
                      setAssignCode("");
                    } catch {
                      setAssignMsg("Kod tapılmadı və ya icazə yoxdur.");
                    }
                  }}
                >
                  Təyin et
                </button>
              </div>
              {assignMsg ? <p className="mt-2 text-xs text-amber-900">{assignMsg}</p> : null}
            </div>
          )}

          {readingQ.data && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Kanonik oxunuş (şablon xəritəsi)</p>
              <dl className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Sheet UUID</dt>
                  <dd className="font-mono break-all">{readingQ.data.sheet_uuid ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">QR</dt>
                  <dd className="break-all">
                    {(readingQ.data.qr?.qr_raw as string | undefined) ?? "—"}
                    {readingQ.data.qr?.ticket != null && (
                      <span className="ml-1 text-indigo-800">· bilet: {String(readingQ.data.qr.ticket)}</span>
                    )}
                  </dd>
                </div>
              </dl>
              {readingQ.data.template_hints && Object.keys(readingQ.data.template_hints).length > 0 && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Şablon:{" "}
                  {Object.entries(readingQ.data.template_hints)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(", ")}
                </p>
              )}
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-700">Şəxsiyyət (kartdan)</p>
                {readingQ.data.identity_summary && Object.keys(readingQ.data.identity_summary).length > 0 ? (
                  <dl className="mt-1 grid gap-1 rounded border border-slate-200 bg-white px-2 py-2 text-xs sm:grid-cols-2">
                    {(
                      [
                        ["student_code", "İş №"],
                        ["full_name", "Ad Soyad Ata"],
                        ["first_name", "Ad"],
                        ["last_name", "Soyad"],
                        ["father_name", "Ata adı"],
                        ["school", "Məktəb"],
                        ["class", "Sinif"],
                        ["variant", "Variant"],
                        ["language", "Dil"],
                        ["group", "Qrup"],
                        ["section", "Bölmə"],
                      ] as const
                    )
                      .filter(([k]) => readingQ.data.identity_summary?.[k])
                      .map(([k, label]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="text-slate-500">{label}</dt>
                          <dd className="font-mono font-semibold text-slate-900">
                            {readingQ.data.identity_summary?.[k]}
                          </dd>
                        </div>
                      ))}
                  </dl>
                ) : Object.keys(readingQ.data.identity).length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Bu kartda kodlanmış şəxsiyyət sütunu yoxdur.</p>
                ) : null}
                {Object.keys(readingQ.data.identity).length > 0 ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-slate-500">Xam id_* sahələri</summary>
                    <div className="mt-1 max-h-40 overflow-auto rounded border border-slate-200 bg-white">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-100 text-slate-700">
                            <th className="px-2 py-1">Sahə</th>
                            <th className="px-2 py-1">OMR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(readingQ.data.identity)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([key, val]) => (
                              <tr key={key} className="border-b border-slate-100">
                                <td className="px-2 py-1 text-slate-600">
                                  <span className="font-medium text-slate-800">
                                    {readingQ.data.field_labels[key] ?? key}
                                  </span>
                                  <code className="ml-1 text-[10px] text-slate-400">{key}</code>
                                </td>
                                <td className="px-2 py-1 font-mono text-slate-900">{val || "—"}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
          )}
          {readingQ.isError && (
            <p className="mb-3 text-xs text-amber-800">Kanonik oxunuş API yüklənmədi — yalnız xam nəticə mövcuddur.</p>
          )}

          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Yekun cavablar (MCQ)</p>
          <p className="mt-1 text-xs text-slate-500">
            Sütunlar: avtomatik oxunuş · təsdiq/düzəliş · cavab açarı · müqayisə. Variantlar {optionLetters.join("–")}.
          </p>

          {resultQ.isLoading && <p className="mt-4 text-sm text-slate-500">Nəticə yüklənir…</p>}
          {resultQ.isError && <p className="mt-4 text-sm text-red-600">Nəticə oxuna bilmədi.</p>}

          {questionNumbers.length > 0 && (
            <div className="mt-3 flex max-h-[min(70vh,720px)] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
              <div className="overflow-auto">
                <table className="w-full min-w-[340px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-slate-300 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-800">
                      <th className="whitespace-nowrap border-r border-slate-200 px-2 py-2">№</th>
                      <th className="border-r border-slate-200 px-2 py-2">OMR</th>
                      <th className="border-r border-slate-200 px-2 py-2">Yekun</th>
                      <th className="border-r border-slate-200 px-2 py-2">Açar</th>
                      <th className="px-2 py-2">Nəticə</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionNumbers.map((n) => {
                      const omrV = omrSnapshot[n] ?? "";
                      const fin = draft[n] ?? "";
                      const keyA = keyByQ.get(n);
                      const keyStr = keyA != null ? String(keyA).trim().toUpperCase() : "";
                      let verdict: "ok" | "wrong" | "blank" | "na" = "na";
                      if (keyStr) {
                        if (!fin) verdict = "blank";
                        else if (fin.toUpperCase() === keyStr) verdict = "ok";
                        else verdict = "wrong";
                      }
                      const changed = omrV !== fin;
                      const isGridLike = (fin && fin.length > 1) || (keyStr && keyStr.length > 1) || (omrV && omrV.length > 1);
                      return (
                        <tr
                          key={n}
                          className={`border-b border-slate-200 ${changed ? "bg-amber-50/50" : n % 2 === 1 ? "bg-slate-50/60" : ""}`}
                        >
                          <td className="border-r border-slate-200 px-2 py-1.5 font-mono text-xs font-semibold text-slate-900">
                            {n}
                          </td>
                          <td className="border-r border-slate-200 px-2 py-1.5 font-mono text-slate-700">{omrV || "—"}</td>
                          <td className="border-r border-slate-200 px-1 py-1">
                            {isGridLike ? (
                              <input
                                className="w-24 rounded border border-slate-300 px-1 py-1 font-mono text-xs"
                                value={fin}
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, [n]: e.target.value.toUpperCase() }))
                                }
                              />
                            ) : (
                            <div className="flex flex-wrap gap-0.5">
                              {optionLetters.map((L) => (
                                <button
                                  key={L}
                                  type="button"
                                  className={`min-h-[1.75rem] min-w-[1.75rem] rounded border text-xs font-bold transition ${
                                    fin === L
                                      ? "border-indigo-700 bg-indigo-600 text-white shadow-sm"
                                      : "border-slate-300 bg-white text-slate-800 hover:border-indigo-400"
                                  }`}
                                  onClick={() => setDraft((d) => ({ ...d, [n]: L }))}
                                >
                                  {L}
                                </button>
                              ))}
                              <button
                                type="button"
                                className={`rounded border px-2 py-1 text-[10px] font-semibold uppercase ${
                                  !fin ? "border-slate-700 bg-slate-700 text-white" : "border-slate-300 bg-white text-slate-600"
                                }`}
                                onClick={() => setDraft((d) => ({ ...d, [n]: "" }))}
                              >
                                Boş
                              </button>
                            </div>
                            )}
                          </td>
                          <td className="border-r border-slate-200 px-2 py-1.5 font-mono text-slate-600">{keyStr || "—"}</td>
                          <td className="px-2 py-1.5">
                            {verdict === "na" && <span className="text-slate-400">—</span>}
                            {verdict === "ok" && <span className="font-semibold text-emerald-700">Düzgün</span>}
                            {verdict === "wrong" && <span className="font-semibold text-red-700">Səhv</span>}
                            {verdict === "blank" && <span className="font-medium text-slate-500">Boş</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={saving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
              onClick={() => save()}
            >
              {saving ? "Saxlanır…" : "Yekunu saxla / təsdiqlə"}
            </button>
            <span className="text-[11px] text-slate-400">Ctrl+S</span>
            <button
              type="button"
              disabled={!dirty || saving}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-40"
              onClick={resetDraft}
            >
              OMR-a qaytar
            </button>
            {sessionId != null && (
              <>
                <button
                  type="button"
                  disabled={prevPendingId == null}
                  className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 hover:bg-indigo-100 disabled:opacity-40"
                  onClick={() => prevPendingId != null && confirmLeave() && onSelectResult(prevPendingId)}
                >
                  ← Əvvəlki gözləyən
                </button>
                <button
                  type="button"
                  disabled={nextPendingId == null}
                  className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 hover:bg-indigo-100 disabled:opacity-40"
                  onClick={() => nextPendingId != null && confirmLeave() && onSelectResult(nextPendingId)}
                >
                  Növbəti gözləyən →
                </button>
              </>
            )}
          </div>
          {dirty && <p className="mt-2 text-xs text-amber-800">Dəyişikliklər saxlanmayıb.</p>}
          {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
      </div>
    </div>
  );
}


function EssayGradeRow({
  resultId,
  questionNumber,
  maxHint,
}: {
  resultId: number;
  questionNumber: number;
  maxHint: number;
}) {
  const qc = useQueryClient();
  const [pts, setPts] = useState(0);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const gradesQ = useQuery({
    queryKey: ["essay-grades", resultId],
    queryFn: () => listEssayGrades(resultId),
  });
  useEffect(() => {
    const g = (gradesQ.data ?? []).find((x) => x.question_number === questionNumber);
    if (g) {
      setPts(g.awarded_points);
      setNotes(g.notes ?? "");
    }
  }, [gradesQ.data, questionNumber]);
  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<Blob>(essayCropUrl(resultId, questionNumber), {
          responseType: "blob",
        });
        if (cancelled) return;
        const url = URL.createObjectURL(data);
        revoked = url;
        setCropUrl(url);
      } catch {
        if (!cancelled) setCropUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [resultId, questionNumber]);
  return (
    <div className="rounded border border-indigo-100 bg-white p-2">
      <p className="text-xs font-medium text-slate-800">Sual {questionNumber}</p>
      {cropUrl ? (
        <img src={cropUrl} alt={`Essay ${questionNumber}`} className="mt-1 max-h-40 w-full rounded border object-contain" />
      ) : (
        <p className="mt-1 text-[11px] text-slate-500">Crop yüklənir…</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          step="0.5"
          min={0}
          max={maxHint || 10}
          className="w-20 rounded border px-2 py-1 text-sm"
          value={pts}
          onChange={(e) => setPts(Number(e.target.value))}
        />
        <span className="text-xs text-slate-500">/ {maxHint || "?"}</span>
        <input
          className="min-w-[8rem] flex-1 rounded border px-2 py-1 text-xs"
          placeholder="Qeyd"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          type="button"
          className="rounded bg-indigo-700 px-2 py-1 text-xs font-medium text-white"
          onClick={async () => {
            try {
              await saveEssayGrade(resultId, {
                question_number: questionNumber,
                awarded_points: pts,
                notes: notes || null,
              });
              setMsg("Saxlanıldı");
              await qc.invalidateQueries({ queryKey: ["essay-grades", resultId] });
              await qc.invalidateQueries({ queryKey: ["scan-result", resultId] });
            } catch {
              setMsg("Xəta");
            }
          }}
        >
          Saxla
        </button>
      </div>
      {msg && <p className="mt-1 text-[11px] text-indigo-800">{msg}</p>}
    </div>
  );
}
