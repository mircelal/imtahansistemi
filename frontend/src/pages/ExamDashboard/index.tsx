import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getExamDashboard } from "../../api/exams";
import PageHeader from "../../components/ui/PageHeader";
import { formatDateTime } from "../../utils/dateFormat";

function statusAz(s: string) {
  switch (s) {
    case "scheduled":
      return "Planlaşdırılıb";
    case "live":
      return "Keçirilir";
    case "ended":
      return "Bitib";
    case "draft":
      return "Tarix yoxdur";
    default:
      return s;
  }
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function ExamDashboardPage() {
  const { examId: raw } = useParams();
  const examId = Number(raw);
  const q = useQuery({
    queryKey: ["exam-dashboard", examId],
    queryFn: () => getExamDashboard(examId),
    enabled: Number.isFinite(examId) && examId > 0,
    refetchInterval: 15000,
  });

  if (!Number.isFinite(examId) || examId <= 0) {
    return <p className="p-6 text-sm text-red-600">İmtahan tapılmadı.</p>;
  }

  const d = q.data;
  const hist =
    d?.summary.percent_histogram?.map((b, i) => ({
      name: `${b.from.toFixed(0)}%`,
      count: b.count,
      key: i,
    })) ?? [];

  return (
    <div className="page-container-wide space-y-5">
      <PageHeader
        title={d?.title ?? `İmtahan #${examId}`}
        subtitle="İştirak, nəticələr və yoxlama vəziyyəti — rəsmi imtahan paneli"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/exams/yarat?exam=${examId}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Quruluş
            </Link>
            <Link
              to={`/scan?exam=${examId}`}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100"
            >
              Skan
            </Link>
            <Link
              to={`/reports?exam=${examId}`}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Ətraflı hesabat
            </Link>
          </div>
        }
      />

      {q.isLoading && (
        <div className="animate-pulse space-y-3">
          <div className="h-24 rounded-2xl bg-slate-100" />
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      )}

      {q.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Dashboard yüklənmədi. İcazə və ya şəbəkəni yoxlayın.
        </div>
      )}

      {d && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-5 py-5 text-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-300">
                  {d.course_name ?? "Ümumi imtahan"} · №{d.exam_id}
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">{d.title}</h2>
                <p className="mt-2 text-sm text-slate-300">
                  {d.scheduled_at ? formatDateTime(d.scheduled_at) : "—"}
                  {" → "}
                  {d.effective_ends_at ? formatDateTime(d.effective_ends_at) : "—"}
                  {d.ops.city || d.ops.venue
                    ? ` · ${[d.ops.city, d.ops.venue].filter(Boolean).join(", ")}`
                    : ""}
                  {` · ${d.question_count} sual`}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold ring-1 ring-white/20">
                {statusAz(d.lifecycle_status)}
                {d.is_locked ? " · redaktə bağlı" : ""}
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="İştirakçı"
              value={String(d.ops.participation)}
              hint={
                d.ops.seat_quota != null
                  ? `Kvota: ${d.ops.seat_quota}${d.ops.attendance_rate != null ? ` · ${d.ops.attendance_rate}%` : ""}`
                  : `${d.ops.scan_rows} skan sətiri`
              }
            />
            <Kpi
              label="Orta nəticə"
              value={d.summary.average_percent != null ? `${d.summary.average_percent.toFixed(1)}%` : "—"}
              hint={
                d.summary.pass_rate != null
                  ? `Keçid: ${d.summary.pass_rate}% (≥${d.summary.pass_threshold_percent ?? 50}%)`
                  : undefined
              }
            />
            <Kpi
              label="Median"
              value={d.summary.median_percent != null ? `${d.summary.median_percent.toFixed(1)}%` : "—"}
              hint={
                d.summary.minimum != null && d.summary.maximum != null
                  ? `Bal: ${d.summary.minimum}–${d.summary.maximum}`
                  : undefined
              }
            />
            <Kpi
              label="Yoxlama"
              value={String(d.ops.manual_review)}
              hint={`OK ${d.ops.ok_sheets} · xəta ${d.ops.error_sheets} · şagirtsiz ${d.ops.unresolved_sheets}`}
            />
          </div>

          {d.insights.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {d.insights.map((ins) => (
                <div
                  key={ins.key}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    ins.tone === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-950"
                      : ins.tone === "positive"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                        : "border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <p className="font-semibold">{ins.title}</p>
                  <p className="mt-0.5 text-[13px] opacity-90">{ins.message}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <h3 className="text-sm font-semibold text-slate-900">Faiz paylanması</h3>
              <div className="mt-3 h-56">
                {hist.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hist}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0f172a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="flex h-full items-center justify-center text-sm text-slate-500">Hələ nəticə yoxdur.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">İştirakçı nəticələri</h3>
                <p className="text-xs text-slate-500">{d.results.length} şagird</p>
              </div>
              {d.results.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Skan olunmuş və şagirdə bağlanmış nəticə yoxdur.{" "}
                  <Link to={`/scan?exam=${examId}`} className="text-indigo-700 underline">
                    Skana keç
                  </Link>
                </p>
              ) : (
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-2">#</th>
                        <th className="px-2 py-2">Şagird</th>
                        <th className="px-2 py-2">Bal</th>
                        <th className="px-2 py-2">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.results.map((r) => (
                        <tr key={r.student_id} className="border-t border-slate-100 hover:bg-slate-50/80">
                          <td className="px-2 py-2 tabular-nums text-slate-500">{r.rank ?? "—"}</td>
                          <td className="px-2 py-2">
                            <span className="font-mono text-xs font-semibold text-slate-800">
                              {r.student_number ?? "—"}
                            </span>
                            {r.student_full_name ? (
                              <span className="mt-0.5 block text-slate-700">{r.student_full_name}</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 tabular-nums">
                            {r.score != null && r.max_score != null ? `${r.score} / ${r.max_score}` : "—"}
                          </td>
                          <td className="px-2 py-2 font-semibold tabular-nums text-slate-900">
                            {r.percent.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
