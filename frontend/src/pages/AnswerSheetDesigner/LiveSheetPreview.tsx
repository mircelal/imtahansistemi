import { useEffect, useRef, useState } from "react";
import { previewAnswerSheetPng } from "../../api/answerSheets";

type Props = {
  examId: number;
  templatePayload: Record<string, unknown>;
  depsKey: string;
  pageCount?: 1 | 2;
};

export default function LiveSheetPreview({ examId, templatePayload, depsKey, pageCount = 1 }: Props) {
  const [urls, setUrls] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const urlsRef = useRef<string[]>([]);

  const nPages = pageCount >= 2 ? 2 : 1;

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
      setErr(null);
      void (async () => {
        try {
          const next: string[] = [];
          for (let i = 0; i < nPages; i++) {
            const u = await previewAnswerSheetPng(examId, { template_config: templatePayload }, i);
            next.push(u);
          }
          if (cancelled) {
            next.forEach((u) => URL.revokeObjectURL(u));
            return;
          }
          urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
          urlsRef.current = next;
          setUrls(next);
          setTab(0);
        } catch {
          if (!cancelled) setErr("Önizləmə alına bilmədi");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 420);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [examId, depsKey, nPages, templatePayload]);

  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    },
    [],
  );

  const active = urls[tab] ?? null;

  return (
    <div className="sticky top-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-200/60 print:hidden">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Önizləmə</p>
        {nPages > 1 && (
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
            <button
              type="button"
              className={`rounded-md px-2.5 py-1 ${tab === 0 ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}
              onClick={() => setTab(0)}
            >
              Səh. 1
            </button>
            <button
              type="button"
              className={`rounded-md px-2.5 py-1 ${tab === 1 ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}
              onClick={() => setTab(1)}
            >
              Səh. 2
            </button>
          </div>
        )}
      </div>
      {loading && <p className="text-sm text-slate-500">Yüklənir…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {active && !err && (
        <img
          src={active}
          alt={`Cavab kartı səhifə ${tab + 1}`}
          className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg border border-slate-200/80"
        />
      )}
    </div>
  );
}
