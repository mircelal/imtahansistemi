import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import axios from "axios";
import { createAdminUser, deleteUser, listUsers } from "../../api/users";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import { getRoleLabel, type UserRole } from "../../design/tokens";
import { formatDate } from "../../utils/dateFormat";

type FormValues = {
  email: string;
  full_name: string;
  password: string;
  role: "admin" | "operator";
};

function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: string } | undefined;
    if (typeof d?.detail === "string") return d.detail;
  }
  return "Xəta baş verdi.";
}

function toUserRole(role: string): UserRole {
  return (["admin", "manager", "operator", "student"].includes(role) ? role : "operator") as UserRole;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { role: "operator" }
  });

  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: listUsers });

  const createMut = useMutation({
    mutationFn: createAdminUser,
    onSuccess: async () => {
      reset({ email: "", full_name: "", password: "", role: "operator" });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    }
  });
  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    }
  });

  const staffUsers = (usersQuery.data ?? []).filter((u) => u.role !== "student");
  const studentUsers = (usersQuery.data ?? []).filter((u) => u.role === "student");

  return (
    <div className="page-container">
      <PageHeader
        title="İstifadəçilər"
        subtitle="Administrator və operator hesabları. Şagird kabinetləri «Şagirdlər» bölməsində — imtahan qeydiyyatına bağlanır. Menecerlər kurs yaradılarkən təyin olunur."
      />

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Yeni işçi hesabı</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit((v) => {
            createMut.mutate({
              email: v.email,
              full_name: v.full_name,
              password: v.password,
              role: v.role
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
            </select>
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? "Gözləyin…" : "Əlavə et"}
            </Button>
          </div>
        </form>
        {createMut.isError ? <p className="mt-3 text-sm text-red-600">{errMsg(createMut.error)}</p> : null}
      </Card>

      <Card padding="none" className="mt-6">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">İşçi hesabları</h2>
        </div>
        {usersQuery.isLoading ? (
          <div className="space-y-2 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Ad</th>
                  <th className="px-6 py-3">E-poçt</th>
                  <th className="px-6 py-3">Rol</th>
                  <th className="px-6 py-3">Yaradılıb</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-3 font-mono text-slate-600">{u.id}</td>
                    <td className="px-6 py-3 font-medium text-slate-900">{u.full_name}</td>
                    <td className="px-6 py-3 text-slate-700">{u.email}</td>
                    <td className="px-6 py-3">
                      <Badge role={toUserRole(u.role)}>{getRoleLabel(u.role)}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-500">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-800"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (window.confirm(`${u.full_name} silinsin?`)) deleteMut.mutate(u.id);
                        }}
                      >
                        Sil
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {studentUsers.length > 0 && (
        <Card padding="none" className="mt-6">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Şagird kabinetləri</h2>
            <p className="mt-1 text-sm text-slate-500">
              Yeni kabinetlər{" "}
              <Link to="/students" className="font-medium text-violet-700 hover:underline">
                Şagirdlər
              </Link>{" "}
              səhifəsində yaradılır; burada yalnız siyahı və silmə.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="px-6 py-3">E-poçt</th>
                  <th className="px-6 py-3">Ad</th>
                  <th className="px-6 py-3">Qeydiyyat ID</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="px-6 py-3 text-slate-700">{u.email}</td>
                    <td className="px-6 py-3 font-medium text-slate-900">{u.full_name}</td>
                    <td className="px-6 py-3 font-mono text-xs text-slate-600">
                      {u.linked_student_id != null ? `#${u.linked_student_id}` : "—"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {u.linked_student_id != null ? (
                        <Link
                          to={`/students?student=${u.linked_student_id}`}
                          className="mr-3 text-sm font-medium text-violet-700 hover:underline"
                        >
                          Detallı bax
                        </Link>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-800"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (window.confirm(`${u.email} kabineti silinsin?`)) deleteMut.mutate(u.id);
                        }}
                      >
                        Sil
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {deleteMut.isError ? (
        <p className="mt-3 text-sm text-red-600">{errMsg(deleteMut.error)}</p>
      ) : null}
    </div>
  );
}
