import { useEffect, useRef, useState } from "react";
import { previewAnswerSheetPng } from "../../api/answerSheets";

type Props = {
  examId: number;
  templatePayload: Record<string, unknown>;
  layoutPresetId?: number | null;
  depsKey: string;
  pageCount?: 1 | 2;
  pageLabels?: [string, string];
  layoutWarnings?: string[];
  publishable?: boolean;
};

export default function LiveSheetPreview({
  examId,
  templatePayload,
  layoutPresetId,
  depsKey,
  pageCount = 1,
  pageLabels,
  layoutWarnings = [],
  publishable = true,
}: Props) {
  const [urls, setUrls] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const [previewPublishable, setPreviewPublishable] = useState(publishable);
  const urlsRef = useRef<string[]>([]);

  const nPages = pageCount >= 2 ? 2 : 1;
  const showUnpublishable = !publishable || !previewPublishable;

  useEffect(() => {
    setPreviewPublishable(publishable);
  }, [publishable]);

  useEffect(() => {
    if (examId <= 0) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
      setErr(null);
      void (async () => {
        try {
          const next: string[] = [];
          const apiPayload = {
            template_config: templatePayload,
            ...(layoutPresetId != null ? { layout_preset_id: layoutPresetId } : {}),
          };
          for (let i = 0; i < nPages; i++) {
            const { url, publishable: pub } = await previewAnswerSheetPng(examId, apiPayload, i);
            next.push(url);
            if (i === 0 && pub != null) setPreviewPublishable(pub);
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
  }, [examId, depsKey, nPages, templatePayload, layoutPresetId]);

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
              {pageLabels?.[0] ?? "Səh. 1"}
            </button>
            <button
              type="button"
              className={`rounded-md px-2.5 py-1 ${tab === 1 ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}
              onClick={() => setTab(1)}
            >
              {pageLabels?.[1] ?? "Səh. 2"}
            </button>
          </div>
        )}
      </div>
      {showUnpublishable && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-800">
          Çap / PDF yayımlanmaz — layout xətalarını düzəldin.
        </div>
      )}
      {loading && <p className="text-sm text-slate-500">Yüklənir…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!loading && !err && layoutWarnings.length > 0 && (
        <ul className="mb-3 max-h-36 list-inside list-disc space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
          {layoutWarnings.map((w, i) => (
            <li key={`${i}-${w.slice(0, 48)}`}>{w}</li>
          ))}
        </ul>
      )}
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
