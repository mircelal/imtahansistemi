import { Link } from "react-router-dom";
import type { StudentProfile } from "../../api/studentPortal";
import StudentAnalyticsSection from "./components/StudentAnalyticsSection";
import { deltaClass, deltaLabel, formatDt, formatPercent } from "./studentFormat";

const card = "rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100";

type Props = {
  profile: StudentProfile;
  systemName: string;
  userName: string;
};

export default function StudentDashboardSection({ profile, systemName, userName }: Props) {
  const { student, stats, analytics, results, exam_summaries, registrations } = profile;
  const recentResults = results.slice(0, 5);
  const upcomingRegs = registrations.filter((r) => r.status === "confirmed" && !r.has_result);

  return (
    <div className="page-container space-y-10 pb-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 px-6 py-10 text-white shadow-xl sm:px-10">
        <div className="relative max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Şagird kabineti</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{systemName}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
            Xoş gəldiniz, <span className="font-semibold text-white">{userName}</span>. Kod:{" "}
            <span className="font-mono font-semibold text-emerald-300">{student.student_number}</span> ·{" "}
            <span className="font-semibold text-white">{student.course_name}</span>
            {(student.courses?.length ?? 0) > 1 ? (
              <span className="text-slate-400"> ({student.courses!.join(", ")})</span>
            ) : null}
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6" aria-label="Əsas göstəricilər">
        <StatCard title="İmtahanlar" value={stats.distinct_exams} subtitle="fərqli imtahan" />
        <StatCard title="Cəhdlər" value={stats.total_attempts} subtitle={`${stats.graded_attempts} hesablanıb`} />
        <StatCard title="Orta faiz" value={formatPercent(stats.average_percent)} />
        <StatCard title="Median" value={formatPercent(stats.median_percent)} />
        <StatCard title="Ən yaxşı" value={formatPercent(stats.best_percent)} />
        <StatCard title="Sabitlik" value={stats.std_dev_percent != null ? `±${stats.std_dev_percent}%` : "—"} subtitle="dəyişkənlik" />
      </section>

      <StudentAnalyticsSection analytics={analytics} statsAverage={stats.average_percent} compact />

      {upcomingRegs.length > 0 ? (
        <section className={card}>
          <h2 className="text-lg font-semibold text-slate-900">Gözlənilən imtahanlar</h2>
          <p className="text-sm text-slate-600">Qeydiyyatdan keçmisiniz, nəticə hələ yoxdur</p>
          <ul className="mt-4 divide-y divide-slate-100">
            {upcomingRegs.map((r) => (
              <li key={r.order_id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="font-medium text-slate-900">{r.exam_title ?? r.ticket_title}</span>
                <span className="text-slate-500">{r.course_name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {exam_summaries.length > 0 ? (
        <section className={card}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">İmtahanlarım</h2>
              <p className="text-sm text-slate-600">Qrup müqayisəsi və inkişaf göstəriciləri</p>
            </div>
            <Link to="/profil" className="text-sm font-medium text-emerald-700 hover:underline">
              Tam profil →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {exam_summaries.slice(0, 4).map((ex) => (
              <Link
                key={ex.exam_id}
                to={`/profil/imtahan/${ex.exam_id}`}
                className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/30"
              >
                <p className="font-semibold text-slate-900">{ex.exam_title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{ex.exam_scope_label}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span>
                    Ən yaxşı: <strong>{formatPercent(ex.best_percent)}</strong>
                  </span>
                  <span>
                    Qrup ortası: <strong>{formatPercent(ex.cohort_average_percent)}</strong>
                  </span>
                  {ex.improvement_delta != null ? (
                    <span className={deltaClass(ex.improvement_delta)}>
                      İnkişaf: <strong>{deltaLabel(ex.improvement_delta)}</strong>
                    </span>
                  ) : null}
                </div>
                {ex.percentile != null ? (
                  <p className="mt-2 text-xs text-indigo-700">Percentil: {ex.percentile.toFixed(0)} (yüksək = daha yaxşı)</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {recentResults.length > 0 ? (
        <section className={card}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Son nəticələr</h2>
              <p className="text-sm text-slate-500">Ən son skan olunmuş cəhdlər</p>
            </div>
            <Link to="/profil" className="text-sm font-medium text-emerald-700 hover:underline">
              Tam tarixçə →
            </Link>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tarix</th>
                  <th className="px-4 py-3">İmtahan</th>
                  <th className="px-4 py-3">Bal</th>
                  <th className="px-4 py-3">Faiz</th>
                  <th className="px-4 py-3">Qrupdan fərq</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentResults.map((r) => (
                  <tr key={r.scan_result_id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDt(r.processed_at)}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 font-medium text-slate-900">
                      <Link to={`/profil/imtahan/${r.exam_id}`} className="hover:text-emerald-800 hover:underline">
                        {r.exam_title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {r.score != null && r.max_score != null ? `${r.score} / ${r.max_score}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium">{formatPercent(r.percent)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${deltaClass(r.vs_exam_average)}`}>
                      {r.vs_exam_average != null ? deltaLabel(r.vs_exam_average) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className={`${card} text-center`}>
          <p className="text-slate-600">Hələ imtahan nəticəsi yoxdur.</p>
          <p className="mt-1 text-sm text-slate-500">İmtahan keçdikdən və vərəq skan olunduqdan sonra statistikalar burada görünəcək.</p>
        </section>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-slate-600">{subtitle}</p> : null}
    </div>
  );
}
