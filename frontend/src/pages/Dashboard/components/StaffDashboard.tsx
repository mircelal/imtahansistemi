import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PlatformDashboard } from "../../../api/dashboard";
import { IconCourse, IconExam, IconPulse, IconScan, IconStudent, IconChart } from "../../../components/icons";
import {
  alertToneClass,
  formatDt,
  formatShortDate,
  roleLabel,
  sessionStatusClass,
  sessionStatusLabel,
} from "../dashboardFormat";

type Props = {
  data: PlatformDashboard;
  systemName: string;
  userName: string;
  userRole: string;
};

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  gradient,
  href,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  gradient: string;
  href?: string;
}) {
  const inner = (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm ring-1 ring-slate-200/60 transition hover:shadow-md ${gradient}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="rounded-xl bg-white/90 p-2 text-slate-600 ring-1 ring-slate-200/80">{icon}</div>
      </div>
    </div>
  );
  return href ? (
    <Link to={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default function StaffDashboard({ data, systemName, userName, userRole }: Props) {
  const { totals, alerts, recent_sessions, exam_activity, exams_needing_attention, scan_activity, quick_actions } = data;

  const chartData = scan_activity.map((d) => ({
    label: formatShortDate(d.date),
    count: d.count,
    fullDate: d.date,
  }));

  const pipelinePct =
    totals.exams_total > 0 ? Math.round((totals.exams_with_results / totals.exams_total) * 100) : 0;
  const readyPct =
    totals.exams_total > 0 ? Math.round((totals.exams_ready_for_scan / totals.exams_total) * 100) : 0;

  return (
    <div className="page-container space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 px-6 py-8 text-white shadow-xl sm:px-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet-500/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">İdarə paneli</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{systemName}</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
              Xoş gəldiniz, <span className="font-semibold text-white">{userName}</span>. Platformanın cari vəziyyəti,
              skan axını və gözləyən işlər bir baxışda.
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm backdrop-blur">
            <p className="text-slate-400">Rol</p>
            <p className="font-semibold text-white">{roleLabel(userRole)}</p>
            <p className="mt-1 text-xs text-slate-400">{formatDt(new Date().toISOString())}</p>
          </div>
        </div>
        <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
          <PipelineChip label="Nəticəli imtahan" value={`${pipelinePct}%`} sub={`${totals.exams_with_results}/${totals.exams_total}`} />
          <PipelineChip label="Skana hazır" value={`${readyPct}%`} sub={`${totals.exams_ready_for_scan} imtahan`} />
          <PipelineChip label="Bugünkü skan" value={String(totals.scans_today)} sub="emal olunmuş sətir" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" aria-label="Əsas göstəricilər">
        <KpiCard title="Kurslar" value={totals.courses_total} subtitle={`${totals.courses_active} aktiv`} icon={<IconCourse className="h-5 w-5" />} gradient="bg-gradient-to-br from-sky-50/80 to-white" href="/courses" />
        <KpiCard title="İmtahanlar" value={totals.exams_total} subtitle={`${totals.exams_active} aktiv`} icon={<IconExam className="h-5 w-5" />} gradient="bg-gradient-to-br from-violet-50/80 to-white" href="/exams" />
        <KpiCard title="Şagirdlər" value={totals.students_total} subtitle={`${totals.students_with_cabinet} kabinet`} icon={<IconStudent className="h-5 w-5" />} gradient="bg-gradient-to-br from-emerald-50/80 to-white" href="/students" />
        <KpiCard title="Skan partiyası" value={totals.scan_sessions_total} subtitle={`${totals.scan_sessions_open} açıq`} icon={<IconScan className="h-5 w-5" />} gradient="bg-gradient-to-br from-teal-50/80 to-white" href="/scan" />
        <KpiCard title="İştirakçı" value={totals.participants_total} subtitle="unikal şagird" icon={<IconPulse className="h-5 w-5" />} gradient="bg-gradient-to-br from-rose-50/80 to-white" href="/reports" />
        <KpiCard title="Skan sətiri" value={totals.scan_rows_total} subtitle={`${totals.scan_sessions_done} bitmiş partiya`} icon={<IconScan className="h-5 w-5" />} gradient="bg-gradient-to-br from-indigo-50/80 to-white" href="/reports" />
        <KpiCard title="Manual yoxlama" value={totals.manual_review_pending} subtitle="gözləyən sətir" icon={<IconPulse className="h-5 w-5" />} gradient="bg-gradient-to-br from-amber-50/80 to-white" href="/scan?step=3" />
        <KpiCard title="Hazır deyil" value={totals.exams_not_ready} subtitle="skan üçün" icon={<IconExam className="h-5 w-5" />} gradient="bg-gradient-to-br from-orange-50/80 to-white" href="/exams" />
      </section>

      <section className="space-y-3" aria-label="Maliyyə göstəriciləri">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bilet gəlirləri</h2>
          {userRole === "admin" ? (
            <Link to="/admin/finance" className="text-sm font-medium text-brand hover:underline">
              Maliyyə paneli →
            </Link>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Ümumi gəlir"
            value={`${(totals.total_revenue ?? 0).toFixed(2)} AZN`}
            subtitle="təsdiqlənmiş satış"
            icon={<IconChart className="h-5 w-5" />}
            gradient="bg-gradient-to-br from-emerald-50/80 to-white"
            href={userRole === "admin" ? "/admin/finance" : undefined}
          />
          <KpiCard
            title="Bu gün"
            value={`${(totals.revenue_today ?? 0).toFixed(2)} AZN`}
            subtitle="bugünkü satış"
            icon={<IconChart className="h-5 w-5" />}
            gradient="bg-gradient-to-br from-lime-50/80 to-white"
          />
          <KpiCard
            title="Kurs balansları"
            value={`${(totals.total_wallet_balance ?? 0).toFixed(2)} AZN`}
            subtitle="ümumi balans"
            icon={<IconCourse className="h-5 w-5" />}
            gradient="bg-gradient-to-br from-cyan-50/80 to-white"
            href="/courses"
          />
          <KpiCard
            title="Gözləyən sifariş"
            value={totals.pending_ticket_orders ?? 0}
            subtitle="təsdiq gözləyir"
            icon={<IconPulse className="h-5 w-5" />}
            gradient="bg-gradient-to-br from-amber-50/80 to-white"
            href={userRole === "admin" ? "/admin/ticket-sales" : undefined}
          />
        </div>
      </section>

      {alerts.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {alerts.map((a) => (
            <article
              key={a.key}
              className={`rounded-xl border p-4 text-sm ring-1 ring-black/5 ${alertToneClass(a.tone)}`}
            >
              <h2 className="font-semibold">{a.title}</h2>
              <p className="mt-1 leading-relaxed opacity-90">{a.message}</p>
              {a.href ? (
                <Link to={a.href} className="mt-2 inline-block text-xs font-semibold underline hover:opacity-80">
                  Bax →
                </Link>
              ) : null}
            </article>
          ))}
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-5">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Skan aktivliyi</h2>
                <p className="text-sm text-slate-500">Son 7 gün — emal olunmuş skan sətirləri</p>
              </div>
              <Link to="/scan" className="text-sm font-medium text-indigo-600 hover:underline">
                Skana keç →
              </Link>
            </div>
            <div className="h-52">
              {chartData.some((d) => d.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(_, p) => formatShortDate(p?.[0]?.payload?.fullDate ?? "")} />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center justify-center text-sm text-slate-500">
                  Son həftədə skan aktivliyi yoxdur — ilk skanı başladın.
                </p>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Son skan partiyaları</h2>
              <p className="text-sm text-slate-500">Ən son yaradılan partiyalar və emal vəziyyəti</p>
            </div>
            {recent_sessions.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-slate-600">Hələ skan partiyası yoxdur.</p>
                <Link
                  to="/scan"
                  className="mt-3 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Skana başla
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Partiya</th>
                      <th className="px-5 py-3">İmtahan</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Emal</th>
                      <th className="px-5 py-3">Operator</th>
                      <th className="px-5 py-3">Tarix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recent_sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3 font-mono text-xs">
                          <Link to={`/scan?exam=${s.exam_id}&session=${s.id}`} className="text-indigo-700 hover:underline">
                            #{s.id}
                          </Link>
                        </td>
                        <td className="max-w-[200px] truncate px-5 py-3 font-medium text-slate-800">
                          <Link to={`/reports?exam=${s.exam_id}`} className="hover:text-indigo-800 hover:underline">
                            {s.exam_title ?? `İmtahan #${s.exam_id}`}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${sessionStatusClass(s.status)}`}>
                            {sessionStatusLabel(s.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3 tabular-nums text-slate-600">
                          {s.processed_images}/{s.total_images}
                        </td>
                        <td className="px-5 py-3 text-slate-600">{s.operator_full_name ?? "—"}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDt(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {exam_activity.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">İmtahan performansı</h2>
                <p className="text-sm text-slate-500">Son aktivliyə görə — iştirak və orta bal</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">İmtahan</th>
                      <th className="px-5 py-3">Kurs</th>
                      <th className="px-5 py-3">İştirakçı</th>
                      <th className="px-5 py-3">Orta bal</th>
                      <th className="px-5 py-3">Son skan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {exam_activity.slice(0, 8).map((e) => (
                      <tr key={e.exam_id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3 font-medium">
                          <Link to={`/reports?exam=${e.exam_id}`} className="text-slate-900 hover:text-indigo-700 hover:underline">
                            {e.title}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{e.course_name ?? "—"}</td>
                        <td className="px-5 py-3 tabular-nums">{e.unique_students}</td>
                        <td className="px-5 py-3 tabular-nums">{e.average_score != null ? e.average_score.toFixed(1) : "—"}</td>
                        <td className="px-5 py-3 text-slate-500">{formatDt(e.last_processed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Tez keçidlər</h2>
            <p className="mb-3 text-sm text-slate-500">Əsas iş axınları</p>
            <ul className="space-y-2">
              {quick_actions.map((a) => (
                <li key={a.key}>
                  <Link
                    to={a.href}
                    className="block rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 transition hover:border-indigo-200 hover:shadow-sm"
                  >
                    <span className="text-sm font-semibold text-slate-900">{a.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-600">{a.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Diqqət tələb edir</h2>
            <p className="mb-3 text-sm text-slate-500">Hazır olmayan və ya skansız imtahanlar</p>
            {exams_needing_attention.length === 0 ? (
              <p className="text-sm text-emerald-700">Bütün imtahanlar hazır və ya skanlanıb.</p>
            ) : (
              <ul className="space-y-2">
                {exams_needing_attention.map((e) => (
                  <li key={e.exam_id}>
                    <Link
                      to={e.ready_for_scan ? `/scan?exam=${e.exam_id}` : `/exams/yarat?exam=${e.exam_id}`}
                      className="flex items-start justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm hover:bg-amber-50"
                    >
                      <span className="font-medium text-slate-900">{e.title}</span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase text-amber-800">
                        {e.ready_for_scan ? "skan yox" : "hazır deyil"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PipelineChip({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-bold tabular-nums text-white">{value}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );
}
