import type { StudentResultRow } from "../../api/studentPortal";
import { formatDateTime } from "../../utils/dateFormat";

function formatDt(iso: string | null | undefined) {
  return formatDateTime(iso);
}

function statusAz(status: string) {
  const map: Record<string, string> = {
    ok: "Hesablanıb",
    manual_review: "Manual yoxlama",
    error: "Xəta"
  };
  return map[status.toLowerCase()] ?? status;
}

type Props = {
  results: StudentResultRow[];
  compact?: boolean;
};

export default function StudentResultsTable({ results, compact }: Props) {
  if (results.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">Nəticə yoxdur.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Tarix</th>
            <th className="px-4 py-3">İmtahan</th>
            {!compact ? <th className="px-4 py-3">Kapsam</th> : null}
            <th className="px-4 py-3">Bal</th>
            <th className="px-4 py-3">Faiz</th>
            {!compact ? <th className="px-4 py-3">Status</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {results.map((r) => (
            <tr key={r.scan_result_id} className="hover:bg-slate-50/80">
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDt(r.processed_at)}</td>
              <td className="max-w-[200px] truncate px-4 py-3 font-medium text-slate-900">{r.exam_title}</td>
              {!compact ? <td className="px-4 py-3 text-slate-600">{r.exam_scope_label}</td> : null}
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                {r.score != null && r.max_score != null ? `${r.score} / ${r.max_score}` : "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium">
                {r.percent != null ? `${r.percent}%` : "—"}
              </td>
              {!compact ? (
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{statusAz(r.status)}</span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
