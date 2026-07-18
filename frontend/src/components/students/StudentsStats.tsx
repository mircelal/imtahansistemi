import type { StudentsSummary } from "../../api/studentsAdmin";

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

type Props = {
  summary: StudentsSummary | undefined;
  loading?: boolean;
};

export default function StudentsStats({ summary, loading }: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/80" />
        ))}
      </div>
    );
  }
  if (!summary) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard label="Ümumi şagird" value={summary.total} />
      <SummaryCard label="Kabineti olan" value={summary.with_cabinet} />
      <SummaryCard label="Nəticəsi olan" value={summary.with_results} />
      <SummaryCard
        label="Orta imtahan sayı"
        value={summary.avg_exams_per_student != null ? summary.avg_exams_per_student : "—"}
      />
    </div>
  );
}
