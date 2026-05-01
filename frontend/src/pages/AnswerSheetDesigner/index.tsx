import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { downloadAnswerSheetPdf, generateAnswerSheet } from "../../api/answerSheets";
import { getAnswerSheetPreset, updateAnswerSheetPreset } from "../../api/sheetPresets";
import AnswerKeyPanel, { AnswerKeyWorkspace } from "./AnswerKeyPanel";
import ConfigPanel from "./ConfigPanel";
import FieldPropertiesPanel from "./FieldPropertiesPanel";
import FreeformCanvas from "./FreeformCanvas";
import LiveSheetPreview from "./LiveSheetPreview";
import PreviewModal from "./components/PreviewModal";
import {
  createBlock,
  dimStandardTemplate,
  fieldsFromApiPayload,
  fieldsToApiPayload,
  mcqGridFromPayload,
  newBlockId,
  sheetConfigFromPayload,
  type LayoutField,
  type LayoutFieldKind,
  type McqGridPos,
} from "./layoutBlockModel";
import { shouldUseTwoPages } from "./mcqLayout";
import { useSheetConfig } from "./hooks/useSheetConfig";
import AnswerSheetDesignerHub from "./AnswerSheetDesignerHub";

type GenerateResult = { pdf_path: string; sheet_uuid: string; download_url: string };

function buildSheetAnswerKey(answers: Record<number, string>): Record<string, string> | undefined {
  const sk: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers)) {
    const t = String(v || "").trim().toUpperCase();
    if (t) sk[String(k)] = t;
  }
  return Object.keys(sk).length ? sk : undefined;
}

// ─── Palette item ────────────────────────────────────────────────────────────

type PaletteItem = { kind: LayoutFieldKind; short: string; title: string };
const PALETTE: PaletteItem[] = [
  { kind: "vertical_letters", short: "Şaquli hərf", title: "AD/SOYAD tipli sütun kodu" },
  { kind: "digits", short: "Rəqəm", title: "İş №, telefon, məktəb" },
  { kind: "mcq_groups", short: "Seçimlər", title: "Variant, sinif, bölmə…" },
  { kind: "horizontal_letters", short: "Üfüqi hərf", title: "Yazı xanası + A–Z sırası" },
  { kind: "mcq", short: "Tək MCQ", title: "Bir sətirdə variantlar" },
  { kind: "note", short: "Qeyd", title: "Açıq mətn bloku" },
];

const HL_PRESETS = ["ADINIZ", "SOYADINIZ", "ATA ADI"];
const VL_PRESETS = ["ADINIZ", "SOYADINIZ", "ATA ADI", "ƏLAVƏ"];

// ─── Main component ──────────────────────────────────────────────────────────

export default function AnswerSheetDesignerPage() {
  const [params] = useSearchParams();
  const examId = useMemo(() => {
    const n = Number(params.get("examId") || params.get("exam_id") || "1");
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [params]);

  const presetId = useMemo(() => {
    const raw = params.get("presetId") || params.get("preset_id");
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params]);

  const viewOnly = params.get("view") === "1";

  const [presetLabel, setPresetLabel] = useState<string | null>(null);
  const [presetSaving, setPresetSaving] = useState(false);

  const { config, setConfig } = useSheetConfig();

  const [leftTab, setLeftTab] = useState<"settings" | "answers">("settings");
  const [rightPanel, setRightPanel] = useState<"preview" | "props">("preview");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [answerKeyModalOpen, setAnswerKeyModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answerKey, setAnswerKey] = useState<Record<number, string>>({});

  const [layoutFields, setLayoutFields] = useState<LayoutField[]>([]);
  const [mcqGrid, setMcqGrid] = useState<McqGridPos>({ top_mm: 0, left_mm: 19 });
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const selectedField = selectedFieldId ? layoutFields.find((f) => f.blockId === selectedFieldId) ?? null : null;

  const twoPageLayout = shouldUseTwoPages(config, layoutFields, mcqGrid.left_mm);

  const templatePayload = useMemo((): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      ...config,
      identity_section: true,
      layout_mode: "freeform",
      identity_fields: fieldsToApiPayload(layoutFields),
      mcq_grid: { top_mm: mcqGrid.top_mm, left_mm: mcqGrid.left_mm },
    };
    const sk = buildSheetAnswerKey(answerKey);
    if (sk) payload.sheet_answer_key = sk;
    return payload;
  }, [config, layoutFields, mcqGrid, answerKey]);

  const previewDepsKey = useMemo(() => JSON.stringify(templatePayload), [templatePayload]);

  useEffect(() => {
    if (leftTab === "answers") setAnswerKeyModalOpen(true);
    else setAnswerKeyModalOpen(false);
  }, [leftTab]);

  useEffect(() => {
    if (viewOnly) {
      setRightPanel("preview");
      setAnswerKeyModalOpen(false);
    }
  }, [viewOnly]);

  useEffect(() => {
    if (presetId == null) {
      setPresetLabel(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const p = await getAnswerSheetPreset(presetId);
        if (cancelled) return;
        setPresetLabel(p.name);
        const tc = (p.template_config ?? {}) as Record<string, unknown>;
        setConfig(sheetConfigFromPayload(tc));
        setLayoutFields(fieldsFromApiPayload(tc.identity_fields));
        setMcqGrid(mcqGridFromPayload(tc.mcq_grid));
        const sk = tc.sheet_answer_key as Record<string, string> | undefined;
        if (sk && typeof sk === "object") {
          const ak: Record<number, string> = {};
          for (const [k, v] of Object.entries(sk)) {
            const n = Number(k);
            if (Number.isFinite(n)) ak[n] = String(v || "").toUpperCase();
          }
          setAnswerKey(ak);
        }
      } catch {
        if (!cancelled) setPresetLabel("(şablon yüklənmədi)");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presetId, setConfig]);

  // ─── Field management ───────────────────────────────────────────────────

  const addField = (kind: LayoutFieldKind) => {
    const f: LayoutField = { ...createBlock(kind, config), blockId: newBlockId() };
    if (kind === "horizontal_letters") {
      const n = layoutFields.filter((x) => x.kind === "horizontal_letters").length;
      f.label = HL_PRESETS[n] ?? `Sahə ${n + 1}`;
    }
    if (kind === "vertical_letters") {
      const n = layoutFields.filter((x) => x.kind === "vertical_letters").length;
      f.label = VL_PRESETS[n] ?? `Şaquli ${n + 1}`;
    }
    const offsetY = layoutFields.length > 0 ? (layoutFields.length % 4) * 8 : 0;
    f.y_mm = f.y_mm + offsetY;
    setLayoutFields((prev) => [...prev, f]);
    setSelectedFieldId(f.blockId);
    setRightPanel("props");
  };

  const updateField = (updated: LayoutField) => {
    setLayoutFields((prev) => prev.map((f) => (f.blockId === updated.blockId ? updated : f)));
  };

  const removeField = (blockId: string) => {
    setLayoutFields((prev) => prev.filter((f) => f.blockId !== blockId));
    if (selectedFieldId === blockId) {
      setSelectedFieldId(null);
      setRightPanel("preview");
    }
  };

  const handleSelectField = (id: string | null) => {
    setSelectedFieldId(id);
    if (id) setRightPanel("props");
  };

  const loadDimTemplate = () => {
    if (layoutFields.length > 0) {
      if (!window.confirm("Mövcud sahələr silinəcək. DİM şablonu yüklənsin?")) return;
    }
    const { fields, mcqGridPos } = dimStandardTemplate(config);
    setLayoutFields(fields);
    setMcqGrid(mcqGridPos);
    setSelectedFieldId(null);
    setRightPanel("preview");
  };

  const clearAll = () => {
    if (!window.confirm("Bütün sahələri silim?")) return;
    setLayoutFields([]);
    setMcqGrid({ top_mm: 0, left_mm: 19 });
    setSelectedFieldId(null);
  };

  // ─── Generate PDF ────────────────────────────────────────────────────────

  const savePresetLayout = async () => {
    if (presetId == null) return;
    const tc = { ...templatePayload };
    delete tc.sheet_answer_key;
    setPresetSaving(true);
    try {
      await updateAnswerSheetPreset(presetId, { template_config: tc });
      window.alert("Şablon saxlanıldı.");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      window.alert(msg || "Şablon saxlanmadı.");
    } finally {
      setPresetSaving(false);
    }
  };

  const generatePdf = async () => {
    if (viewOnly) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await generateAnswerSheet(examId, { template_config: templatePayload });
      setResult(res);
      await downloadAnswerSheetPdf(examId, res.sheet_uuid);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || (e instanceof Error ? e.message : "Xəta baş verdi"));
    } finally {
      setLoading(false);
    }
  };

  // ─── UI ─────────────────────────────────────────────────────────────────

  if (presetId == null) {
    return (
      <div className="flex min-h-screen flex-col bg-[#f0f0f5] font-sans text-slate-900 antialiased">
        <header className="shrink-0 border-b border-slate-200/80 bg-white/90 px-5 py-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div>
              <h1 className="text-[15px] font-semibold text-slate-900">Cavab kartı dizayneri</h1>
              <p className="text-[11px] text-slate-500">Şablonlar siyahısı — redaktə üçün birini seçin və ya yenisini yaradın</p>
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <AnswerSheetDesignerHub />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f0f0f5] font-sans text-slate-900 antialiased">
      {/* ─── TOP NAV ─── */}
      <header className="z-30 flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/80 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link
            to="/designer"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ← Şablonlar
          </Link>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
            style={{ background: "#c0176a" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="white" fillOpacity=".9" />
              <rect x="9" y="2" width="5" height="2" rx="1" fill="white" fillOpacity=".7" />
              <rect x="9" y="6" width="5" height="1" rx=".5" fill="white" fillOpacity=".5" />
              <rect x="2" y="9" width="12" height="1" rx=".5" fill="white" fillOpacity=".6" />
              <rect x="2" y="12" width="9" height="1" rx=".5" fill="white" fillOpacity=".4" />
            </svg>
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-slate-900">Cavab Kartı Dizayneri</h1>
            <p className="text-[11px] text-slate-500">
              İmtahan № {examId}
              {presetId != null ? (
                <>
                  {" "}
                  · Şablon №{presetId}
                  {presetLabel ? ` (${presetLabel})` : ""}
                </>
              ) : null}
              {viewOnly ? " · Yalnız baxış" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {result && (
            <button
              type="button"
              onClick={() => downloadAnswerSheetPdf(examId, result.sheet_uuid)}
              className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-[13px] font-medium text-emerald-800 hover:bg-emerald-100"
            >
              ↓ Yüklə
            </button>
          )}
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Önizləmə
          </button>
          {viewOnly ? (
            <Link
              to={`/designer?presetId=${presetId}&examId=${examId}`}
              className="rounded-full bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Redaktə et
            </Link>
          ) : (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={generatePdf}
                className="rounded-full px-5 py-2 text-[13px] font-semibold text-white shadow-sm disabled:opacity-60"
                style={{ background: loading ? "#94a3b8" : "#c0176a" }}
              >
                {loading ? "Hazırlanır…" : "PDF Yarat"}
              </button>
              {presetId != null ? (
                <button
                  type="button"
                  disabled={presetSaving}
                  onClick={() => void savePresetLayout()}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {presetSaving ? "Saxlanır…" : "Şablonu saxla"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </header>

      {/* ─── BODY ─── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── LEFT SIDEBAR ── */}
        {viewOnly ? (
          <aside className="flex w-[212px] shrink-0 flex-col border-r border-slate-200/80 bg-slate-50 p-3">
            <p className="text-[12px] leading-relaxed text-slate-600">
              Baxış rejimi: sahələri dəyişmək üçün başlıqda «Redaktə et» düyməsini və ya aşağıdakı keçidi istifadə edin.
            </p>
            <Link
              to={`/designer?presetId=${presetId}&examId=${examId}`}
              className="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-center text-[12px] font-semibold text-white hover:bg-indigo-700"
            >
              Redaktə rejiminə keç
            </Link>
          </aside>
        ) : (
          <aside className="flex w-[228px] shrink-0 flex-col border-r border-slate-200/80 bg-white">
            <div className="flex shrink-0 border-b border-slate-200/60">
              {(["settings", "answers"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLeftTab(t)}
                  className={`flex-1 py-2 text-[11px] font-semibold transition ${
                    leftTab === t
                      ? "border-b-2 border-[#c0176a] text-[#c0176a]"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t === "settings" ? "Dizayn" : "Açar"}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {leftTab === "settings" && (
                <div className="space-y-0">
                  <div className="border-b border-slate-100 px-2.5 py-2">
                    <button
                      type="button"
                      onClick={loadDimTemplate}
                      title="Dövlət standartına yaxın hazır düzülüş"
                      className="w-full rounded-lg border border-[#c0176a]/35 bg-[#fdf0f6] px-2.5 py-2 text-left transition hover:bg-[#fce8f3]"
                    >
                      <span className="text-[12px] font-semibold text-[#9b1257]">DİM şablonu</span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">Ad, soyad, sahələr</span>
                    </button>
                  </div>

                  <div className="border-b border-slate-100 px-2.5 py-2">
                    <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sahə</p>
                    <div className="grid grid-cols-2 gap-1">
                      {PALETTE.map((item) => (
                        <button
                          key={item.kind}
                          type="button"
                          title={item.title}
                          onClick={() => addField(item.kind)}
                          className="rounded-lg border border-slate-200/90 bg-slate-50/80 px-1.5 py-2 text-left text-[11px] font-medium text-slate-800 transition hover:border-[#c0176a]/40 hover:bg-white"
                        >
                          <span className="block leading-tight">{item.short}</span>
                          <span className="mt-0.5 block text-[9px] font-normal leading-tight text-slate-500">+ əlavə</span>
                        </button>
                      ))}
                    </div>
                    {layoutFields.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAll}
                        className="mt-2 w-full rounded-lg py-1.5 text-[11px] text-red-600 hover:bg-red-50"
                      >
                        Hamısını sil
                      </button>
                    )}
                  </div>

                  <details className="group border-b border-slate-100 px-2.5 py-2">
                    <summary className="cursor-pointer list-none py-1 text-[11px] font-semibold text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between">
                        Kart ölçüləri və mətn
                        <span className="text-slate-400 group-open:rotate-180">▼</span>
                      </span>
                    </summary>
                    <div className="pt-2">
                      <ConfigPanel compact config={config} onChange={setConfig} />
                    </div>
                  </details>
                </div>
              )}

              {leftTab === "answers" && (
                <div className="p-2.5">
                  <AnswerKeyPanel
                    config={config}
                    answers={answerKey}
                    onChange={setAnswerKey}
                    onOpenWorkspace={() => setAnswerKeyModalOpen(true)}
                  />
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ── CANVAS CENTER ── */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#e8e8ed]">
          <div className="min-h-0 flex-1 overflow-auto px-6 pb-2 pt-4">
            <FreeformCanvas
              sheetConfig={config}
              sheetUuidPreview={result?.sheet_uuid}
              fields={layoutFields}
              mcq={mcqGrid}
              showSecondPage={twoPageLayout}
              selectedFieldId={selectedFieldId}
              onFieldsChange={setLayoutFields}
              onMcqChange={setMcqGrid}
              onSelectField={handleSelectField}
              readOnly={viewOnly}
            />

            {error && (
              <div className="mx-auto mt-4 max-w-lg rounded-2xl border border-red-200 bg-white px-4 py-3 text-[13px] text-red-700 shadow-sm">
                {error}
              </div>
            )}

            {result && (
              <div className="mx-auto mt-4 max-w-lg rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[13px] font-semibold text-emerald-800">✓ PDF hazır!</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{result.sheet_uuid}</p>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-slate-200/90 bg-white/95 px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur-md">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-0.5 text-center sm:flex-row sm:justify-center sm:gap-4 sm:text-left">
              <p className="text-[11px] text-slate-600">
                {viewOnly ? (
                  <>Yalnız baxış — dəyişiklik üçün «Redaktə et».</>
                ) : layoutFields.length === 0 ? (
                  <>Soldan sahə əlavə edin və ya <strong className="font-medium text-slate-800">DİM şablonu</strong> seçin.</>
                ) : (
                  <>
                    <strong className="font-semibold text-slate-800">{layoutFields.length}</strong> sahə · altdan tutub sürükləyin
                    {selectedField ? (
                      <>
                        {" "}
                        · <span style={{ color: "#9b1257" }}>{String(selectedField.label ?? selectedField.kind)}</span>
                      </>
                    ) : null}
                  </>
                )}
              </p>
              <p className="text-[10px] text-slate-400 sm:border-l sm:border-slate-200 sm:pl-4">
                Cavab şəbəkəsi: {config.question_count} sual · {config.columns_count} sütun
                {twoPageLayout ? " · 2 səhifə" : ""}
              </p>
            </div>
          </footer>
        </main>

        {/* ── RIGHT SIDEBAR ── */}
        <aside className="flex w-[280px] shrink-0 flex-col border-l border-slate-200/80 bg-white">
          {/* Tab bar */}
          <div className="flex shrink-0 border-b border-slate-200/60">
            <button
              type="button"
              onClick={() => setRightPanel("preview")}
              className={`${viewOnly ? "w-full" : "flex-1"} py-3 text-[12px] font-semibold transition ${
                rightPanel === "preview"
                  ? "border-b-2 border-slate-900 text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Önizləmə
            </button>
            {!viewOnly ? (
              <button
                type="button"
                onClick={() => setRightPanel("props")}
                className={`flex-1 py-3 text-[12px] font-semibold transition ${
                  rightPanel === "props"
                    ? "border-b-2 border-[#c0176a] text-[#c0176a]"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {selectedField ? "Xüsusiyyətlər" : "Seçilməyib"}
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {rightPanel === "preview" && (
              <div className="p-3">
                <LiveSheetPreview
                  examId={examId}
                  templatePayload={templatePayload}
                  depsKey={previewDepsKey}
                  pageCount={twoPageLayout ? 2 : 1}
                />
              </div>
            )}

            {rightPanel === "props" && selectedField ? (
              <FieldPropertiesPanel
                field={selectedField}
                sheetConfig={config}
                onUpdate={updateField}
                onRemove={() => removeField(selectedField.blockId)}
              />
            ) : rightPanel === "props" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="text-4xl">👆</div>
                <p className="text-[14px] font-medium text-slate-600">Kənarda bir sahəyə klikləyin</p>
                <p className="text-[12px] text-slate-400">
                  Kanvasta sahəni seçincə burada düzəndə bilərsiniz
                </p>
              </div>
            ) : null}
          </div>

          {/* Field list (mini) in props mode */}
          {rightPanel === "props" && layoutFields.length > 0 && (
            <div className="shrink-0 border-t border-slate-100">
              <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sahələr</p>
              <div className="max-h-40 overflow-y-auto">
                {layoutFields.map((f) => (
                  <button
                    key={f.blockId}
                    type="button"
                    onClick={() => handleSelectField(f.blockId)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] transition hover:bg-slate-50 ${
                      selectedFieldId === f.blockId ? "bg-[#fdf0f6] font-medium text-[#9b1257]" : "text-slate-700"
                    }`}
                  >
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {(PALETTE.find((p) => p.kind === f.kind)?.short ?? "·").slice(0, 2)}
                    </span>
                    <span className="min-w-0 truncate">{String(f.label ?? f.kind)}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">
                      {f.x_mm.toFixed(0)},{f.y_mm.toFixed(0)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)}>
        <div className="p-2">
          <LiveSheetPreview
            examId={examId}
            templatePayload={templatePayload}
            depsKey={`${previewDepsKey}-modal`}
            pageCount={twoPageLayout ? 2 : 1}
          />
        </div>
      </PreviewModal>

      <PreviewModal
        wide
        title="Cavab açarı"
        open={answerKeyModalOpen}
        onClose={() => setAnswerKeyModalOpen(false)}
      >
        <AnswerKeyWorkspace config={config} answers={answerKey} onChange={setAnswerKey} />
      </PreviewModal>
    </div>
  );
}
