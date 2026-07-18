import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { listOperators } from "../../../api/auth";
import {
  attachCourseOperator,
  detachCourseOperator,
  inviteCourseOperator,
  listCourseOperators
} from "../../../api/courses";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";

type InviteOperatorForm = {
  email: string;
  full_name: string;
  password: string;
};

type Props = {
  courseId: number;
  canManage: boolean;
};

export default function OperatorsTab({ courseId, canManage }: Props) {
  const qc = useQueryClient();
  const [attachUserId, setAttachUserId] = useState("");

  const inviteForm = useForm<InviteOperatorForm>({
    defaultValues: { email: "", full_name: "", password: "" }
  });

  const operatorsQ = useQuery({
    queryKey: ["course-operators", courseId],
    queryFn: () => listCourseOperators(courseId),
    enabled: canManage
  });

  const poolQ = useQuery({
    queryKey: ["auth-operators-pool"],
    queryFn: listOperators,
    enabled: canManage
  });

  const assignedIds = new Set((operatorsQ.data ?? []).map((o) => o.user_id));
  const attachCandidates = (poolQ.data ?? []).filter((u) => u.role === "operator" && !assignedIds.has(u.id));

  const attachMut = useMutation({
    mutationFn: () => attachCourseOperator(courseId, Number(attachUserId)),
    onSuccess: async () => {
      setAttachUserId("");
      await qc.invalidateQueries({ queryKey: ["course-operators", courseId] });
      await qc.invalidateQueries({ queryKey: ["course-dashboard", courseId] });
    }
  });

  const inviteMut = useMutation({
    mutationFn: (payload: InviteOperatorForm) => inviteCourseOperator(courseId, payload),
    onSuccess: async () => {
      inviteForm.reset();
      await qc.invalidateQueries({ queryKey: ["course-operators", courseId] });
      await qc.invalidateQueries({ queryKey: ["auth-operators-pool"] });
      await qc.invalidateQueries({ queryKey: ["course-dashboard", courseId] });
    }
  });

  const detachMut = useMutation({
    mutationFn: (operatorUserId: number) => detachCourseOperator(courseId, operatorUserId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["course-operators", courseId] });
      await qc.invalidateQueries({ queryKey: ["course-dashboard", courseId] });
    }
  });

  if (!canManage) {
    return (
      <EmptyState
        title="Giriş məhdudiyyəti"
        description="Operator idarəetməsi yalnız menecer və administrator üçündür."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Kurs operatorları</h2>
        <p className="mt-1 text-sm text-slate-600">
          Operatorlar bu kurs üzrə imtahan, bilet, şagirdlər və skan ilə işləyə bilər.
        </p>

        <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
          <div className="min-w-[220px] flex-1">
            <label className="block text-xs font-medium text-slate-700">Mövcud operator təyin et</label>
            <div className="mt-1 flex gap-2">
              <select
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={attachUserId}
                onChange={(e) => setAttachUserId(e.target.value)}
              >
                <option value="">— seçin —</option>
                {attachCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={attachUserId === "" || attachMut.isPending}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => attachMut.mutate()}
              >
                Əlavə et
              </button>
            </div>
          </div>
        </div>

        <form
          className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3"
          onSubmit={inviteForm.handleSubmit((v) => inviteMut.mutate(v))}
        >
          <p className="sm:col-span-3 text-sm font-medium text-slate-800">Yeni operator hesabı + təyin</p>
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Tam ad" {...inviteForm.register("full_name", { required: true })} />
          <input type="email" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="E-poçt" {...inviteForm.register("email", { required: true })} />
          <input type="password" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Şifrə (min. 6)" autoComplete="new-password" {...inviteForm.register("password", { required: true, minLength: 6 })} />
          <button type="submit" disabled={inviteMut.isPending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-3">
            Operator yarat və kursa bağla
          </button>
        </form>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Təyin olunublar</p>
          {operatorsQ.isLoading ? (
            <p className="mt-2 text-sm text-slate-600">Yüklənir…</p>
          ) : (operatorsQ.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Hələ operator yoxdur.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {(operatorsQ.data ?? []).map((op) => (
                <li key={op.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    <strong className="text-slate-900">{op.full_name}</strong>
                    <span className="text-slate-600"> · {op.email}</span>
                  </span>
                  <button
                    type="button"
                    className="text-red-600 hover:underline disabled:opacity-50"
                    disabled={detachMut.isPending}
                    onClick={() => {
                      if (window.confirm(`${op.full_name} bu kursdan çıxarılsın?`)) detachMut.mutate(op.user_id);
                    }}
                  >
                    Çıxar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
