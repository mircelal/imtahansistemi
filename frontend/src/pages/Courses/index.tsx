import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import {
  createCourse,
  deleteCourse,
  deleteCourseLogo,
  getCourseDashboard,
  listCourses,
  uploadCourseLogo,
  type Course
} from "../../api/courses";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { useAuthStore } from "../../store/authStore";

type CourseForm = {
  name: string;
  description: string;
  manager_id: number;
};

function CourseCard({
  course,
  stats
}: {
  course: Course;
  stats?: { students: number; exams: number; tickets: number };
}) {
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md">
      <div className="flex items-start gap-4">
        {course.has_logo ? (
          <img
            src={`/api/courses/${course.id}/logo?t=${course.id}`}
            alt=""
            className="h-12 w-12 rounded-xl border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-lg font-bold text-brand">
            {course.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-slate-900">{course.name}</h3>
            {!course.is_active ? <Badge variant="warning">Qeyri-aktiv</Badge> : null}
          </div>
          {course.description ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{course.description}</p> : null}
        </div>
      </div>

      {stats ? (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-slate-50 py-2">
            <p className="font-bold tabular-nums text-slate-900">{stats.students}</p>
            <p className="text-slate-500">Şagird</p>
          </div>
          <div className="rounded-lg bg-slate-50 py-2">
            <p className="font-bold tabular-nums text-slate-900">{stats.exams}</p>
            <p className="text-slate-500">İmtahan</p>
          </div>
          <div className="rounded-lg bg-slate-50 py-2">
            <p className="font-bold tabular-nums text-slate-900">{stats.tickets}</p>
            <p className="text-slate-500">Bilet</p>
          </div>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2">
        <Link
          to={`/courses/${course.id}`}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Panel
        </Link>
      </div>
    </article>
  );
}

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");

  const { register, handleSubmit, reset } = useForm<CourseForm>({
    defaultValues: { manager_id: user?.id ?? 1 }
  });

  const coursesQuery = useQuery({ queryKey: ["courses"], queryFn: listCourses });

  const dashboardQueries = useQueries({
    queries: (coursesQuery.data ?? []).map((c) => ({
      queryKey: ["course-dashboard", c.id],
      queryFn: () => getCourseDashboard(c.id),
      enabled: coursesQuery.isSuccess
    }))
  });

  const statsByCourse = useMemo(() => {
    const map = new Map<number, { students: number; exams: number; tickets: number }>();
    (coursesQuery.data ?? []).forEach((c, i) => {
      const d = dashboardQueries[i]?.data;
      if (d) {
        map.set(c.id, {
          students: d.stats.students_count,
          exams: d.stats.exams_own_count,
          tickets: d.stats.tickets_active_count
        });
      }
    });
    return map;
  }, [coursesQuery.data, dashboardQueries]);

  const aggregate = useMemo(() => {
    const courses = coursesQuery.data ?? [];
    let students = 0;
    statsByCourse.forEach((s) => {
      students += s.students;
    });
    return {
      total: courses.length,
      active: courses.filter((c) => c.is_active).length,
      students
    };
  }, [coursesQuery.data, statsByCourse]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coursesQuery.data ?? [];
    return (coursesQuery.data ?? []).filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q)
    );
  }, [coursesQuery.data, search]);

  const createMutation = useMutation({
    mutationFn: (payload: CourseForm) =>
      createCourse({
        name: payload.name,
        description: payload.description,
        manager_id: Number(payload.manager_id),
        is_active: true
      }),
    onSuccess: async () => {
      reset({ name: "", description: "", manager_id: user?.id ?? 1 });
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCourse,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
    }
  });

  const logoMutation = useMutation({
    mutationFn: ({ courseId, file }: { courseId: number; file: File }) => uploadCourseLogo(courseId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
    }
  });

  const logoDelMutation = useMutation({
    mutationFn: deleteCourseLogo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
    }
  });

  return (
    <div className="page-container-wide space-y-8">
      <PageHeader
        title="Kurslar"
        subtitle="Təhsil mərkəzləri, operatorlar, imtahanlar və bilet satışı üzrə idarəetmə."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Cəmi kurs" value={aggregate.total} />
        <StatCard label="Aktiv kurs" value={aggregate.active} accent="success" />
        <StatCard label="Ümumi şagird" value={aggregate.students} accent="info" />
      </div>

      {user && user.role !== "operator" && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Yeni kurs</h2>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_120px_auto]"
            onSubmit={handleSubmit((v) => createMutation.mutate(v))}
          >
            <input
              className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="Kurs adı"
              {...register("name", { required: true })}
            />
            <input
              className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="Təsvir"
              {...register("description")}
            />
            {user.role === "admin" ? (
              <input
                type="number"
                className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                title="Menecer istifadəçi ID"
                {...register("manager_id", { valueAsNumber: true })}
              />
            ) : (
              <input type="hidden" {...register("manager_id", { valueAsNumber: true })} />
            )}
            <Button type="submit" disabled={createMutation.isPending}>
              Əlavə et
            </Button>
          </form>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Kurs axtar…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm"
        />
      </div>

      {coursesQuery.isLoading ? (
        <p className="text-slate-600">Yüklənir…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="Kurs tapılmadı" description="Yeni kurs yaradın və ya axtarışı dəyişin." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course) => (
            <div key={course.id} className="relative">
              <CourseCard course={course} stats={statsByCourse.get(course.id)} />
              {user && (user.role === "admin" || user.role === "manager") && (
                <div className="mt-2 flex flex-wrap gap-2 px-1 text-xs">
                  <label className="cursor-pointer text-brand hover:underline">
                    Logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) logoMutation.mutate({ courseId: course.id, file: f });
                      }}
                    />
                  </label>
                  {course.has_logo ? (
                    <button type="button" className="text-slate-500 hover:underline" onClick={() => logoDelMutation.mutate(course.id)}>
                      Logonu sil
                    </button>
                  ) : null}
                  {user.role === "admin" || user.role === "manager" ? (
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => {
                        if (window.confirm(`«${course.name}» silinsin?`)) deleteMutation.mutate(course.id);
                      }}
                    >
                      Sil
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "success" | "info" }) {
  const tone =
    accent === "success"
      ? "from-emerald-50 to-white"
      : accent === "info"
        ? "from-sky-50 to-white"
        : "from-slate-50 to-white";
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-gradient-to-br ${tone} p-5 shadow-sm ring-1 ring-slate-100`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
