import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listScanResults } from "../../api/scans";
import { formatScoreBreakdownSummary } from "./scoreBreakdownDisplay";

type Props = {
  sessionId: number | null;
  sessionStatus?: string | null;
  selectedResultId: number | null;
  onSelectResult: (id: number | null) => void;
};

const statusLabel: Record<string, string> = {
  ok: "OK",
  manual_review: "Əl yoxlaması",
  error: "Xəta"
};

const statusClass: Record<string, string> = {
  ok: "text-emerald-700",
  manual_review: "text-amber-700",
  error: "text-red-700"
};

/** Q1=A Q2=B … qısa önizləmə */
function answersPreview(detected: Record<string, unknown> | null | undefined, limit = 12): string {
  if (!detected) return "—";
  const pairs: { n: number; v: string }[] = [];
  for (const [k, raw] of Object.entries(detected)) {
    if (k.startsWith("__")) continue;
    const m = /^q?(\d+)$/i.exec(k);
    if (!m) continue;
    const n = Number(m[1]);
    const v = raw == null ? "" : String(raw).trim().toUpperCase().slice(0, 1);
    if (!v || !/^[A-E]$/.test(v)) continue;
    if (!pairs.some((p) => p.n === n)) pairs.push({ n, v });
  }
  pairs.sort((a, b) => a.n - b.n);
  if (!pairs.length) return "oxunmayıb";
  const head = pairs.slice(0, limit).map((p) => `${p.n}${p.v}`).join(" ");
  return pairs.length > limit ? `${head}…` : head;
}

function cardMetaLine(card: Record<string, string> | null | undefined): string {
  if (!card) return "";
  const bits: string[] = [];
  if (card.school) bits.push(`Məktəb ${card.school}`);
  if (card.class) bits.push(`Sinif ${card.class}`);
  if (card.variant) bits.push(`Var ${card.variant}`);
  if (card.language) bits.push(`Dil ${card.language}`);
  if (card.group) bits.push(`Qrup ${card.group}`);
  if (card.section) bits.push(`Bölmə ${card.section}`);
  return bits.join(" · ");
}

export default function ResultsTable({ sessionId, sessionStatus, selectedResultId, onSelectResult }: Props) {
  const [onlyPendingReview, setOnlyPendingReview] = useState(false);

  const q = useQuery({
    queryKey: ["scan-results", sessionId],
    queryFn: () => listScanResults(sessionId!),
    enabled: sessionId != null,
    refetchInterval:
      sessionStatus === "pending" || sessionStatus === "processing" ? 3000 : false,
  });

  const rows = q.data ?? [];
  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === "manual_review" || r.status === "error").length,
    [rows]
  );

  const visibleRows = useMemo(
    () =>
      onlyPendingReview
        ? rows.filter((r) => r.status === "manual_review" || r.status === "error")
        : rows,
    [rows, onlyPendingReview]
  );

  if (sessionId == null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Nəticələr</h3>
        <p className="mt-1 text-sm text-slate-500">Oturum seçin.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Nəticələr</h3>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              Əl yoxlaması: {pendingCount}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={onlyPendingReview}
              onChange={(e) => setOnlyPendingReview(e.target.checked)}
            />
            Yalnız gözləyənlər
          </label>
          <button
            type="button"
            className="text-sm text-indigo-700 hover:underline"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
          >
            Yenilə
          </button>
        </div>
      </div>
      {q.isLoading && <p className="text-sm text-slate-600">Yüklənir…</p>}
      {q.isError && <p className="text-sm text-red-600">Nəticələr gətirilmədi.</p>}
      {!q.isLoading && !rows.length && <p className="text-sm text-slate-500">Hələ nəticə yoxdur.</p>}
      {!q.isLoading && rows.length > 0 && !visibleRows.length && (
        <p className="text-sm text-slate-500">Bu filtrə uyğun nəticə yoxdur.</p>
      )}
      {visibleRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">Şagird</th>
                <th className="py-2 pr-4">Cavablar</th>
                <th className="py-2 pr-4">Xal</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Xəta / qeyd</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const active = row.id === selectedResultId;
                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                      active ? "bg-indigo-50/80" : ""
                    }`}
                    onClick={() => onSelectResult(row.id)}
                  >
                    <td className="py-2 pr-4 font-medium">{row.id}</td>
                    <td
                      className="max-w-[200px] py-2 pr-4 text-xs text-slate-800"
                      title={[row.student_full_name, cardMetaLine(row.card_identity)].filter(Boolean).join(" · ")}
                    >
                      {row.student_number || row.card_student_number ? (
                        <>
                          <span className="font-mono font-semibold">
                            {row.student_number || row.card_student_number}
                          </span>
                          {!row.student_id && (row.student_number || row.card_student_number) ? (
                            <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-900">
                              kartdan
                            </span>
                          ) : null}
                          {row.student_full_name || row.card_full_name ? (
                            <span className="mt-0.5 block truncate text-slate-600">
                              {row.student_full_name || row.card_full_name}
                            </span>
                          ) : null}
                          {cardMetaLine(row.card_identity) ? (
                            <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                              {cardMetaLine(row.card_identity)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td
                      className="max-w-[220px] truncate py-2 pr-4 font-mono text-[11px] text-slate-700"
                      title={answersPreview(row.detected_answers, 40)}
                    >
                      {answersPreview(row.detected_answers)}
                    </td>
                    <td className="py-2 pr-4">
                      {row.score != null && row.max_score != null ? (
                        <>
                          <span>
                            {row.score} / {row.max_score}
                          </span>
                          {row.score_breakdown && typeof row.score_breakdown === "object" ? (
                            (() => {
                              const summary = formatScoreBreakdownSummary(
                                row.score_breakdown as Record<string, unknown>,
                              );
                              return summary ? (
                                <span
                                  className="mt-0.5 block truncate text-[10px] text-violet-700"
                                  title={summary}
                                >
                                  {summary}
                                </span>
                              ) : null;
                            })()
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`py-2 pr-4 font-medium ${statusClass[row.status] ?? "text-slate-700"}`}>
                      {statusLabel[row.status] ?? row.status}
                    </td>
                    <td className="max-w-[200px] truncate py-2 text-xs text-red-700" title={row.error_message ?? ""}>
                      {row.error_message ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
