import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportExamDetail } from "../../../api/reports";
import {
  difficultyLabel,
  formatDt,
  formatPercent,
  formatScore,
  insightToneClass,
  statusBadgeClass,
  statusLabelAz,
} from "../reportsFormat";

const TAB_KEYS = ["overview", "items", "ranking"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  overview: "Ümumi",
  items: "Sual analizi",
  ranking: "Reyting",
};

type Props = {
  detail: ReportExamDetail | undefined;
  loading: boolean;
  examId: number;
  onExport: (kind: "pdf" | "excel") => void;
  exporting: boolean;
};

export default function ReportsExamDetailPanel({ detail, loading, examId, onExport, exporting }: Props) {
  const [tab, setTab] = useState<TabKey>("overview");

  const scoreChart = useMemo(
    () =>
      detail?.summary.histogram.map((b, i) => ({
        name: `${b.from.toFixed(0)}–${b.to.toFixed(0)}`,
        count: b.count,
        key: i,
      })) ?? [],
    [detail],
  );

  const percentChart = useMemo(
    () =>
      detail?.summary.percent_histogram.map((b, i) => ({
        name: `${b.from.toFixed(0)}%`,
        count: b.count,
        key: i,
      })) ?? [],
    [detail],
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-slate-200" />
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-slate-100" />
            ))}
          </div>
          <div className="h-56 rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
        <p className="text-sm text-slate-600">Sol paneldən imtahan seçin və ya aşağıdakı siyahıdan baxın.</p>
      </div>
    );
  }

  const { exam, summary, insights, status_breakdown, item_analysis, leaderboard } = detail;
  const hasData = summary.scan_rows > 0;

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-200/50 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">
              {exam.course_name ?? "Ümumi imtahan"}
            </p>
            <h2 className="mt-1 truncate text-xl font-bold text-slate-900">{exam.title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {exam.question_count} sual
              {exam.scheduled_at ? ` · ${formatDt(exam.scheduled_at)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/scan?exam=${examId}`}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100"
            >
              Skan
            </Link>
            <button
              type="button"
              disabled={exporting || !hasData}
              onClick={() => onExport("pdf")}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              PDF
            </button>
            <button
              type="button"
              disabled={exporting || !hasData}
              onClick={() => onExport("excel")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Excel
            </button>
          </div>
        </div>

        {insights.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {insights.map((ins) => (
              <article key={ins.key} className={`rounded-xl border p-3 text-sm ring-1 ring-black/5 ${insightToneClass(ins.tone)}`}>
                <h3 className="font-semibold">{ins.title}</h3>
                <p className="mt-0.5 leading-relaxed opacity-90">{ins.message}</p>
              </article>
            ))}
          </div>
        )}
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1 ring-1 ring-slate-200/60">
        {TAB_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === k ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80" : "text-slate-600 hover:bg-white/60"
            }`}
          >
            {TAB_LABELS[k]}
          </button>
        ))}
      </nav>

      {!hasData ? (
        <EmptyExamState examId={examId} />
      ) : tab === "overview" ? (
        <OverviewTab summary={summary} statusBreakdown={status_breakdown} scoreChart={scoreChart} percentChart={percentChart} />
      ) : tab === "items" ? (
        <ItemsTab items={item_analysis.items} />
      ) : (
        <RankingTab rows={leaderboard} />
      )}
    </div>
  );
}

function EmptyExamState({ examId }: { examId: number }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-8 text-center">
      <h3 className="text-lg font-semibold text-amber-950">Bu imtahan üçün hələ skan nəticəsi yoxdur</h3>
      <p className="mt-2 text-sm text-amber-900/80">
        Cavab kartlarını skan edin — QR kod imtahanı avtomatik tanıyacaq, hesabatlar dərhal dolacaq.
      </p>
      <Link
        to={`/scan?exam=${examId}`}
        className="mt-4 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Skana keç →
      </Link>
    </div>
  );
}

function OverviewTab({
  summary,
  statusBreakdown,
  scoreChart,
  percentChart,
}: {
  summary: ReportExamDetail["summary"];
  statusBreakdown: Record<string, number>;
  scoreChart: { name: string; count: number; key: number }[];
  percentChart: { name: string; count: number; key: number }[];
}) {
  const kpis = [
    { label: "Orta faiz", value: formatPercent(summary.average_percent) },
    { label: "Median", value: formatPercent(summary.median_percent) },
    { label: "Keçid faizi", value: formatPercent(summary.pass_rate) },
    { label: "İştirakçı", value: String(summary.unique_students) },
    { label: "Skan sətiri", value: String(summary.scan_rows) },
    { label: "Std (faiz)", value: formatPercent(summary.std_dev_percent) },
    { label: "Q1 / Q3", value: `${formatPercent(summary.q1_percent)} / ${formatPercent(summary.q3_percent)}` },
    { label: "Bal (min–max)", value: `${formatScore(summary.minimum)} – ${formatScore(summary.maximum)}` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(statusBreakdown).map(([st, cnt]) => (
          <span key={st} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusBadgeClass(st)}`}>
            {statusLabelAz(st)}: {cnt}
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Bal paylanması" subtitle="Xam skor intervalı">
          {scoreChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={scoreChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-sm text-slate-500">Məlumat yoxdur</p>
          )}
        </ChartCard>

        <ChartCard title="Faiz paylanması" subtitle="0–100% performans zolaqları">
          {percentChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={percentChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
                <Tooltip />
                <ReferenceLine
                  x={`${summary.pass_threshold_percent.toFixed(0)}%`}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: "Keçid", fontSize: 10, position: "insideTopRight" }}
                />
                <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-sm text-slate-500">Məlumat yoxdur</p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500">{subtitle}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ItemsTab({ items }: { items: ReportExamDetail["item_analysis"]["items"] }) {
  if (!items.length) {
    return <p className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">Cavab açarı tapılmadı.</p>;
  }

  const chartData = items.slice(0, 30).map((it) => ({
    name: `S${it.question_number}`,
    p: Math.round(it.difficulty_p * 100),
    full: it.question_number,
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Sual çətinliyi (p-value)</h3>
        <p className="text-xs text-slate-500">Düzgün cavab faizi — yüksək = asan sual</p>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-45} textAnchor="end" height={48} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} width={36} />
              <Tooltip formatter={(v: number) => [`${v}%`, "Düzgün faiz"]} labelFormatter={(_, p) => `Sual ${p?.[0]?.payload?.full}`} />
              <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="4 4" />
              <Bar dataKey="p" radius={[3, 3, 0, 0]}>
                {chartData.map((row, i) => (
                  <Cell key={i} fill={row.p >= 75 ? "#059669" : row.p >= 45 ? "#0284c7" : "#d97706"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Sual</th>
                <th className="px-4 py-3">Düzgün</th>
                <th className="px-4 py-3">Cəhd</th>
                <th className="px-4 py-3">p-value</th>
                <th className="px-4 py-3">Səviyyə</th>
                <th className="px-4 py-3">Açar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => {
                const diff = difficultyLabel(it.difficulty_p);
                return (
                  <tr key={it.question_number} className="hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 font-medium tabular-nums">{it.question_number}</td>
                    <td className="px-4 py-2.5 tabular-nums">{it.correct_count}</td>
                    <td className="px-4 py-2.5 tabular-nums">{it.attempted_count}</td>
                    <td className="px-4 py-2.5 tabular-nums">{(it.difficulty_p * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${diff.className}`}>{diff.label}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{it.correct_answer ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RankingTab({ rows }: { rows: ReportExamDetail["leaderboard"] }) {
  if (!rows.length) {
    return (
      <p className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
        Reyting üçün şagird kodu təyin olunmuş skanlar lazımdır.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Yer</th>
              <th className="px-4 py-3">Şagird</th>
              <th className="px-4 py-3">Kod</th>
              <th className="px-4 py-3">Bal</th>
              <th className="px-4 py-3">Faiz</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.student_id} className="hover:bg-slate-50/80">
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      r.rank === 1
                        ? "bg-amber-100 text-amber-900"
                        : r.rank === 2
                          ? "bg-slate-200 text-slate-800"
                          : r.rank === 3
                            ? "bg-orange-100 text-orange-900"
                            : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {r.rank}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-900">{r.student_full_name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-slate-600">{r.student_number ?? "—"}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {formatScore(r.score)} / {formatScore(r.max_score)}
                </td>
                <td className="px-4 py-2.5 font-semibold tabular-nums text-indigo-700">{formatPercent(r.percent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
