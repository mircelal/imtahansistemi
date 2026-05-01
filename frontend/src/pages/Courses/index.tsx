import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { createCourse, deleteCourse, deleteCourseLogo, listCourses, uploadCourseLogo } from "../../api/courses";
import { useAuthStore } from "../../store/authStore";

type CourseForm = {
  name: string;
  description: string;
  manager_id: number;
};

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { register, handleSubmit, reset } = useForm<CourseForm>({
    defaultValues: { manager_id: user?.id ?? 1 }
  });
  const coursesQuery = useQuery({ queryKey: ["courses"], queryFn: listCourses });
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
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Kurslar</h1>

      {user && user.role !== "operator" && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Yeni kurs</h2>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            onSubmit={handleSubmit((v) => createMutation.mutate(v))}
          >
            <input
              className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-3 py-2"
              placeholder="Kurs adı"
              {...register("name", { required: true })}
            />
            <input
              className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-3 py-2"
              placeholder="Təsvir"
              {...register("description")}
            />
            <input
              type="number"
              className="w-32 rounded-md border border-slate-300 px-3 py-2"
              title="İdarəçi istifadəçi ID (admin üçün)"
              {...register("manager_id", { valueAsNumber: true })}
            />
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Əlavə et
            </button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        {coursesQuery.isLoading && <p className="text-slate-600">Yüklənir...</p>}
        {coursesQuery.data?.map((course) => (
          <article
            key={course.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 className="font-semibold text-slate-900">{course.name}</h3>
              <p className="text-sm text-slate-600">{course.description}</p>
              <p className="mt-1 text-xs text-slate-500">
                İdarəçi ID: {course.manager_id}
                {course.has_logo ? (
                  <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">Logo var</span>
                ) : null}
              </p>
              {user && user.role !== "student" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
                    Logo yüklə
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) logoMutation.mutate({ courseId: course.id, file: f });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {course.has_logo && (
                    <button
                      type="button"
                      className="rounded-md border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50"
                      onClick={() => logoDelMutation.mutate(course.id)}
                    >
                      Logonu sil
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/courses/${course.id}`}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Kurs paneli
              </Link>
              {user && (user.role === "admin" || user.role === "manager") && (
                <button
                  type="button"
                  className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  onClick={() => deleteMutation.mutate(course.id)}
                >
                  Sil
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
