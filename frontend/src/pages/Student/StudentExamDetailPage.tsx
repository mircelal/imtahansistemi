import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchStudentExamDetail } from "../../api/studentPortal";
import { deltaClass, deltaLabel, formatDt, formatPercent, statusAz } from "./studentFormat";

const card = "rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm ring-1 ring-slate-100";

export default function StudentExamDetailPage() {
  const { examId } = useParams<{ examId: string }>();
  const id = Number(examId);

  const q = useQuery({
    queryKey: ["me-student-exam", id],
    queryFn: () => fetchStudentExamDetail(id),
    enabled: id > 0
  });

  if (q.isLoading) {
    return (
      <div className="page-container space-y-6 pb-10">
        <div className="h-32 animate-pulse rounded-3xl bg-slate-200/80" />
        <div className="h-48 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className={`page-container-narrow ${card}`}>
        <h1 className="text-lg font-semibold text-slate-900">İmtahan tapılmadı</h1>
        <p className="mt-2 text-sm text-slate-600">Bu imtahan üzrə nəticə yoxdur və ya giriş icazəniz yoxdur.</p>
        <Link to="/profil" className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">
          ← Profilə qayıt
        </Link>
      </div>
    );
  }

  const d = q.data;

  return (
    <div className="page-container space-y-8 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-6 py-8 text-white shadow-xl sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">İmtahan detalı</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{d.exam_title}</h1>
        <p className="mt-2 text-sm text-slate-300">{d.exam_scope_label}</p>
        <Link to="/profil" className="mt-5 inline-flex text-sm font-medium text-emerald-300 hover:underline">
          ← Profil
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Cəhdlər" value={String(d.attempt_count)} />
        <Metric label="Ən yaxşı" value={formatPercent(d.best_percent)} />
        <Metric label="Son" value={formatPercent(d.latest_percent)} />
        <Metric
          label="İnkişaf"
          value={deltaLabel(d.improvement_delta)}
          valueClass={deltaClass(d.improvement_delta)}
        />
        <Metric label="Qrup ortası" value={formatPercent(d.cohort_average_percent)} />
        <Metric label="Qrup medianı" value={formatPercent(d.cohort_median_percent)} />
        <Metric
          label="Yeriniz"
          value={d.rank && d.total_participants ? `${d.rank} / ${d.total_participants}` : "—"}
        />
        <Metric label="Percentil" value={d.percentile != null ? `${d.percentile.toFixed(0)}` : "—"} subtitle="0–100" />
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold text-slate-900">Bütün cəhdlər</h2>
        <p className="text-sm text-slate-600">Hər skan üzrə bal, faiz və fənn bölgüsü</p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Tarix</th>
                <th className="px-4 py-3">Bal</th>
                <th className="px-4 py-3">Faiz</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Fənnlər</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.attempts.map((a) => (
                <tr key={a.scan_result_id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDt(a.processed_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {a.score != null && a.max_score != null ? `${a.score} / ${a.max_score}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium">{formatPercent(a.percent)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {statusAz(a.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {a.subjects.length
                      ? a.subjects.map((s) => `${s.subject_name}: ${formatPercent(s.percent)}`).join(" · ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  subtitle,
  valueClass
}: {
  label: string;
  value: string;
  subtitle?: string;
  valueClass?: string;
}) {
  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${valueClass ?? "text-slate-900"}`}>{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
    </div>
  );
}
