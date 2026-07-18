import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  auditAnswerSheetLayout,
  downloadAnswerSheetPdf,
  generateAnswerSheet,
  getApiErrorMessage,
} from "../../api/answerSheets";
import { getAnswerSheetPreset, updateAnswerSheetPreset } from "../../api/sheetPresets";
import { getExam, listExams, updateExam } from "../../api/exams";
import AnswerKeyPanel, { AnswerKeyWorkspace } from "./AnswerKeyPanel";
import ConfigPanel from "./ConfigPanel";
import FieldPropertiesPanel from "./FieldPropertiesPanel";
import McqGridPropertiesPanel from "./McqGridPropertiesPanel";
import FreeformCanvas from "./FreeformCanvas";
import LiveSheetPreview from "./LiveSheetPreview";
import PreviewModal from "./components/PreviewModal";
import ZoomToolbar from "./components/ZoomToolbar";
import {
  createBlock,
  dimStandardTemplate,
  fieldsFromApiPayload,
  fieldsToApiPayload,
  mergePreservedFieldPositions,
  estimateBlockHeightMm,
  MCQ_GRID_DRAG_ID,
  mcqGridFromPayload,
  mcqSectionDragId,
  parseMcqSectionDragIndex,
  newBlockId,
  sheetConfigFromPayload,
  type LayoutField,
  type LayoutFieldKind,
  type McqGridPos,
} from "./layoutBlockModel";
import {
  shouldUseTwoPages,
  contentLeftMm,
  buildMcqSectionsFromGrading,
  shouldShowMcqGridLabel,
  resolveMcqSections,
} from "./mcqLayout";
import type { McqSection } from "./hooks/useSheetConfig";
import { useSheetConfig, type SheetConfig } from "./hooks/useSheetConfig";
import AnswerSheetDesignerHub from "./AnswerSheetDesignerHub";
import { identityZoneTopMmRef, IDENTITY_STACK_GAP_MM } from "../../constants/sheetLayoutSpec";
import { ensureFoldPanels, isA3DuplexFold } from "./a3FoldLayout";
import type { OpenBlock } from "./hooks/useSheetConfig";

type GenerateResult = {
  pdf_path: string;
  sheet_uuid: string;
  download_url: string;
  layout_warnings?: string[];
};

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
  { kind: "digits", short: "Rəqəm bloku", title: "Şagird kodu, məktəb, sinif" },
  { kind: "mcq", short: "Seçim bloku", title: "Qrup, variant, bölmə" },
  { kind: "horizontal_letters", short: "Üfüqi hərf", title: "Yazı xanası + A–Z sırası" },
  { kind: "note", short: "Qeyd", title: "Açıq mətn bloku" },
  { kind: "declaration", short: "Bəyannamə", title: "Bəyannamə mətni + imza xətti" },
];

const PALETTE_ICONS: Partial<Record<LayoutFieldKind, string>> = {
  vertical_letters: "Aa",
  digits: "123",
  mcq: "○",
  horizontal_letters: "A→",
  note: "¶",
  declaration: "Im",
};

const HL_PRESETS = ["ADINIZ", "SOYADINIZ", "ATA ADI"];
const VL_PRESETS = ["ADINIZ", "SOYADINIZ", "ATA ADI", "ƏLAVƏ"];

// ─── Main component ──────────────────────────────────────────────────────────

export default function AnswerSheetDesignerPage() {
  const [params, setSearchParams] = useSearchParams();
  const examIdFromUrl = useMemo(() => {
    const n = Number(params.get("examId") || params.get("exam_id") || "");
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params]);

  const [examId, setExamId] = useState<number | null>(examIdFromUrl);

  useEffect(() => {
    if (examIdFromUrl != null) setExamId(examIdFromUrl);
  }, [examIdFromUrl]);

  const selectExam = (id: number | null) => {
    setExamId(id);
    const next = new URLSearchParams(params);
    if (id != null && id > 0) next.set("examId", String(id));
    else next.delete("examId");
    next.delete("exam_id");
    setSearchParams(next, { replace: true });
  };

  const presetId = useMemo(() => {
    const raw = params.get("presetId") || params.get("preset_id");
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params]);

  const viewOnly = params.get("view") === "1";

  const [presetLabel, setPresetLabel] = useState<string | null>(null);
  const [presetLinkedCount, setPresetLinkedCount] = useState(0);
  const [linkToExam, setLinkToExam] = useState(true);
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
  const [mcqGrid, setMcqGrid] = useState<McqGridPos>({ top_mm: 0, left_mm: contentLeftMm() });
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [foldPanel, setFoldPanel] = useState(1);
  const [canvasZoom, setCanvasZoom] = useState(75);
  const [layoutAdjustedForPdf, setLayoutAdjustedForPdf] = useState(false);

  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const selectedField = selectedFieldId ? layoutFields.find((f) => f.blockId === selectedFieldId) ?? null : null;
  const mcqGridSelected = selectedFieldId === MCQ_GRID_DRAG_ID;
  const selectedMcqSectionIndex =
    selectedFieldId != null ? parseMcqSectionDragIndex(selectedFieldId) : null;
  const selectedMcqSection =
    selectedMcqSectionIndex != null
      ? resolveMcqSections(config)[selectedMcqSectionIndex] ?? null
      : null;
  const showMcqGridLabel = shouldShowMcqGridLabel(config);

  const examReady = examId != null && examId > 0;

  const examsPickerQuery = useQuery({
    queryKey: ["exams-picker"],
    queryFn: () => listExams(),
    enabled: presetId != null && !examReady,
  });

  const examQuery = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => getExam(examId!),
    enabled: examReady,
  });

  const templatePayload = useMemo((): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      ...config,
      identity_section: true,
      layout_mode: "freeform",
      identity_fields: fieldsToApiPayload(layoutFields),
      mcq_grid: { top_mm: mcqGrid.top_mm, left_mm: mcqGrid.left_mm },
    };
    if (config.mcq_sections?.length) {
      payload.mcq_sections = config.mcq_sections;
    }
    const sk = buildSheetAnswerKey(answerKey);
    if (sk) payload.sheet_answer_key = sk;
    return payload;
  }, [config, layoutFields, mcqGrid, answerKey]);

  const apiPayload = useMemo(
    () => ({
      template_config: templatePayload,
      ...(presetId != null ? { layout_preset_id: presetId } : {}),
    }),
    [templatePayload, presetId],
  );

  const previewDepsKey = useMemo(() => JSON.stringify(templatePayload), [templatePayload]);

  const twoPageLayoutLocal = shouldUseTwoPages(config, layoutFields, mcqGrid.left_mm, mcqGrid.top_mm);

  const auditQuery = useQuery({
    queryKey: ["answer-sheet-audit", examId, previewDepsKey, presetId],
    queryFn: () => auditAnswerSheetLayout(examId!, apiPayload),
    staleTime: 400,
    enabled: examReady && !viewOnly,
  });

  const twoPageLayout = auditQuery.data?.two_page_required ?? twoPageLayoutLocal;
  const layoutWarnings = auditQuery.data?.layout_warnings ?? [];
  const layoutPublishable = auditQuery.data?.publishable ?? layoutWarnings.length === 0;
  const forcedTwoPage =
    config.single_page_layout !== false && auditQuery.data?.two_page_required === true;

  useEffect(() => {
    const eff = auditQuery.data?.effective_template_config;
    if (!eff || viewOnly) return;
    const mg = eff.mcq_grid as { top_mm?: unknown; left_mm?: unknown } | undefined;
    if (!mg || typeof mg !== "object") return;
    const effTop = typeof mg.top_mm === "number" && Number.isFinite(mg.top_mm) ? mg.top_mm : null;
    const effLeft = typeof mg.left_mm === "number" && Number.isFinite(mg.left_mm) ? mg.left_mm : null;
    if (effTop === null && effLeft === null) return;

    setMcqGrid((prev) => {
      const nextTop = effTop ?? prev.top_mm;
      const nextLeft = effLeft ?? prev.left_mm;
      const topChanged = Math.abs(nextTop - prev.top_mm) > 0.05;
      const leftChanged = Math.abs(nextLeft - prev.left_mm) > 0.05;
      if (!topChanged && !leftChanged) return prev;
      setLayoutAdjustedForPdf(true);
      return { top_mm: nextTop, left_mm: nextLeft };
    });
  }, [auditQuery.data?.effective_template_config, viewOnly]);

  useEffect(() => {
    setLayoutAdjustedForPdf(false);
  }, [previewDepsKey]);

  useEffect(() => {
    const ex = examQuery.data;
    if (!ex) return;
    setConfig((prev) => {
      const next: SheetConfig = {
        ...prev,
        question_count: ex.question_count,
        options_per_question: ex.options_per_question as SheetConfig["options_per_question"],
        columns_count: ex.columns_count as SheetConfig["columns_count"],
      };
      if (!prev.mcq_sections?.length) {
        const fromExam = buildMcqSectionsFromGrading(
          ex.grading_config as Record<string, unknown>,
          ex.columns_count as SheetConfig["columns_count"],
        );
        if (fromExam?.length) next.mcq_sections = fromExam;
      }
      return next;
    });
  }, [examQuery.data]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

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
        setPresetLinkedCount(p.exams_linked_count ?? 0);
        const tc = (p.template_config ?? {}) as Record<string, unknown>;
        const cfgLoaded = sheetConfigFromPayload(tc);
        setConfig(
          isA3DuplexFold(cfgLoaded) && !cfgLoaded.fold_panels
            ? ensureFoldPanels(cfgLoaded)
            : cfgLoaded,
        );
        setLayoutFields(fieldsFromApiPayload(tc.identity_fields, cfgLoaded));
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
    if (kind === "digits") {
      const presets = [
        { label: "Şagird kodu", id: "student_code", count: 6 },
        { label: "Məktəb №", id: "sch", count: 3 },
        { label: "Sinif", id: "cl", count: 2 },
        { label: "İş №", id: "work", count: 6 },
      ];
      const n = layoutFields.filter((x) => x.kind === "digits").length;
      const p = presets[n] ?? { label: "Rəqəm", id: `num_${n}`, count: 6 };
      if (p.id === "student_code" && examQuery.data?.course_id == null) {
        window.alert("Kurssuz imtahanda 6 rəqəmli şagird kodu bloku əlavə oluna bilməz.");
        return;
      }
      f.label = p.label;
      f.id = p.id;
      f.count = p.count;
    }
    if (kind === "mcq") {
      const presets = [
        { label: "Qrup", id: "grp", options: ["1", "2", "3", "4", "5"] },
        { label: "Variant", id: "var", options: ["A", "B"] },
        { label: "Bölmə", id: "sec", options: ["Az", "RU", "GÜ"] },
      ];
      const n = layoutFields.filter((x) => x.kind === "mcq").length;
      const p = presets[n] ?? { label: "Seçim", id: `mq_${n}`, options: ["A", "B", "C", "D"] };
      f.label = p.label;
      f.id = p.id;
      f.options = p.options;
    }
    const y0 = identityZoneTopMmRef() + 10;
    let bottom = y0;
    for (const ex of layoutFields) {
      const ey = Number(ex.y_mm ?? y0);
      bottom = Math.max(bottom, ey + estimateBlockHeightMm(ex, config));
    }
    f.x_mm = contentLeftMm();
    f.y_mm = layoutFields.length === 0 ? y0 : bottom + IDENTITY_STACK_GAP_MM;
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
    setMcqGrid({ top_mm: 0, left_mm: contentLeftMm() });
    setSelectedFieldId(null);
  };

  // ─── Generate PDF ────────────────────────────────────────────────────────

  const savePresetLayout = async () => {
    if (presetId == null) return;
    const tc = { ...templatePayload };
    delete tc.sheet_answer_key;
    setPresetSaving(true);
    try {
      const updated = await updateAnswerSheetPreset(presetId, { template_config: tc });
      const utc = updated.template_config as Record<string, unknown>;
      const cfgLoaded = sheetConfigFromPayload(utc);
      const prevFields = layoutFields;
      setConfig(cfgLoaded);
      setLayoutFields(
        mergePreservedFieldPositions(fieldsFromApiPayload(utc.identity_fields, cfgLoaded), prevFields),
      );
      setMcqGrid(mcqGridFromPayload(utc.mcq_grid));
      setToast({ kind: "ok", text: "Şablon saxlanıldı." });
      if (linkToExam && examId != null && examId > 0) {
        await updateExam(examId, { answer_sheet_preset_id: presetId });
        setToast({ kind: "ok", text: "Şablon saxlanıldı və imtahana bağlandı." });
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setToast({ kind: "err", text: String(msg || "Şablon saxlanmadı.") });
    } finally {
      setPresetSaving(false);
    }
  };

  const generatePdf = async () => {
    if (viewOnly || !examReady) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (linkToExam && examId != null && examId > 0 && presetId != null) {
        await updateExam(examId, { answer_sheet_preset_id: presetId });
      }
      const res = await generateAnswerSheet(examId!, apiPayload);
      setResult(res);
      await downloadAnswerSheetPdf(examId!, res.sheet_uuid);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // ─── UI ─────────────────────────────────────────────────────────────────

  if (presetId == null) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f0f0f5] font-sans text-slate-900 antialiased">
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f0f0f5] font-sans text-slate-900 antialiased">
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
              {examReady ? (
                <>İmtahan № {examId}</>
              ) : (
                <span className="text-amber-700">İmtahan seçilməyib</span>
              )}
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
              onClick={() => downloadAnswerSheetPdf(examId!, result.sheet_uuid)}
              className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-[13px] font-medium text-emerald-800 hover:bg-emerald-100"
            >
              ↓ Yüklə
            </button>
          )}
          {result?.layout_warnings && result.layout_warnings.length > 0 && (
            <span className="max-w-[220px] truncate text-[11px] text-amber-800" title={result.layout_warnings.join("\n")}>
              Layout xəbərdarlığı ({result.layout_warnings.length})
            </span>
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
              to={`/designer?presetId=${presetId}&examId=${examId ?? ""}`}
              className="rounded-full bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Redaktə et
            </Link>
          ) : (
            <>
              <button
                type="button"
                disabled={loading || !examReady || !layoutPublishable}
                onClick={generatePdf}
                className="rounded-full px-5 py-2 text-[13px] font-semibold text-white shadow-sm disabled:opacity-60"
                style={{ background: loading ? "#94a3b8" : "#c0176a" }}
              >
                {loading ? "Hazırlanır…" : "PDF Yarat"}
              </button>
              {presetId != null ? (
                <>
                  {presetLinkedCount > 0 ? (
                    <p className="mr-2 max-w-xs text-[11px] text-amber-800">
                      Bu dizayn şablonu {presetLinkedCount} imtahanda istifadə olunur; dəyişiklik yalnız növbəti PDF
                      yaradılışına təsir edəcək.
                    </p>
                  ) : null}
                  {examId != null && examId > 0 ? (
                    <label className="mr-2 flex items-center gap-1.5 text-[12px] text-slate-700">
                      <input
                        type="checkbox"
                        checked={linkToExam}
                        onChange={(e) => setLinkToExam(e.target.checked)}
                      />
                      Bu imtahana bağla
                    </label>
                  ) : null}
                  <button
                  type="button"
                  disabled={presetSaving}
                  onClick={() => void savePresetLayout()}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {presetSaving ? "Saxlanır…" : "Şablonu saxla"}
                </button>
                </>
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
              to={`/designer?presetId=${presetId}&examId=${examId ?? ""}`}
              className="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-center text-[12px] font-semibold text-white hover:bg-indigo-700"
            >
              Redaktə rejiminə keç
            </Link>
          </aside>
        ) : (
          <aside className="flex w-[272px] shrink-0 flex-col border-r border-slate-200/80 bg-[#f5f5f7]">
            <div className="shrink-0 p-3 pb-2">
              <div className="flex rounded-[10px] bg-slate-200/70 p-0.5">
                {(["settings", "answers"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setLeftTab(t)}
                    className={`flex-1 rounded-[8px] py-1.5 text-[12px] font-semibold transition ${
                      leftTab === t
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    {t === "settings" ? "Dizayn" : "Açar"}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              {leftTab === "settings" && (
                <div className="space-y-4">
                  <section className="space-y-1.5">
                    <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Başlanğıc
                    </h3>
                    <button
                      type="button"
                      onClick={loadDimTemplate}
                      title="Dövlət standartına yaxın hazır düzülüş"
                      className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:bg-slate-50/90 active:scale-[0.99]"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                        style={{ background: "linear-gradient(135deg, #c0176a, #9b1257)" }}
                      >
                        DİM
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-slate-900">Standart şablon</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                          Ad, soyad, kod sahələri
                        </span>
                      </span>
                    </button>
                  </section>

                  <section className="space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Sahələr
                      </h3>
                      {layoutFields.length > 0 ? (
                        <button
                          type="button"
                          onClick={clearAll}
                          className="text-[11px] font-medium text-red-600 hover:text-red-700"
                        >
                          Təmizlə
                        </button>
                      ) : null}
                    </div>
                    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
                      {PALETTE.map((item, i) => (
                        <button
                          key={item.kind}
                          type="button"
                          title={item.title}
                          onClick={() => addField(item.kind)}
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 active:bg-slate-100 ${
                            i < PALETTE.length - 1 ? "border-b border-slate-100" : ""
                          }`}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600">
                            {PALETTE_ICONS[item.kind] ?? "·"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-slate-900">{item.short}</span>
                            <span className="block truncate text-[11px] text-slate-500">{item.title}</span>
                          </span>
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[14px] font-light text-slate-500">
                            +
                          </span>
                        </button>
                      ))}
                    </div>
                    {layoutFields.length > 0 ? (
                      <p className="px-1 text-[10px] text-slate-500">
                        {layoutFields.length} sahə · kanvasda sürükləyin
                      </p>
                    ) : null}
                  </section>

                  <ConfigPanel
                    config={config}
                    onChange={setConfig}
                    examManaged={examReady}
                    showMcqGridLabel={showMcqGridLabel}
                    activeFoldPanel={foldPanel}
                    onJumpToFoldPanel={setFoldPanel}
                  />
                </div>
              )}

              {leftTab === "answers" && (
                <div className="pt-1">
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
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-3 pt-3">
            {!examReady && (
              <div className="mx-auto mb-4 max-w-xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-950">
                <p className="font-semibold">İmtahan (önizləmə / PDF üçün)</p>
                <p className="mt-1 text-amber-900">
                  Dizaynı indi redaktə edə bilərsiniz. Canlı önizləmə, audit və PDF üçün imtahan seçin — sual sayı həmin imtahandan götürülür.
                </p>
                <select
                  className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-[13px]"
                  value={examId ?? ""}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    selectExam(Number.isFinite(n) && n > 0 ? n : null);
                  }}
                >
                  <option value="">— İmtahan seçin —</option>
                  {(examsPickerQuery.data ?? []).map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      №{ex.id} — {ex.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {layoutAdjustedForPdf && examReady && (
              <div className="mx-auto mb-3 max-w-xl rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-900">
                Cavab şəbəkəsi mövqeyi PDF üçün avtomatik tənzimləndi (şəxsiyyət zonası ilə toqquşmanın qarşısı).
              </div>
            )}
            {forcedTwoPage && (
              <div className="mx-auto mb-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
                Sual sayı və ya şəxsiyyət zonası səbəbindən kart avtomatik <strong>2 səhifə</strong> olacaq
                (PDF yayımlananda «Tək səhifə» seçimi nəzərə alınmayacaq).
                {config.question_count >= 60 ? (
                  <>
                    {" "}
                    <strong>{config.question_count} sualın cavab şəbəkəsi 2-ci səhifədədir</strong> — PDF-i endirəndə
                    hər iki səhifəni çap edin.
                  </>
                ) : null}
              </div>
            )}

            {error && (
              <div className="mx-auto mb-3 max-w-lg whitespace-pre-wrap rounded-xl border border-red-200 bg-white px-3 py-2 text-[12px] text-red-700 shadow-sm">
                {error}
              </div>
            )}

            <FreeformCanvas
              sheetConfig={config}
              sheetUuidPreview={result?.sheet_uuid}
              fields={layoutFields}
              mcq={mcqGrid}
              showSecondPage={twoPageLayout && !isA3DuplexFold(config)}
              selectedFieldId={selectedFieldId}
              onFieldsChange={setLayoutFields}
              onMcqChange={setMcqGrid}
              onMcqSectionsChange={(sections: McqSection[]) =>
                setConfig((prev) => ({ ...prev, mcq_sections: sections }))
              }
              onOpenBlocksChange={(blocks: OpenBlock[]) =>
                setConfig((prev) => ({ ...prev, open_blocks: blocks }))
              }
              onSelectField={handleSelectField}
              readOnly={viewOnly}
              zoom={canvasZoom}
              foldPanel={foldPanel}
              onFoldPanelChange={setFoldPanel}
            />

            {result && (
              <div className="mx-auto mt-3 max-w-lg rounded-xl border border-emerald-200 bg-white px-3 py-2 shadow-sm">
                <p className="text-[12px] font-semibold text-emerald-800">✓ PDF hazır!</p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-400">{result.sheet_uuid}</p>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-slate-200/90 bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur-md">
            <div className="flex justify-center border-b border-slate-100/80 px-3 py-1.5">
              <ZoomToolbar zoom={canvasZoom} onZoomChange={setCanvasZoom} />
            </div>
            <div className="px-3 py-1.5">
              <div className="mx-auto flex max-w-3xl flex-col items-center gap-0.5 text-center sm:flex-row sm:justify-center sm:gap-4 sm:text-left">
                <p className="text-[10px] text-slate-600">
                {viewOnly ? (
                  <>Yalnız baxış — dəyişiklik üçün «Redaktə et».</>
                ) : layoutFields.length === 0 ? (
                  <>Soldan sahə əlavə edin və ya <strong className="font-medium text-slate-800">DİM şablonu</strong> seçin.</>
                ) : (
                  <>
                    <strong className="font-semibold text-slate-800">{layoutFields.length}</strong> sahə · başlıq zolağından tutub sürükləyin
                    {selectedField ? (
                      <>
                        {" "}
                        · <span style={{ color: "#9b1257" }}>{String(selectedField.label ?? selectedField.kind)}</span>
                      </>
                    ) : selectedMcqSection ? (
                      <>
                        {" "}
                        · <span style={{ color: "#9b1257" }}>{selectedMcqSection.title}</span>
                      </>
                    ) : mcqGridSelected && showMcqGridLabel ? (
                      <>
                        {" "}
                        · <span style={{ color: "#9b1257" }}>{config.mcq_grid_label ?? "CAVABLAR"}</span>
                      </>
                    ) : null}
                  </>
                )}
              </p>
              <p className="text-[10px] text-slate-400 sm:border-l sm:border-slate-200 sm:pl-4">
                {showMcqGridLabel
                  ? "Cavab şəbəkəsi: maqenta başlıqdan sürükləyin"
                  : "Hər fənn blokunu öz başlığından sürükləyin"}
                {" · "}
                {config.question_count} sual
                {twoPageLayout ? " · 2 səhifə" : ""}
              </p>
              </div>
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
                {selectedField || mcqGridSelected ? "Xüsusiyyətlər" : "Seçilməyib"}
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {rightPanel === "preview" && (
              <div className="p-3">
                {layoutWarnings.length > 0 && (
                  <div
                    className={`mb-3 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${
                      layoutPublishable
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    <p className="mb-1 font-semibold">
                      {layoutPublishable ? "Layout xəbərdarlıqları" : "PDF yayımlanmaz — layout düzəldin"}
                    </p>
                    <ul className="list-inside list-disc space-y-0.5">
                      {layoutWarnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {auditQuery.isFetching && layoutWarnings.length === 0 && (
                  <p className="mb-2 text-[11px] text-slate-400">Layout yoxlanılır…</p>
                )}
                <LiveSheetPreview
                  examId={examId ?? 0}
                  templatePayload={templatePayload}
                  layoutPresetId={presetId}
                  depsKey={previewDepsKey}
                  pageCount={isA3DuplexFold(config) || twoPageLayout ? 2 : 1}
                  pageLabels={isA3DuplexFold(config) ? ["Üz 1", "Üz 2"] : undefined}
                  layoutWarnings={layoutWarnings}
                  publishable={layoutPublishable}
                />
              </div>
            )}

            {rightPanel === "props" && mcqGridSelected && showMcqGridLabel ? (
              <McqGridPropertiesPanel
                sheetConfig={config}
                mcqGrid={mcqGrid}
                onConfigChange={setConfig}
                onMcqChange={setMcqGrid}
              />
            ) : rightPanel === "props" && selectedField ? (
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
                  Şəxsiyyət sahəsi, fənn bloku və ya cavab şəbəkəsi başlığına klikləyin
                </p>
              </div>
            ) : null}
          </div>

          {/* Field list (mini) in props mode */}
          {rightPanel === "props" && (
            <div className="shrink-0 border-t border-slate-100">
              <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sahələr</p>
              <div className="max-h-40 overflow-y-auto">
                {showMcqGridLabel ? (
                  <button
                    type="button"
                    onClick={() => handleSelectField(MCQ_GRID_DRAG_ID)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] transition hover:bg-slate-50 ${
                      mcqGridSelected ? "bg-[#fdf0f6] font-medium text-[#9b1257]" : "text-slate-700"
                    }`}
                  >
                    <span className="shrink-0 text-[10px] text-slate-400">CV</span>
                    <span className="min-w-0 truncate">{config.mcq_grid_label ?? "CAVABLAR"}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">
                      {mcqGrid.left_mm.toFixed(0)},{mcqGrid.top_mm.toFixed(0)}
                    </span>
                  </button>
                ) : (
                  resolveMcqSections(config).map((sec, i) => {
                    if (!String(sec.title ?? "").trim()) return null;
                    const dragId = mcqSectionDragId(i);
                    const selected = selectedFieldId === dragId;
                    const top = sec.top_mm ?? mcqGrid.top_mm;
                    const left = sec.left_mm ?? mcqGrid.left_mm;
                    return (
                      <button
                        key={dragId}
                        type="button"
                        onClick={() => handleSelectField(dragId)}
                        className={`flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] transition hover:bg-slate-50 ${
                          selected ? "bg-[#fdf0f6] font-medium text-[#9b1257]" : "text-slate-700"
                        }`}
                      >
                        <span className="shrink-0 text-[10px] text-slate-400">FN</span>
                        <span className="min-w-0 truncate">{sec.title}</span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">
                          {left.toFixed(0)},{top.toFixed(0)}
                        </span>
                      </button>
                    );
                  })
                )}
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
            examId={examId ?? 0}
            templatePayload={templatePayload}
            layoutPresetId={presetId}
            depsKey={`${previewDepsKey}-modal`}
            pageCount={isA3DuplexFold(config) || twoPageLayout ? 2 : 1}
            pageLabels={isA3DuplexFold(config) ? ["Üz 1", "Üz 2"] : undefined}
            layoutWarnings={layoutWarnings}
            publishable={layoutPublishable}
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

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-xl px-4 py-2.5 text-[13px] font-medium shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-700 text-white" : "bg-red-700 text-white"
          }`}
          role="status"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
