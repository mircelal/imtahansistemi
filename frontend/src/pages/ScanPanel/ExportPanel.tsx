import { useState } from "react";
import { downloadScanResultsCsv, downloadSessionReadingJson } from "../../api/scans";

type Props = {
  sessionId: number | null;
};

export default function ExportPanel({ sessionId }: Props) {
  const [err, setErr] = useState<string | null>(null);

  const downloadCsv = async () => {
    if (sessionId == null) return;
    setErr(null);
    try {
      const blob = await downloadScanResultsCsv(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scan_session_${sessionId}_results.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("İxrac alınmadı.");
    }
  };

  const downloadReadingJson = async () => {
    if (sessionId == null) return;
    setErr(null);
    try {
      const blob = await downloadSessionReadingJson(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scan_session_${sessionId}_reading.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Kanonik JSON ixrac alınmadı.");
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">İxrac</h3>
      <p className="mt-1 text-sm text-slate-600">
        CSV — xam <code className="rounded bg-slate-100 px-1">detected_answers</code>. JSON — şəxsiyyət, MCQ, QR və
        şablon etiketləri ilə kanonik oxunuş massivi.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={sessionId == null}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => downloadCsv()}
        >
          CSV endir
        </button>
        <button
          type="button"
          disabled={sessionId == null}
          className="rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm text-indigo-950 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => downloadReadingJson()}
        >
          Kanonik oxunuş (JSON)
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  );
}
