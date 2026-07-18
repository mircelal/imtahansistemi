import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { listCourses } from "../../api/courses";
import type { StudentListRow } from "../../api/studentsAdmin";
import {
  createAdminStudent,
  getAdminStudentProfile,
  getAdminStudentsSummary,
  getCourseStudentsSummary,
  listAdminStudents,
  listCourseStudentsPaginated
} from "../../api/studentsAdmin";
import StudentDetailDrawer from "../../components/students/StudentDetailDrawer";
import StudentsAddPanel from "../../components/students/StudentsAddPanel";
import StudentsFilters, { type StudentsFilterState } from "../../components/students/StudentsFilters";
import StudentsStats from "../../components/students/StudentsStats";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { useAuthStore } from "../../store/authStore";
import { formatDate } from "../../utils/dateFormat";

function formatDt(iso: string | null | undefined) {
  return formatDate(iso);
}

export default function StudentsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<StudentListRow | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const coursesQ = useQuery({ queryKey: ["courses"], queryFn: listCourses });
  const courses = coursesQ.data ?? [];

  const initialCourse = useMemo(() => {
    const raw = searchParams.get("course");
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    if (isAdmin) return "" as const;
    return courses[0]?.id ?? ("" as const);
  }, [searchParams, isAdmin, courses]);

  const [filters, setFilters] = useState<StudentsFilterState>({
    courseId: initialCourse,
    search: "",
    hasLogin: "",
    sort: "full_name",
    order: "asc",
    pageSize: 50
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    setFilters((f) => ({ ...f, courseId: initialCourse }));
  }, [initialCourse]);

  const listParams = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      has_login: filters.hasLogin === "yes" ? true : filters.hasLogin === "no" ? false : undefined,
      sort: filters.sort,
      order: filters.order,
      limit: filters.pageSize,
      offset: page * filters.pageSize,
      course_id: filters.courseId === "" ? undefined : Number(filters.courseId)
    }),
    [debouncedSearch, filters, page]
  );

  const canList = isAdmin || (filters.courseId !== "" && Number(filters.courseId) > 0);

  const listQ = useQuery({
    queryKey: ["students-list", listParams, isAdmin],
    queryFn: () => {
      if (isAdmin && filters.courseId === "") {
        return listAdminStudents(listParams);
      }
      const cid = Number(filters.courseId);
      return listCourseStudentsPaginated(cid, listParams);
    },
    enabled: canList
  });

  const summaryQ = useQuery({
    queryKey: ["students-summary", filters.courseId, isAdmin],
    queryFn: () => {
      if (isAdmin && filters.courseId === "") {
        return getAdminStudentsSummary();
      }
      return getCourseStudentsSummary(Number(filters.courseId));
    },
    enabled: canList
  });

  useEffect(() => {
    setPage(0);
  }, [filters.courseId, debouncedSearch, filters.hasLogin, filters.sort, filters.order, filters.pageSize]);

  useEffect(() => {
    const sid = Number(searchParams.get("student"));
    if (!sid || !listQ.data?.items.length) return;
    const cid = Number(searchParams.get("course"));
    const row = listQ.data.items.find((r) => r.id === sid && (!cid || r.course_id === cid));
    if (row) setSelected(row);
  }, [searchParams, listQ.data]);

  const deepLinkStudentId = Number(searchParams.get("student"));
  const deepLinkQ = useQuery({
    queryKey: ["student-deeplink", deepLinkStudentId],
    queryFn: () => getAdminStudentProfile(deepLinkStudentId),
    enabled: Number.isFinite(deepLinkStudentId) && deepLinkStudentId > 0 && !selected
  });

  useEffect(() => {
    if (!deepLinkQ.data || selected) return;
    const already = listQ.data?.items.some((r) => r.id === deepLinkQ.data!.student.id);
    if (already) return;
    const p = deepLinkQ.data;
    setSelected({
      id: p.student.id,
      course_id: p.student.course_id,
      course_name: p.student.course_name,
      student_number: p.student.student_number,
      full_name: p.student.full_name,
      created_at: p.account.member_since,
      login_user_id: p.account.user_id,
      login_email: p.account.email !== "—" ? p.account.email : null,
      has_login: p.account.email !== "—",
      exam_count: p.stats.distinct_exams,
      last_percent: p.stats.best_percent,
      last_graded_at: p.stats.last_graded_at
    });
    if (!searchParams.get("course")) {
      const next = new URLSearchParams(searchParams);
      next.set("course", String(p.student.course_id ?? ""));
      setSearchParams(next, { replace: true });
    }
  }, [deepLinkQ.data, selected, listQ.data, searchParams, setSearchParams]);

  const qc = useQueryClient();
  const adminForm = useForm<{
    full_name: string;
    student_number: string;
    fin_code: string;
    email: string;
    password: string;
  }>({
    defaultValues: { full_name: "", student_number: "", fin_code: "", email: "", password: "" },
  });
  const adminCreateMut = useMutation({
    mutationFn: (v: {
      full_name: string;
      student_number: string;
      fin_code: string;
      email: string;
      password: string;
    }) =>
      createAdminStudent({
        full_name: v.full_name.trim(),
        student_number: v.student_number.trim() || undefined,
        fin_code: v.fin_code.trim().toUpperCase() || undefined,
        email: v.email.trim() || undefined,
        password: v.password || undefined,
      }),
    onSuccess: async () => {
      adminForm.reset();
      await qc.invalidateQueries({ queryKey: ["students-list"] });
      await qc.invalidateQueries({ queryKey: ["students-summary"] });
    },
  });

  const onFilterChange = (next: Partial<StudentsFilterState>) => {
    setFilters((f) => {
      const merged = { ...f, ...next };
      if (next.courseId !== undefined) {
        if (merged.courseId === "") {
          searchParams.delete("course");
        } else {
          searchParams.set("course", String(merged.courseId));
        }
        setSearchParams(searchParams, { replace: true });
      }
      return merged;
    });
  };

  const exportCsv = () => {
    const rows = listQ.data?.items ?? [];
    const header = ["Kod", "Ad", "FIN", "Kurs", "Kabinet", "İmtahan", "Son faiz", "Son tarix"];
    const lines = rows.map((r) =>
      [
        r.student_number,
        r.full_name,
        r.fin_code ?? "",
        r.course_name,
        r.login_email ?? "",
        r.exam_count,
        r.last_percent ?? "",
        r.last_graded_at ?? ""
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shagirdler.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const addCourseId = filters.courseId === "" ? courses[0]?.id : Number(filters.courseId);

  return (
    <div className="page-container-wide space-y-6">
      <PageHeader
        title="Şagirdlər"
        subtitle="İmtahan qeydiyyatı (OMR kodu), kabinet hesabları, nəticələr və statistika — bir paneldə."
        action={
          <button
            type="button"
            onClick={exportCsv}
            disabled={!listQ.data?.items.length}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            CSV export
          </button>
        }
      />

      <StudentsStats summary={summaryQ.data} loading={summaryQ.isLoading} />

      <StudentsFilters courses={courses} isAdmin={isAdmin} filters={filters} onChange={onFilterChange} />

      {addCourseId && filters.courseId !== "" ? (
        <StudentsAddPanel courseId={addCourseId} onSuccess={() => listQ.refetch()} />
      ) : isAdmin && filters.courseId === "" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Kurssuz şagird yarat</h2>
          <p className="mt-1 text-xs text-slate-500">
            Kurs məcburi deyil. FIN və ya e-poçt + şifrə versəniz kabinet açılır.
          </p>
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={adminForm.handleSubmit((v) => adminCreateMut.mutate(v))}
          >
            <input
              className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm"
              placeholder="Ad Soyad"
              {...adminForm.register("full_name", { required: true })}
            />
            <input
              className="w-28 rounded-lg border border-slate-200 px-2 py-2 font-mono text-sm uppercase"
              placeholder="FIN"
              maxLength={7}
              {...adminForm.register("fin_code")}
            />
            <input
              className="w-28 rounded-lg border border-slate-200 px-2 py-2 font-mono text-sm"
              placeholder="OMR kod"
              maxLength={6}
              {...adminForm.register("student_number")}
            />
            <input
              type="email"
              className="min-w-[140px] flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm"
              placeholder="E-poçt (opsional)"
              {...adminForm.register("email")}
            />
            <input
              type="password"
              className="w-36 rounded-lg border border-slate-200 px-2 py-2 text-sm"
              placeholder="Şifrə"
              {...adminForm.register("password")}
            />
            <button
              type="submit"
              disabled={adminCreateMut.isPending}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Yarat
            </button>
          </form>
          {adminCreateMut.isError ? (
            <p className="mt-2 text-sm text-red-600">Yaradılmadı — kod və ya e-poçt təkrarlanır.</p>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-amber-800">Yeni şagird əlavə etmək üçün kurs seçin.</p>
      )}

      {!canList && !coursesQ.isLoading ? (
        <EmptyState
          title="Kurs yoxdur"
          description="Əvvəlcə kurs yaradın və ya giriş hüququnuzu yoxlayın."
          action={
            <Link to="/courses" className="text-indigo-600 hover:underline">
              Kurslar
            </Link>
          }
        />
      ) : null}

      {listQ.isLoading ? (
        <p className="text-slate-600">Siyahı yüklənir…</p>
      ) : listQ.isError ? (
        <p className="text-red-600">Siyahı yüklənmədi.</p>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Kod</th>
                  <th className="px-4 py-3">Ad</th>
                  <th className="px-4 py-3">FIN</th>
                  {isAdmin && filters.courseId === "" ? <th className="px-4 py-3">Kurs</th> : null}
                  <th className="px-4 py-3">Kabinet</th>
                  <th className="px-4 py-3">İmtahan</th>
                  <th className="px-4 py-3">Son faiz</th>
                  <th className="px-4 py-3">Son tarix</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(listQ.data?.items ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                      Filtrə uyğun şagird tapılmadı.
                    </td>
                  </tr>
                ) : (
                  listQ.data!.items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-semibold">{r.student_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.full_name}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-slate-700">
                        {r.fin_code || "—"}
                      </td>
                      {isAdmin && filters.courseId === "" ? (
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {r.course_name || "Kurs təyin olunmayıb"}
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        {r.has_login ? (
                          <Badge variant="success" className="font-normal">
                            {r.login_email}
                          </Badge>
                        ) : (
                          <Badge variant="warning">Yoxdur</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{r.exam_count}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {r.last_percent != null ? `${r.last_percent}%` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                        {formatDt(r.last_graded_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="text-sm font-medium text-violet-700 hover:underline"
                          onClick={() => setSelected(r)}
                        >
                          Bax
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>
              Cəmi: <strong>{total}</strong> · Səhifə {page + 1} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 0}
                className="rounded-md border px-3 py-1 disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← Əvvəl
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                className="rounded-md border px-3 py-1 disabled:opacity-40"
                onClick={() => setPage((p) => p + 1)}
              >
                Sonra →
              </button>
            </div>
          </div>
        </section>
      )}

      {selected ? (
        <StudentDetailDrawer
          row={selected}
          onClose={() => {
            setSelected(null);
            searchParams.delete("student");
            setSearchParams(searchParams, { replace: true });
          }}
          onUpdated={() => {
            listQ.refetch();
            summaryQ.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
