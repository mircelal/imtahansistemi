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
  const stuckPending =
    s != null &&
    s.total_images > 0 &&
    s.processed_images === 0 &&
    s.status === "pending";
  const processingActive = s?.status === "processing";

  const requeue = async () => {
    if (
      !window.confirm(
        stuckPending
          ? "Emal başlamayıb və ya dayanıb. Fayllar yenidən emal növbəsinə göndərilsin?"
          : "Bu oturumdakı bütün fayllar yenidən emal növbəsinə göndərilsin? Mövcud nəticələr yenilənə bilər.",
      )
    ) {
      return;
    }
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
          {processingActive && (
            <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
              <strong className="font-semibold">Emal davam edir.</strong> OMR hər kartı oxuyur — bir kart
              adətən 20–60 saniyə çəkə bilər; faiz hər kart bitəndə yenilənir.
            </div>
          )}
          {stuckPending && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <strong className="font-semibold">Emal gözləyir.</strong>{" "}
              Fayllar yüklənib, amma OMR emal işçisi (worker) növbəyə düşməyibsə faiz 0% qalır.{" "}
              <button
                type="button"
                className="font-semibold text-amber-900 underline hover:text-amber-950"
                onClick={() => requeue()}
              >
                İndi emala göndər
              </button>
            </div>
          )}
          <p className="mt-2 text-sm text-slate-600">
            Yüklənmiş fayl sayı: <strong>{s.total_images}</strong> · Son işləmədə emal olunan kart:{" "}
            <strong>{s.processed_images}</strong>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            ZIP-də hər şəkil ayrıca sətir sayılır; faiz son emal job-u bitəndə yenilənir (təxmini göstərici).
          </p>
          <progress className="mt-3 h-2 w-full rounded accent-indigo-600" max={100} value={pct} />
          <p className="mt-1 text-xs text-slate-500">
            {s.processed_images} / {s.total_images} fayl emal olunub ({pct}%)
          </p>
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
