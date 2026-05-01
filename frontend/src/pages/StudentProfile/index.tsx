import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchStudentProfile } from "../../api/studentPortal";

const inputCard =
  "rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm ring-1 ring-slate-100";

function formatDt(iso: string | null | undefined) {
  if (!iso) return "—";
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

function statusAz(status: string) {
  const k = status.toLowerCase();
  const map: Record<string, string> = {
    ok: "Hesablanıb",
    manual_review: "Manual yoxlama",
    error: "Xəta"
  };
  return map[k] ?? status;
}

export default function StudentProfilePage() {
  const q = useQuery({ queryKey: ["me-student-profile"], queryFn: fetchStudentProfile });

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
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
      <div className={`mx-auto max-w-2xl ${inputCard}`}>
        <h1 className="text-lg font-semibold text-slate-900">Profil yüklənmədi</h1>
        <p className="mt-2 text-sm text-slate-600">
          Hesabınız şagird əlavə edilmiş istifadəçi olmalıdır. Əgər administrator hesabınızdırsa, bu səhifə mövcud
          deyil.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline">
          İdarə panelinə qayıt
        </Link>
      </div>
    );
  }

  const { student, stats, results } = q.data!;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-6 py-9 text-white shadow-xl sm:px-10">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl"
          aria-hidden
        />
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Şagird profili</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{student.full_name}</h1>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-300">
          <span>
            Kod: <strong className="font-semibold text-white">{student.student_number}</strong>
          </span>
          <span>
            Kurs: <strong className="font-semibold text-white">{student.course_name}</strong>
          </span>
        </div>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/15"
        >
          ← İdarə paneli
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Statistika">
        <div className={inputCard}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">İmtahan sayı</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{stats.distinct_exams}</p>
          <p className="mt-1 text-sm text-slate-600">Fərqli imtahan üzrə çıxış</p>
        </div>
        <div className={inputCard}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ümumi cəhd</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{stats.total_attempts}</p>
          <p className="mt-1 text-sm text-slate-600">Skanla qeydə alınmış</p>
        </div>
        <div className={inputCard}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orta faiz</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {stats.average_percent != null ? `${stats.average_percent}%` : "—"}
          </p>
          <p className="mt-1 text-sm text-slate-600">Balı olan nəticələr üzrə</p>
        </div>
        <div className={inputCard}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ən yaxşı / ən aşağı</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">
            {stats.best_percent != null ? `${stats.best_percent}%` : "—"}
            <span className="mx-2 font-normal text-slate-400">/</span>
            {stats.lowest_percent != null ? `${stats.lowest_percent}%` : "—"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Son hesablanma: {formatDt(stats.last_graded_at)}
          </p>
        </div>
      </section>

      <section className={inputCard}>
        <div className="mb-4 flex flex-col gap-1 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">İmtahan tarixçəsi</h2>
            <p className="text-sm text-slate-600">Bal, faiz və status — ən yenidən köhnəyə</p>
          </div>
          <p className="text-sm text-slate-500">
            Qiymətləndirilmiş: <strong className="text-slate-800">{stats.graded_attempts}</strong>
          </p>
        </div>

        {results.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            Hələ skan nəticəsi yoxdur. İmtahan keçirdikdən və vərəqin skan olunmasından sonra burada görünəcək.
          </p>
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
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {results.map((r) => (
                  <tr key={r.scan_result_id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDt(r.processed_at)}</td>
                    <td className="max-w-[240px] px-4 py-3 font-medium text-slate-900" title={r.exam_title}>
                      {r.exam_title}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.exam_scope_label}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-800">
                      {r.score != null && r.max_score != null ? (
                        <>
                          {r.score} / {r.max_score}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-800">
                      {r.percent != null ? `${r.percent}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {statusAz(r.status)}
                      </span>
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
