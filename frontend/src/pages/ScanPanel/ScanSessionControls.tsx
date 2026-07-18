import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { listOperators } from "../../api/auth";
import { listExams } from "../../api/exams";
import { createScanSession, ensureScanSession, listScanSessions } from "../../api/scans";
import { useAuthStore } from "../../store/authStore";
import { formatDateTimeShort } from "../../utils/dateFormat";

type Props = {
  examFilter: number | null;
  sessionId: number | null;
  onSessionChange: (id: number | null, meta?: { status?: string }) => void;
};

function sessionStatusAz(status: string): string {
  switch (status) {
    case "pending":
      return "yükləmə gözləyir";
    case "processing":
      return "emal olunur";
    case "done":
      return "bitib";
    case "error":
      return "xəta";
    default:
      return status;
  }
}

export default function ScanSessionControls({ examFilter, sessionId, onSessionChange }: Props) {
  const user = useAuthStore((s) => s.user);
  const canManageSessions = user?.role === "admin" || user?.role === "manager";
  const canNewBatch = user != null && user.role !== "student";
  const autoPickedRef = useRef(false);
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ["scan-sessions", examFilter],
    queryFn: () => listScanSessions(examFilter ?? undefined),
  });
  const examsQuery = useQuery({ queryKey: ["exams"], queryFn: () => listExams() });
  const operatorsQuery = useQuery({
    queryKey: ["operators"],
    queryFn: listOperators,
    enabled: canManageSessions,
  });

  const sessions = sessionsQuery.data ?? [];
  const filteredSessions = examFilter != null ? sessions.filter((s) => s.exam_id === examFilter) : sessions;
  const selected = filteredSessions.find((s) => s.id === sessionId) ?? null;

  useEffect(() => {
    if (examFilter != null) return;
    if (autoPickedRef.current || sessionId != null || !filteredSessions.length) return;
    autoPickedRef.current = true;
    onSessionChange(filteredSessions[0]!.id, { status: filteredSessions[0]!.status });
  }, [examFilter, filteredSessions, sessionId, onSessionChange]);

  const newBatchMut = useMutation({
    mutationFn: () => ensureScanSession(examFilter!, true),
    onSuccess: async (row) => {
      await queryClient.invalidateQueries({ queryKey: ["scan-sessions", examFilter] });
      onSessionChange(row.id, { status: row.status });
      autoPickedRef.current = true;
    },
  });

  const createFormDefaults = () => {
    const ops = operatorsQuery.data ?? [];
    const preferred =
      ops.find((o) => o.id === user?.id)?.id ??
      ops.find((o) => o.role === "operator")?.id ??
      ops[0]?.id ??
      0;
    return {
      exam_id: examFilter ?? examsQuery.data?.[0]?.id ?? 0,
      operator_id: user?.role === "operator" ? user.id : preferred,
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
    onSessionChange(row.id, { status: row.status });
    autoPickedRef.current = true;
  };

  const defaults = createFormDefaults();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">
        {examFilter != null ? "Əvvəlki yoxlamalar (partiyalar)" : "Skan partiyası"}
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        {examFilter != null
          ? "Klassik imtahan kimi: bitmiş partiyanın nəticələri saxlanır. Yeni kartlar üçün ayrı partiya açın."
          : "Skan partiyası — bir imtahan üçün yüklənən şəkillər toplusudur. İmtahan səhifəsindən gəlsəniz, partiya avtomatik açılır."}
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-[260px] flex-1 flex-col text-sm font-medium text-slate-700">
          Partiya
          <select
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 font-normal"
            value={sessionId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                onSessionChange(null);
                return;
              }
              const id = Number(v);
              const row = filteredSessions.find((s) => s.id === id);
              onSessionChange(id, { status: row?.status });
            }}
          >
            <option value="">— partiya seçin —</option>
            {filteredSessions.map((s) => (
              <option key={s.id} value={s.id}>
                №{s.id} · {s.processed_images}/{s.total_images} skan · {sessionStatusAz(s.status)}
                {s.created_at ? ` · ${formatDateTimeShort(s.created_at)}` : ""}
                {examFilter == null ? ` · ${s.operator_full_name ?? s.operator_id}` : ""}
                {examFilter == null && s.exam_title ? ` · ${s.exam_title}` : ""}
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
        {examFilter != null && canNewBatch && (
          <button
            type="button"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            disabled={newBatchMut.isPending}
            onClick={() => newBatchMut.mutate()}
          >
            {newBatchMut.isPending ? "Açılır…" : "Yeni partiya"}
          </button>
        )}
      </div>

      {selected && (selected.status === "done" || selected.status === "error") && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-950">
          Bu partiya {selected.status === "done" ? "bitib" : "xəta ilə bitib"} — yoxlanılmış cavablar aşağıda
          saxlanır. Əlavə kart yükləmək üçün <strong>Yeni partiya</strong> basın.
        </p>
      )}

      {examFilter != null && filteredSessions.length === 0 && !sessionsQuery.isLoading && (
        <p className="mt-2 text-sm text-slate-600">Bu imtahan üçün hələ skan partiyası yoxdur — yuxarıda avtomatik yaradılır.</p>
      )}

      {sessionsQuery.isError && (
        <p className="mt-2 text-sm text-red-600">Partiya siyahısı yüklənmədi.</p>
      )}
      {newBatchMut.isError && (
        <p className="mt-2 text-sm text-red-600">Yeni partiya açıla bilmədi.</p>
      )}

      {canManageSessions && examFilter == null && (
        <form
          key={`new-scan-${defaults.exam_id}-${defaults.operator_id}-all`}
          className="mt-6 border-t border-slate-100 pt-4"
          onSubmit={handleCreate}
        >
          <h4 className="text-sm font-semibold text-slate-800">Yeni partiya (menecer)</h4>
          <p className="mt-1 text-xs text-slate-500">
            Köhnə nəticələr saxlanılır. Yeni yükləmə üçün ayrı partiya yaradın.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col text-sm">
              İmtahan
              <select
                name="exam_id"
                className="mt-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-2"
                defaultValue={defaults.exam_id || ""}
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
                defaultValue={defaults.operator_id || ""}
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
              Partiya yarat
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
