import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import axios from "axios";
import { listCourses, listStudents } from "../../api/courses";
import { createAdminUser, deleteUser, listUsers } from "../../api/users";

type FormValues = {
  email: string;
  full_name: string;
  password: string;
  role: "admin" | "operator" | "student";
  pick_course_id: string;
  pick_student_id: string;
};

function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: string } | undefined;
    if (typeof d?.detail === "string") return d.detail;
  }
  return "Xəta baş verdi.";
}

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  operator: "Operator",
  manager: "Menecer",
  student: "Şagird"
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, watch } = useForm<FormValues>({
    defaultValues: { role: "operator", pick_course_id: "", pick_student_id: "" }
  });
  const role = watch("role");
  const pickCourseId = watch("pick_course_id");

  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: listUsers });
  const coursesQuery = useQuery({ queryKey: ["courses"], queryFn: listCourses });
  const studentsQuery = useQuery({
    queryKey: ["course-students-pick", pickCourseId],
    queryFn: () => listStudents(Number(pickCourseId)),
    enabled: role === "student" && pickCourseId !== "" && Number.isFinite(Number(pickCourseId)) && Number(pickCourseId) > 0
  });

  const createMut = useMutation({
    mutationFn: createAdminUser,
    onSuccess: async () => {
      reset({ email: "", full_name: "", password: "", role: "operator", pick_course_id: "", pick_student_id: "" });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    }
  });
  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    }
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">İstifadəçilər</h1>
        <p className="mt-1 text-slate-600">
          Yeni administrator, operator və ya şagird hesabı yaradın. Şagird üçün əvvəlcə kursda şagird qeydiyyatı olmalıdır;
          şagird öz profilində imtahan nəticələrini görür. Menecerlər kurs yaradılarkən təyin olunur.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Yeni hesab</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit((v) => {
            if (v.role === "student") {
              const sid = Number(v.pick_student_id);
              if (!v.pick_student_id || !Number.isFinite(sid)) {
                window.alert("Şagird seçin.");
                return;
              }
              createMut.mutate({
                email: v.email,
                full_name: v.full_name,
                password: v.password,
                role: "student",
                linked_student_id: sid
              });
              return;
            }
            createMut.mutate({
              email: v.email,
              full_name: v.full_name,
              password: v.password,
              role: v.role === "admin" ? "admin" : "operator"
            });
          })}
        >
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Tam ad</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-violet-500 focus:ring-2"
              {...register("full_name", { required: true })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">E-poçt</label>
            <input
              type="email"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-violet-500 focus:ring-2"
              {...register("email", { required: true })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Şifrə</label>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-violet-500 focus:ring-2"
              {...register("password", { required: true, minLength: 6 })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Rol</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-violet-500 focus:ring-2"
              {...register("role", { required: true })}
            >
              <option value="operator">Operator</option>
              <option value="admin">Administrator</option>
              <option value="student">Şagird</option>
            </select>
          </div>
          {role === "student" ? (
            <>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Kurs</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-violet-500 focus:ring-2"
                  {...register("pick_course_id", { required: role === "student" })}
                >
                  <option value="">— kurs seçin —</option>
                  {(coursesQuery.data ?? []).map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Şagird qeydiyyatı</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-violet-500 focus:ring-2 disabled:bg-slate-100"
                  disabled={!pickCourseId || studentsQuery.isLoading}
                  {...register("pick_student_id")}
                >
                  <option value="">— şagird seçin —</option>
                  {(studentsQuery.data ?? []).map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      #{s.id} · {s.student_number} · {s.full_name}
                    </option>
                  ))}
                </select>
                {!pickCourseId ? (
                  <p className="mt-1 text-xs text-slate-500">Əvvəl kurs seçin.</p>
                ) : studentsQuery.isError ? (
                  <p className="mt-1 text-xs text-red-600">Şagird siyahısı yüklənmədi.</p>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="flex items-end sm:col-span-2">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-violet-700 disabled:opacity-50"
            >
              {createMut.isPending ? "Gözləyin…" : "Əlavə et"}
            </button>
          </div>
        </form>
        {createMut.isError ? <p className="mt-3 text-sm text-red-600">{errMsg(createMut.error)}</p> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Siyahı</h2>
        </div>
        {usersQuery.isLoading ? (
          <div className="space-y-2 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Ad</th>
                  <th className="px-6 py-3">E-poçt</th>
                  <th className="px-6 py-3">Rol</th>
                  <th className="px-6 py-3">Şagird ID</th>
                  <th className="px-6 py-3">Yaradılıb</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(usersQuery.data ?? []).map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-3 font-mono text-slate-600">{u.id}</td>
                    <td className="px-6 py-3 font-medium text-slate-900">{u.full_name}</td>
                    <td className="px-6 py-3 text-slate-700">{u.email}</td>
                    <td className="px-6 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {roleLabels[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-slate-600">
                      {u.linked_student_id != null ? u.linked_student_id : "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-500">
                      {new Date(u.created_at).toLocaleDateString("az-AZ")}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-40"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (window.confirm(`${u.full_name} silinsin?`)) deleteMut.mutate(u.id);
                        }}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {deleteMut.isError ? (
          <p className="border-t border-slate-100 px-6 py-3 text-sm text-red-600">{errMsg(deleteMut.error)}</p>
        ) : null}
      </section>
    </div>
  );
}
