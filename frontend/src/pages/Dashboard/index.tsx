import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getPublicSettings } from "../../api/settings";
import { listCourses } from "../../api/courses";
import { listExams } from "../../api/exams";
import { listScanSessions } from "../../api/scans";
import { fetchStudentProfile } from "../../api/studentPortal";
import { useAuthStore } from "../../store/authStore";

function normStatus(status: string) {
  return status.toLowerCase();
}

function statusLabel(status: string) {
  const k = normStatus(status);
  const map: Record<string, string> = {
    pending: "Gözləyir",
    processing: "İşlənir",
    done: "Bitib",
    error: "Xəta"
  };
  return map[k] ?? status;
}

function statusBadgeClass(status: string) {
  const k = normStatus(status);
  if (k === "done") return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/20";
  if (k === "error") return "bg-red-500/15 text-red-800 ring-red-500/20";
  if (k === "processing") return "bg-violet-500/15 text-violet-800 ring-violet-500/20";
  return "bg-slate-500/10 text-slate-700 ring-slate-500/15";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("az-AZ", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

type BentoStatProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  gradient: string;
};

function BentoStat({ title, value, subtitle, icon, gradient }: BentoStatProps) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm shadow-slate-200/50 ring-1 ring-slate-200/60 backdrop-blur-sm transition hover:shadow-md ${gradient}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="rounded-xl bg-white/90 p-2.5 text-slate-700 shadow-sm ring-1 ring-slate-200/80">{icon}</div>
      </div>
    </div>
  );
}

function IconCourse() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 16.5V5.5zM4 5.5A2.5 2.5 0 016.5 8H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconExam() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V7l-5-5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function IconScan() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 3H5a2 2 0 00-2 2v2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M17 21h2a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconPulse() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19V5M8 19v-6M12 19V9M16 19v-4M20 19v-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const quickLinks = [
  { to: "/courses", title: "Kurslar", desc: "Tələbə və bilet", tint: "from-sky-50 to-indigo-50/80" },
  { to: "/exams", title: "İmtahanlar", desc: "Suallar və açar", tint: "from-violet-50 to-fuchsia-50/80" },
  { to: "/designer", title: "Dizayn", desc: "OMR vərəqi", tint: "from-amber-50 to-orange-50/80" },
  { to: "/scan", title: "Skan", desc: "Sessiya və yükləmə", tint: "from-emerald-50 to-teal-50/80" },
  { to: "/reports", title: "Nəticələr", desc: "Export və təhlil", tint: "from-rose-50 to-pink-50/80" }
] as const;

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const enabled = Boolean(token);
  const isStudent = user?.role === "student";

  const brandingQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: getPublicSettings,
    staleTime: 60_000
  });
  const systemName = brandingQuery.data?.system_name ?? "OMR imtahan sistemi";

  const studentProfileQuery = useQuery({
    queryKey: ["me-student-profile"],
    queryFn: fetchStudentProfile,
    enabled: enabled && isStudent
  });

  const coursesQuery = useQuery({
    queryKey: ["courses"],
    queryFn: listCourses,
    enabled: enabled && !isStudent
  });
  const examsQuery = useQuery({
    queryKey: ["exams"],
    queryFn: () => listExams(),
    enabled: enabled && !isStudent
  });
  const sessionsQuery = useQuery({
    queryKey: ["scan-sessions"],
    queryFn: listScanSessions,
    enabled: enabled && !isStudent
  });

  const loading = coursesQuery.isLoading || examsQuery.isLoading || sessionsQuery.isLoading;
  const error =
    coursesQuery.isError || examsQuery.isError || sessionsQuery.isError
      ? (coursesQuery.error ?? examsQuery.error ?? sessionsQuery.error)
      : null;

  const courses = coursesQuery.data ?? [];
  const exams = examsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];

  const examTitles = new Map(exams.map((e) => [e.id, e.title]));
  const activeCourses = courses.filter((c) => c.is_active).length;
  const activeExams = exams.filter((e) => e.is_active).length;
  const sessionsOpen = sessions.filter((s) => {
    const k = normStatus(s.status);
    return k === "pending" || k === "processing";
  }).length;
  const sessionsDone = sessions.filter((s) => normStatus(s.status) === "done").length;
  const recentSessions = sessions.slice(0, 7);

  const isOperator = user?.role === "operator";

  if (isStudent) {
    const spLoading = studentProfileQuery.isLoading;
    const spErr = studentProfileQuery.isError;
    const sp = studentProfileQuery.data;

    return (
      <div className="mx-auto max-w-6xl space-y-10 pb-8">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 px-6 py-10 text-white shadow-xl sm:px-10">
          <div className="relative max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Şagird kabineti</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{systemName}</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
              Xoş gəldiniz, <span className="font-semibold text-white">{user?.full_name}</span>. İmtahan nəticələri və
              statistikalar üçün{" "}
              <Link className="font-semibold text-emerald-300 underline-offset-2 hover:underline" to="/profil">
                Profilim
              </Link>{" "}
              səhifəsinə keçin.
            </p>
          </div>
        </section>

        {spLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200/80" />
            ))}
          </div>
        ) : spErr || !sp ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
            Profil məlumatı yüklənmədi. Administrator şagird hesabınızı düzgün qeydiyyata bağlayıb-bağlamadığını yoxlayın.
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">İmtahanlar</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{sp.stats.distinct_exams}</p>
                <p className="mt-1 text-sm text-slate-600">fərqli imtahan</p>
              </div>
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cəhdlər</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{sp.stats.total_attempts}</p>
                <p className="mt-1 text-sm text-slate-600">ümumi skan nəticəsi</p>
              </div>
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orta faiz</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                  {sp.stats.average_percent != null ? `${sp.stats.average_percent}%` : "—"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ən yaxşı</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                  {sp.stats.best_percent != null ? `${sp.stats.best_percent}%` : "—"}
                </p>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-5 py-4">
              <p className="text-sm text-emerald-950">
                Tam tarixçə, ballar və statuslar üçün şəxsi profilə keçin.
              </p>
              <Link
                to="/profil"
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-800"
              >
                Profilim →
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 px-6 py-10 text-white shadow-xl sm:px-10">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/4 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl"
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">İdarə paneli</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{systemName}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
            {user ? (
              <>
                Xoş gəldiniz, <span className="font-semibold text-white">{user.full_name}</span>. Bu səhifədə ümumi
                göstəricilər, son skan sessiyaları və tez keçidlər toplanıb.
              </>
            ) : (
              <>Statistikalar üçün daxil olun.</>
            )}
          </p>
          {isOperator ? (
            <p className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-100">
              Operator hesabı: menecer tərəfindən təyin olunduğunuz kursların imtahanları və skan sessiyaları aşağıda
              görünür; kurs panelindən biletlər və şagirdlər üzrə işləyə bilərsiniz.
            </p>
          ) : null}
        </div>
      </section>

      {!token ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-950 shadow-sm">
          <Link className="font-semibold text-indigo-700 underline-offset-2 hover:underline" to="/login">
            Giriş
          </Link>{" "}
          — ətraflı məlumat üçün autentifikasiya lazımdır.
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-200/80" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
          Məlumat yüklənmədi. Səhifəni yeniləyin və ya bir az sonra təkrar cəhd edin.
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ümumi göstəricilər">
          <BentoStat
            title="Kurslar"
            value={courses.length}
            subtitle={activeCourses > 0 ? `${activeCourses} aktiv` : "Aktiv kurs yoxdur"}
            gradient="hover:from-sky-50/50"
            icon={<IconCourse />}
          />
          <BentoStat
            title="İmtahanlar"
            value={exams.length}
            subtitle={activeExams > 0 ? `${activeExams} aktiv` : undefined}
            gradient="hover:from-violet-50/50"
            icon={<IconExam />}
          />
          <BentoStat
            title="Skan sessiyaları"
            value={sessions.length}
            subtitle="Ümumi yaradılmış"
            gradient="hover:from-emerald-50/50"
            icon={<IconScan />}
          />
          <BentoStat
            title="Açıq işlər"
            value={sessionsOpen}
            subtitle={sessionsDone > 0 ? `${sessionsDone} tamamlanıb` : undefined}
            gradient="hover:from-amber-50/50"
            icon={<IconPulse />}
          />
        </section>
      )}

      <section className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Son skan sessiyaları</h2>
              <p className="text-sm text-slate-500">Ən son yaradılanlar üzrə qısa icmal</p>
            </div>
            <Link
              to="/scan"
              className="hidden text-sm font-medium text-indigo-600 hover:text-indigo-800 sm:inline hover:underline"
            >
              Skan paneli →
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100">
            {!token ? (
              <p className="p-8 text-center text-sm text-slate-500">Girişdən sonra sessiyalar görünəcək.</p>
            ) : loading ? (
              <div className="space-y-2 p-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : recentSessions.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-slate-600">Hələ sessiya yoxdur.</p>
                <Link
                  to="/scan"
                  className="mt-3 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                >
                  Sessiya yarat
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">ID</th>
                      <th className="px-5 py-3.5">İmtahan</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Şəkillər</th>
                      <th className="px-5 py-3.5">Tarix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentSessions.map((s) => (
                      <tr key={s.id} className="transition hover:bg-slate-50/90">
                        <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-600">#{s.id}</td>
                        <td className="max-w-[220px] truncate px-5 py-3.5 font-medium text-slate-800" title={examTitles.get(s.exam_id)}>
                          {examTitles.get(s.exam_id) ?? `İmtahan #${s.exam_id}`}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusBadgeClass(s.status)}`}
                          >
                            {statusLabel(s.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 tabular-nums text-slate-600">
                          {s.processed_images}/{s.total_images}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">{formatDate(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Tez keçidlər</h2>
          <p className="mb-4 text-sm text-slate-500">Tez-tez istifadə olunan bölmələr</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {quickLinks.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`group flex flex-col rounded-2xl border border-slate-200/90 bg-gradient-to-br p-4 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md ${item.tint}`}
                >
                  <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-800">{item.title}</span>
                  <span className="mt-0.5 text-xs text-slate-600">{item.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
