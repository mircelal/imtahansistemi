import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { StudentAnalytics, StudentExamSummary } from "../../../api/studentPortal";
import {
  formatDt,
  formatPercent,
  insightToneClass,
  performanceBandClass,
  performanceBandLabel
} from "../studentFormat";

const SUBJECT_COLORS = ["#059669", "#0284c7", "#7c3aed", "#db2777", "#d97706", "#64748b"];

type Props = {
  analytics: StudentAnalytics;
  statsAverage: number | null;
  compact?: boolean;
};

export function StudentInsightsPanel({ insights }: { insights: StudentAnalytics["insights"] }) {
  if (!insights.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {insights.map((ins) => (
        <article key={ins.key} className={`rounded-xl border p-4 ring-1 ring-black/5 ${insightToneClass(ins.tone)}`}>
          <h3 className="text-sm font-semibold text-slate-900">{ins.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{ins.message}</p>
        </article>
      ))}
    </div>
  );
}

export function StudentProgressChart({ trend }: { trend: StudentAnalytics["progress_trend"] }) {
  if (trend.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        İnkişaf qrafiki üçün ən azı 2 nəticə lazımdır.
      </p>
    );
  }
  const data = trend.map((p, i) => ({
    idx: i + 1,
    label: p.exam_title.length > 18 ? `${p.exam_title.slice(0, 16)}…` : p.exam_title,
    fullTitle: p.exam_title,
    percent: p.percent,
    date: formatDt(p.processed_at)
  }));

  return (
    <ResponsiveContainer width="100%" height={compactHeight(280)}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" width={36} />
        <Tooltip
          formatter={(v: number) => [`${v.toFixed(1)}%`, "Faiz"]}
          labelFormatter={(_, payload) => {
            const row = payload?.[0]?.payload;
            return row ? `${row.fullTitle} · ${row.date}` : "";
          }}
        />
        <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "50%", position: "insideTopRight", fontSize: 10 }} />
        <Line type="monotone" dataKey="percent" stroke="#059669" strokeWidth={2.5} dot={{ r: 4, fill: "#059669" }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StudentSubjectChart({ subjects }: { subjects: StudentAnalytics["subject_breakdown"] }) {
  if (!subjects.length) {
    return <p className="py-10 text-center text-sm text-slate-500">Fənn üzrə məlumat hələ yoxdur.</p>;
  }
  const data = subjects.map((s) => ({
    name: s.subject_name.length > 14 ? `${s.subject_name.slice(0, 12)}…` : s.subject_name,
    fullName: s.subject_name,
    percent: s.percent ?? 0,
    attempts: s.attempts
  }));

  return (
    <ResponsiveContainer width="100%" height={compactHeight(260)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: number) => [`${v.toFixed(1)}%`, "Orta faiz"]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
        />
        <Bar dataKey="percent" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StudentCohortChart({ comparisons }: { comparisons: StudentAnalytics["cohort_comparisons"] }) {
  const withData = comparisons.filter((c) => c.student_best_percent != null);
  if (!withData.length) {
    return <p className="py-10 text-center text-sm text-slate-500">Qrup müqayisəsi üçün kifayət qədər iştirakçı yoxdur.</p>;
  }
  const data = withData.slice(0, 8).map((c) => ({
    name: c.exam_title.length > 14 ? `${c.exam_title.slice(0, 12)}…` : c.exam_title,
    fullTitle: c.exam_title,
    sizin: c.student_best_percent ?? 0,
    orta: c.cohort_average_percent ?? 0
  }));

  return (
    <ResponsiveContainer width="100%" height={compactHeight(280)}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={56} />
        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} width={36} />
        <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTitle ?? ""} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="sizin" name="Sizin ən yaxşı" fill="#059669" radius={[4, 4, 0, 0]} />
        <Bar dataKey="orta" name="Qrup ortası" fill="#94a3b8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StudentPerformanceBand({ band, average }: { band: string | null; average: number | null }) {
  if (!band) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${performanceBandClass(band)}`}>
        {performanceBandLabel(band)}
      </span>
      {average != null ? (
        <span className="text-sm text-slate-600">
          Ümumi orta: <strong className="text-slate-900">{formatPercent(average)}</strong>
        </span>
      ) : null}
    </div>
  );
}

export function StudentExamSummaryCard({ exam }: { exam: StudentExamSummary }) {
  return (
    <article className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{exam.exam_title}</p>
          <p className="text-xs text-slate-500">{exam.exam_scope_label}</p>
        </div>
        {exam.percentile != null ? (
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-100">
            Top {Math.max(1, Math.round(100 - exam.percentile))}%
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Metric label="Ən yaxşı" value={formatPercent(exam.best_percent)} />
        <Metric label="Son" value={formatPercent(exam.latest_percent)} />
        <Metric label="Qrup ortası" value={formatPercent(exam.cohort_average_percent)} />
        <Metric label="Yer" value={exam.rank && exam.total_participants ? `${exam.rank}/${exam.total_participants}` : "—"} />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export default function StudentAnalyticsSection({ analytics, statsAverage, compact }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">İnkişaf və analitika</h2>
          <p className="text-sm text-slate-600">Beynəlxalq təhsil standartlarına uyğun performans izləmə</p>
        </div>
        <StudentPerformanceBand band={analytics.performance_band} average={statsAverage} />
      </div>

      <StudentInsightsPanel insights={analytics.insights} />

      <div className={`grid gap-4 ${compact ? "" : "lg:grid-cols-2"}`}>
        <ChartCard title="Bal inkişafı" subtitle="Zaman üzrə faiz dəyişimi">
          <StudentProgressChart trend={analytics.progress_trend} />
        </ChartCard>
        <ChartCard title="Fənn üzrə güc" subtitle="Bütün cəhdlər üzrə orta göstərici">
          <StudentSubjectChart subjects={analytics.subject_breakdown} />
        </ChartCard>
      </div>

      {!compact ? (
        <ChartCard title="Qrup ilə müqayisə" subtitle="Sizin ən yaxşı nəticə vs iştirakçıların ortası">
          <StudentCohortChart comparisons={analytics.cohort_comparisons} />
        </ChartCard>
      ) : null}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function compactHeight(h: number) {
  return h;
}
