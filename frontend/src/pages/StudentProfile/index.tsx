import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchStudentProfile } from "../../api/studentPortal";
import StudentAnalyticsSection from "../Student/components/StudentAnalyticsSection";
import {
  deltaClass,
  deltaLabel,
  formatDate,
  formatDt,
  formatPercent,
  performanceBandClass,
  performanceBandLabel,
  registrationStatusClass,
  statusAz
} from "../Student/studentFormat";

const inputCard = "rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm ring-1 ring-slate-100";

export default function StudentProfilePage() {
  const q = useQuery({ queryKey: ["me-student-profile"], queryFn: fetchStudentProfile });

  if (q.isLoading) {
    return (
      <div className="page-container space-y-8 pb-10">
        <div className="h-40 animate-pulse rounded-3xl bg-slate-200/80" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className={`page-container-narrow ${inputCard}`}>
        <h1 className="text-lg font-semibold text-slate-900">Profil yüklənmədi</h1>
        <p className="mt-2 text-sm text-slate-600">
          Hesabınız şagird əlavə edilmiş istifadəçi olmalıdır. Administrator şagird qeydiyyatınızı hesaba bağlayıb-bağlamadığını
          yoxlayın.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline">
          Kabinetə qayıt
        </Link>
      </div>
    );
  }

  const { account, student, stats, exam_summaries, registrations, results, analytics } = q.data!;

  return (
    <div className="page-container space-y-8 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-6 py-9 text-white shadow-xl sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Şəxsi kabinet</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{student.full_name}</h1>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-300">
          <span>
            Kod: <strong className="font-semibold text-white">{student.student_number}</strong>
          </span>
          <span>
            Kurs: <strong className="font-semibold text-white">{student.course_name}</strong>
          </span>
          <span>
            E-poçt: <strong className="font-semibold text-white">{account.email}</strong>
          </span>
        </div>
        {analytics.performance_band ? (
          <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1 ${performanceBandClass(analytics.performance_band)}`}>
            Səviyyə: {performanceBandLabel(analytics.performance_band)}
          </span>
        ) : null}
        <Link to="/" className="mt-6 inline-flex rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/15">
          ← Kabinet
        </Link>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Şəxsi məlumatlar">
        <div className={inputCard}>
          <h2 className="text-lg font-semibold text-slate-900">Hesab məlumatları</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Tam ad" value={account.full_name} />
            <Row label="E-poçt" value={account.email} />
            <Row label="Qeydiyyat tarixi" value={formatDate(account.member_since)} />
          </dl>
        </div>
        <div className={inputCard}>
          <h2 className="text-lg font-semibold text-slate-900">Şagird qeydiyyatı</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="6 rəqəmli kod" value={student.student_number} mono />
            <Row label="Ad, soyad" value={student.full_name} />
            <Row label="Əsas kurs" value={student.course_name} />
          </dl>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6" aria-label="Statistika">
        <Stat title="İmtahan sayı" value={String(stats.distinct_exams)} sub="Fərqli imtahan" />
        <Stat title="Ümumi cəhd" value={String(stats.total_attempts)} sub="Skanla qeydə alınmış" />
        <Stat title="Orta faiz" value={formatPercent(stats.average_percent)} />
        <Stat title="Median" value={formatPercent(stats.median_percent)} />
        <Stat title="Ən yaxşı / ən aşağı" value={`${formatPercent(stats.best_percent)} / ${formatPercent(stats.lowest_percent)}`} />
        <Stat title="Son hesablanma" value={formatDt(stats.last_graded_at)} small />
      </section>

      <StudentAnalyticsSection analytics={analytics} statsAverage={stats.average_percent} />

      {registrations.length > 0 ? (
        <section className={inputCard}>
          <div className="mb-4 border-b border-slate-100 pb-4">
            <h2 className="text-lg font-semibold text-slate-900">İmtahan qeydiyyatları</h2>
            <p className="text-sm text-slate-600">Bilet sifarişləri və nəticə statusu</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tarix</th>
                  <th className="px-4 py-3">Bilet / imtahan</th>
                  <th className="px-4 py-3">Kurs</th>
                  <th className="px-4 py-3">Nəticə</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {registrations.map((r) => (
                  <tr key={r.order_id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDt(r.ordered_at)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{r.exam_title ?? r.ticket_title}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.course_name}</td>
                    <td className="px-4 py-3">
                      {r.has_result ? (
                        r.exam_id ? (
                          <Link to={`/profil/imtahan/${r.exam_id}`} className="text-emerald-700 hover:underline">
                            Bax
                          </Link>
                        ) : (
                          <span className="text-emerald-700">Var</span>
                        )
                      ) : (
                        <span className="text-slate-500">Gözlənilir</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${registrationStatusClass(r.status)}`}>
                        {statusAz(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={inputCard}>
        <div className="mb-4 border-b border-slate-100 pb-4">
          <h2 className="text-lg font-semibold text-slate-900">İmtahanlarım</h2>
          <p className="text-sm text-slate-600">Detallı baxış üçün imtahana klikləyin</p>
        </div>
        {exam_summaries.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Hələ imtahan nəticəsi yoxdur.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {exam_summaries.map((ex) => (
              <Link
                key={ex.exam_id}
                to={`/profil/imtahan/${ex.exam_id}`}
                className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/30"
              >
                <p className="font-semibold text-slate-900">{ex.exam_title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{ex.exam_scope_label}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span>
                    Cəhd: <strong>{ex.attempt_count}</strong>
                  </span>
                  <span>
                    Ən yaxşı: <strong>{formatPercent(ex.best_percent)}</strong>
                  </span>
                  <span>
                    Son: <strong>{formatPercent(ex.latest_percent)}</strong>
                  </span>
                  {ex.improvement_delta != null ? (
                    <span className={deltaClass(ex.improvement_delta)}>
                      İnkişaf: <strong>{deltaLabel(ex.improvement_delta)}</strong>
                    </span>
                  ) : null}
                </div>
                {ex.rank && ex.total_participants ? (
                  <p className="mt-2 text-xs text-indigo-700">
                    Yer: {ex.rank}/{ex.total_participants}
                    {ex.percentile != null ? ` · Percentil ${ex.percentile.toFixed(0)}` : ""}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className={inputCard}>
        <div className="mb-4 flex flex-col gap-1 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Tam tarixçə</h2>
            <p className="text-sm text-slate-600">Bütün skan nəticələri — ən yenidən köhnəyə</p>
          </div>
          <p className="text-sm text-slate-500">
            Qiymətləndirilmiş: <strong className="text-slate-800">{stats.graded_attempts}</strong>
          </p>
        </div>
        {results.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Hələ skan nəticəsi yoxdur.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tarix</th>
                  <th className="px-4 py-3">İmtahan</th>
                  <th className="px-4 py-3">Kapsam</th>
                  <th className="px-4 py-3">Bal</th>
                  <th className="px-4 py-3">Faiz</th>
                  <th className="px-4 py-3">Qrupdan fərq</th>
                  <th className="px-4 py-3">Yer</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {results.map((r) => (
                  <tr key={r.scan_result_id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDt(r.processed_at)}</td>
                    <td className="max-w-[200px] px-4 py-3 font-medium text-slate-900">
                      <Link to={`/profil/imtahan/${r.exam_id}`} className="hover:text-emerald-800 hover:underline" title={r.exam_title}>
                        {r.exam_title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.exam_scope_label}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {r.score != null && r.max_score != null ? `${r.score} / ${r.max_score}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPercent(r.percent)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${deltaClass(r.vs_exam_average)}`}>
                      {r.vs_exam_average != null ? deltaLabel(r.vs_exam_average) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                      {r.rank_in_exam ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{statusAz(r.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-medium text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function Stat({ title, value, sub, small }: { title: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className={inputCard}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`mt-2 font-bold tabular-nums text-slate-900 ${small ? "text-base" : "text-2xl"}`}>{value}</p>
      {sub ? <p className="mt-1 text-sm text-slate-600">{sub}</p> : null}
    </div>
  );
}
