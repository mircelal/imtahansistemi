import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getScanSession, queueProcessSession } from "../../api/scans";

type Props = {
  sessionId: number | null;
};

const statusLabel: Record<string, string> = {
  pending: "Gözləyir",
  processing: "Emal olunur",
  done: "Bitdi",
  error: "Xəta"
};

export default function ProcessingStatus({ sessionId }: Props) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["scan-session", sessionId],
    queryFn: () => getScanSession(sessionId!),
    enabled: sessionId != null,
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      return st === "pending" || st === "processing" ? 2000 : false;
    }
  });

  if (sessionId == null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Emal vəziyyəti</h3>
        <p className="mt-1 text-sm text-slate-500">Oturum seçildikdən sonra status burada göstərilir.</p>
      </div>
    );
  }

  const s = q.data;
  const pct =
    s && s.total_images > 0 ? Math.min(100, Math.round((s.processed_images / s.total_images) * 100)) : 0;

  const requeue = async () => {
    await queueProcessSession(sessionId);
    await queryClient.invalidateQueries({ queryKey: ["scan-session", sessionId] });
    await queryClient.invalidateQueries({ queryKey: ["scan-results", sessionId] });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">Emal vəziyyəti</h3>
        {s && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              s.status === "done"
                ? "bg-emerald-100 text-emerald-800"
                : s.status === "error"
                  ? "bg-red-100 text-red-800"
                  : s.status === "processing"
                    ? "bg-indigo-100 text-indigo-800"
                    : "bg-amber-100 text-amber-800"
            }`}
          >
            {statusLabel[s.status] ?? s.status}
          </span>
        )}
      </div>
      {q.isLoading && <p className="mt-2 text-sm text-slate-600">Yüklənir…</p>}
      {q.isError && <p className="mt-2 text-sm text-red-600">Status oxuna bilmədi.</p>}
      {s && (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Yüklənmiş fayl sayı: <strong>{s.total_images}</strong> · Son işləmədə emal olunan kart:{" "}
            <strong>{s.processed_images}</strong>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            ZIP içindəki hər şəkil ayrıca nəticə kimi sayılır; göstəricilər son Celery işindən sonra yenilənir.
          </p>
          <progress className="mt-3 h-2 w-full rounded accent-indigo-600" max={100} value={pct} />
          <p className="mt-1 text-xs text-slate-500">{pct}% (fayl sayına nisbətən təxmini)</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => q.refetch()}
            >
              Statusu yenilə
            </button>
            <button
              type="button"
              className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-900 hover:bg-indigo-100"
              onClick={() => requeue()}
            >
              Yenidən emala göndər
            </button>
          </div>
        </>
      )}
    </div>
  );
}
