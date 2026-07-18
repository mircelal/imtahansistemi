import { useMemo, useState } from "react";
import type { ReportOverviewExam } from "../../../api/reports";
import { formatDt, formatScore } from "../reportsFormat";

type Props = {
  exams: ReportOverviewExam[];
  selectedId: number | null;
  onSelect: (examId: number) => void;
};

export default function ReportsExamList({ exams, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return exams;
    return exams.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.course_name?.toLowerCase().includes(q) ?? false) ||
        String(e.exam_id).includes(q),
    );
  }, [exams, query]);

  const withData = filtered.filter((e) => e.has_results);
  const withoutData = filtered.filter((e) => !e.has_results);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-200/50">
      <div className="border-b border-slate-100 p-3">
        <label className="sr-only" htmlFor="report-exam-search">
          İmtahan axtar
        </label>
        <input
          id="report-exam-search"
          type="search"
          placeholder="İmtahan və ya kurs axtar…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm outline-none ring-indigo-500/0 transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-slate-500">Uyğun imtahan tapılmadı.</p>
        ) : (
          <div className="space-y-3">
            {withData.length > 0 && (
              <ExamGroup title="Nəticəli imtahanlar" exams={withData} selectedId={selectedId} onSelect={onSelect} />
            )}
            {withoutData.length > 0 && (
              <ExamGroup title="Hələ skan olunmayan" exams={withoutData} selectedId={selectedId} onSelect={onSelect} muted />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ExamGroup({
  title,
  exams,
  selectedId,
  onSelect,
  muted = false,
}: {
  title: string;
  exams: ReportOverviewExam[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <ul className="space-y-1">
        {exams.map((e) => {
          const active = selectedId === e.exam_id;
          return (
            <li key={e.exam_id}>
              <button
                type="button"
                onClick={() => onSelect(e.exam_id)}
                className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm"
                    : muted
                      ? "text-slate-600 hover:bg-slate-50"
                      : "text-slate-900 hover:bg-indigo-50/80"
                }`}
              >
                <p className={`truncate text-sm font-semibold ${active ? "text-white" : ""}`}>{e.title}</p>
                <p className={`mt-0.5 truncate text-xs ${active ? "text-indigo-100" : "text-slate-500"}`}>
                  {e.course_name ?? "Ümumi imtahan"}
                  {e.has_results ? (
                    <>
                      {" "}
                      · {e.unique_students} şagird · orta {formatScore(e.average_score)}
                    </>
                  ) : (
                    " · skan gözləyir"
                  )}
                </p>
                {e.last_processed_at ? (
                  <p className={`mt-0.5 text-[10px] ${active ? "text-indigo-200" : "text-slate-400"}`}>
                    Son: {formatDt(e.last_processed_at)}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
