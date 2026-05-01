import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { listOperators } from "../../api/auth";
import { listExams } from "../../api/exams";
import { createScanSession, listScanSessions } from "../../api/scans";
import { useAuthStore } from "../../store/authStore";

type Props = {
  examFilter: number | null;
  sessionId: number | null;
  onSessionChange: (id: number | null) => void;
};

export default function ScanSessionControls({ examFilter, sessionId, onSessionChange }: Props) {
  const user = useAuthStore((s) => s.user);
  const canManageSessions = user?.role === "admin" || user?.role === "manager";
  const autoPickedRef = useRef(false);

  const sessionsQuery = useQuery({ queryKey: ["scan-sessions"], queryFn: listScanSessions });
  const examsQuery = useQuery({ queryKey: ["exams"], queryFn: () => listExams() });
  const operatorsQuery = useQuery({
    queryKey: ["operators"],
    queryFn: listOperators,
    enabled: canManageSessions
  });

  const sessions = sessionsQuery.data ?? [];

  useEffect(() => {
    if (autoPickedRef.current || sessionId != null || !sessions.length) return;
    if (examFilter) {
      const match = sessions.find((s) => s.exam_id === examFilter);
      if (match) {
        autoPickedRef.current = true;
        onSessionChange(match.id);
      }
    }
  }, [sessions, examFilter, sessionId, onSessionChange]);

  const createFormDefaults = () => {
    const ops = operatorsQuery.data ?? [];
    const preferred =
      ops.find((o) => o.id === user?.id)?.id ??
      ops.find((o) => o.role === "operator")?.id ??
      ops[0]?.id ??
      0;
    return {
      exam_id: examFilter ?? examsQuery.data?.[0]?.id ?? 0,
      operator_id: user?.role === "operator" ? user.id : preferred
    };
  };

  const roleAz = (r: string) =>
    r === "admin" ? "administrator" : r === "manager" ? "menecer" : r === "operator" ? "operator" : r;

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canManageSessions) return;
    const fd = new FormData(e.currentTarget);
    const exam_id = Number(fd.get("exam_id"));
    const operator_id = Number(fd.get("operator_id"));
    if (!exam_id || !operator_id) return;
    const row = await createScanSession({ exam_id, operator_id });
    sessionsQuery.refetch();
    onSessionChange(row.id);
    autoPickedRef.current = true;
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Skan oturumu</h3>
      <p className="mt-1 text-sm text-slate-600">
        Oturum imtahana bağlıdır; yüklənən hər şəkil həmin imtahanın cavab açarı və cavab kartı şablonu ilə
        OMR xidmətində yoxlanılır.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-w-[240px] flex-1 flex-col text-sm font-medium text-slate-700">
          Aktiv oturum
          <select
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 font-normal"
            value={sessionId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onSessionChange(v === "" ? null : Number(v));
            }}
          >
            <option value="">— seçin —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                №{s.id} · {s.exam_title ?? `İmtahan ${s.exam_id}`} · {s.operator_full_name ?? s.operator_id}{" "}
                · {s.status}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
          onClick={() => sessionsQuery.refetch()}
          disabled={sessionsQuery.isFetching}
        >
          Yenilə
        </button>
      </div>
      {sessionsQuery.isError && (
        <p className="mt-2 text-sm text-red-600">Oturum siyahısı yüklənmədi.</p>
      )}

      {canManageSessions && (
        <form
          key={`new-scan-${operatorsQuery.isSuccess}-${operatorsQuery.data?.length ?? 0}-${operatorsQuery.isError ? "e" : "ok"}`}
          className="mt-6 border-t border-slate-100 pt-4"
          onSubmit={handleCreate}
        >
          <h4 className="text-sm font-semibold text-slate-800">Yeni oturum</h4>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col text-sm">
              İmtahan
              <select
                name="exam_id"
                className="mt-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-2"
                defaultValue={createFormDefaults().exam_id || ""}
                required
              >
                {(examsQuery.data ?? []).map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title} (#{ex.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm">
              Operator (icraçı)
              <select
                name="operator_id"
                className="mt-1 min-w-[220px] rounded-md border border-slate-300 px-3 py-2"
                defaultValue={createFormDefaults().operator_id || ""}
                required
                disabled={operatorsQuery.isLoading || operatorsQuery.isError}
              >
                {(operatorsQuery.data ?? []).map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.full_name} · {roleAz(op.role)} · {op.email}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              disabled={operatorsQuery.isLoading || !operatorsQuery.data?.length}
            >
              Oturum yarat
            </button>
          </div>
          {operatorsQuery.isLoading && (
            <p className="mt-2 text-xs text-slate-600">İcraçı siyahısı yüklənir…</p>
          )}
          {operatorsQuery.isError && (
            <p className="mt-2 text-xs text-red-600">
              İcraçı siyahısı alınmadı (icazə və ya şəbəkə). Səhifəni yeniləyin və ya administratorla əlaqə saxlayın.
            </p>
          )}
          {!operatorsQuery.isLoading && !operatorsQuery.isError && !operatorsQuery.data?.length && (
            <p className="mt-2 text-xs text-amber-700">
              Heç bir istifadəçi tapılmadı. Admin panelində ən azı bir administrator və ya menecer olmalıdır.
            </p>
          )}
        </form>
      )}

      {!canManageSessions && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Yeni oturum yalnız menecer və ya administrator yarada bilər. Sizə təyin edilmiş oturumu yuxarıdan seçin.
        </p>
      )}
    </section>
  );
}
