import React from "react";
import {
  applyIdentityMcqBubbleSync,
  defaultDimMcqMatchInfo,
  estimateBlockHeightMm,
  estimateBlockWidthMm,
  verticalLettersRowPitchMm,
  type LayoutField,
} from "./layoutBlockModel";
import type { SheetConfig } from "./hooks/useSheetConfig";
import {
  LAYOUT_CONTENT_LEFT_MM,
  identityZoneTopMmRef,
  layoutContentRightMaxMm,
  layoutPaperHeightMm,
  layoutPaperWidthMm,
} from "../../constants/sheetLayoutSpec";

const FOOTER_RESERVE_MM = 40;

function effectiveConfig(cfg: SheetConfig): SheetConfig {
  const mcqMatch = defaultDimMcqMatchInfo(cfg);
  return cfg.identity_match_mcq_bubbles ? applyIdentityMcqBubbleSync(cfg, mcqMatch) : cfg;
}

function clampFieldXMm(field: LayoutField, x: number, cfg: SheetConfig): number {
  const eff = effectiveConfig(cfg);
  const mcqMatch = defaultDimMcqMatchInfo(cfg);
  const pw = layoutPaperWidthMm(cfg.paper_size);
  const xl = LAYOUT_CONTENT_LEFT_MM;
  const maxLeft = layoutContentRightMaxMm(pw) - estimateBlockWidthMm(field, eff, mcqMatch);
  return Math.min(Math.max(x, xl), Math.max(xl, maxLeft));
}

function maxFieldYMm(field: LayoutField, cfg: SheetConfig): number {
  const eff = effectiveConfig(cfg);
  const mcqMatch = defaultDimMcqMatchInfo(cfg);
  const ph = layoutPaperHeightMm(cfg.paper_size);
  const blockH = estimateBlockHeightMm(field, eff, mcqMatch);
  return Math.max(identityZoneTopMmRef() + 2, ph - FOOTER_RESERVE_MM - blockH);
}
type Props = {
  field: LayoutField;
  onUpdate: (updated: LayoutField) => void;
  onRemove: () => void;
  sheetConfig: SheetConfig;
};

type Group = { id?: string; label?: string; options?: string[] };

const KIND_LABELS: Record<string, string> = {
  vertical_letters: "Şaquli hərf kodu",
  horizontal_letters: "Üfüqi hərf kodu",
  digits: "Rəqəm sütunları",
  mcq_groups: "Seçim qrupları",
  mcq: "Tək seçim",
  note: "Qeyd xanası",
  declaration: "Bəyannamə + imza",
  digit_groups: "Rəqəm qrupları",
};

const inp =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none transition focus:border-[#c0176a] focus:ring-2 focus:ring-[#fce8f3]";
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={label} hint={`${value.toFixed(step && step < 1 ? 1 : 0)}${unit ?? ""}`}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-[#c0176a]"
        />
        <span className="w-12 shrink-0 rounded-lg border border-slate-200 bg-slate-50 py-1 text-center text-[12px] font-mono font-medium text-slate-800">
          {value.toFixed(step && step < 1 ? 1 : 0)}
          {unit}
        </span>
      </div>
    </Row>
  );
}

function Divider() {
  return <div className="border-t border-slate-200/80" />;
}

export default function FieldPropertiesPanel({ field, onUpdate, onRemove, sheetConfig }: Props) {
  const upd = (changes: Record<string, unknown>) => onUpdate({ ...field, ...changes } as LayoutField);
  const effCfg = effectiveConfig(sheetConfig);
  const mcqMatch = defaultDimMcqMatchInfo(sheetConfig);
  const xMax = Math.max(
    LAYOUT_CONTENT_LEFT_MM,
    layoutContentRightMaxMm(layoutPaperWidthMm(sheetConfig.paper_size)) -
      estimateBlockWidthMm(field, effCfg, mcqMatch),
  );
  const yMax = maxFieldYMm(field, sheetConfig);
  const yMin = identityZoneTopMmRef() + 2;

  return (
    <div className="space-y-5 overflow-y-auto">
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b1257]">
            {KIND_LABELS[field.kind] ?? field.kind}
          </p>
          <h3 className="mt-0.5 text-[16px] font-semibold text-slate-900">
            {String(field.label ?? field.id ?? "Sahə")}
          </h3>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-0.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-red-600 transition hover:bg-red-50"
        >
          Sil
        </button>
      </div>

      <Divider />

      <div className="space-y-5 px-4 pb-6">
        {/* Label */}
        {field.kind !== "mcq_groups" && (
          <>
            {(field.kind === "horizontal_letters" || field.kind === "vertical_letters") && (
              <div className="space-y-1.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Hazır başlıqlar</span>
                <div className="flex flex-wrap gap-1">
                  {["ADINIZ", "SOYADINIZ", "ATA ADI", "MƏKTƏB", "SİNİF", "QRUP", "VARIANT"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => upd({ label: t })}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:border-[#c0176a]/40 hover:bg-[#fdf0f6]"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Row label="Başlıq (kağızda və imtahanda görünən)">
              <input
                className={inp}
                value={String(field.label ?? "")}
                onChange={(e) => upd({ label: e.target.value })}
                placeholder={field.kind === "horizontal_letters" ? "məs. ADINIZ" : ""}
              />
            </Row>
          </>
        )}

        {/* ID (OMR column name) */}
        {(field.kind === "vertical_letters" ||
          field.kind === "horizontal_letters" ||
          field.kind === "digits" ||
          field.kind === "mcq") && (
          <Row label="OMR kodu" hint="skan oxuma üçün">
            <input
              className={inp}
              placeholder="məs. ad, sn, tel"
              value={String((field as Record<string, unknown>).id ?? "")}
              onChange={(e) => upd({ id: e.target.value })}
            />
          </Row>
        )}

        <Divider />

        {/* vertical_letters */}
        {field.kind === "vertical_letters" && (
          <>
            <SliderRow
              label="Sütun sayı (max. hərf sayı)"
              value={Number(field.columns ?? 8)}
              min={1}
              max={20}
              onChange={(v) => upd({ columns: v })}
            />
            <SliderRow
              label="Sütun eni"
              value={Number(field.col_pitch_mm ?? 4.5)}
              min={3}
              max={10}
              step={0.1}
              unit=" mm"
              onChange={(v) => upd({ col_pitch_mm: v })}
            />
            {(() => {
              const ld = sheetConfig.identity_letter_d_mm;
              const lvg = sheetConfig.identity_letter_vgap_mm;
              const eff = verticalLettersRowPitchMm(ld, lvg, field);
              const val = Number(field.bubble_pitch_mm ?? eff);
              const pMin = ld + 0.1;
              const pMax = ld + 4.0;
              return (
                <SliderRow
                  label="Balonlar arası (şaquli)"
                  value={Math.min(pMax, Math.max(pMin, val))}
                  min={pMin}
                  max={pMax}
                  step={0.05}
                  unit=" mm"
                  onChange={(v) => upd({ bubble_pitch_mm: v })}
                />
              );
            })()}
          </>
        )}

        {/* digits */}
        {field.kind === "digits" && (
          <SliderRow
            label="Rəqəm sütunu sayı"
            value={Number(field.count ?? 6)}
            min={1}
            max={15}
            onChange={(v) => upd({ count: v })}
          />
        )}

        {/* horizontal_letters */}
        {field.kind === "horizontal_letters" && (
          <>
            <SliderRow
              label="Sətir sayı"
              value={Number(field.rows ?? 4)}
              min={1}
              max={20}
              onChange={(v) => upd({ rows: v })}
            />

            <Row label="Rejim">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 accent-sky-600"
                  checked={field.row_layout === "handwrite_coding"}
                  onChange={(e) => upd({ row_layout: e.target.checked ? "handwrite_coding" : undefined })}
                />
                <span className="text-[13px] text-slate-700">Yazı xanası + altında əlifba</span>
              </label>
            </Row>
          </>
        )}

        {/* mcq_groups */}
        {field.kind === "mcq_groups" && <McqGroupsEditor field={field} onUpdate={onUpdate} />}

        {/* mcq */}
        {field.kind === "mcq" && (
          <Row label="Variantlar" hint="vergüllə">
            <input
              className={inp}
              value={((field.options as string[] | undefined) ?? ["A", "B", "C", "D"]).join(",")}
              onChange={(e) => upd({ options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </Row>
        )}

        {/* note */}
        {field.kind === "note" && (
          <SliderRow
            label="Sətir sayı"
            value={Number(field.lines ?? 2)}
            min={1}
            max={10}
            onChange={(v) => upd({ lines: v })}
          />
        )}

        {/* declaration */}
        {field.kind === "declaration" && (
          <>
            <Row label="Bəyannamə mətni">
              <textarea
                className={`${inp} min-h-[4.5rem] resize-y`}
                value={String(field.text ?? "")}
                onChange={(e) => upd({ text: e.target.value })}
              />
            </Row>
            <Row label="İmza etiketi">
              <input
                className={inp}
                value={String(field.signature_label ?? "İmza")}
                onChange={(e) => upd({ signature_label: e.target.value })}
              />
            </Row>
            <Row label="En (mm)">
              <input
                className={inp}
                type="number"
                step={1}
                min={40}
                max={200}
                value={Number(field.box_w_mm ?? 175)}
                onChange={(e) => upd({ box_w_mm: Number(e.target.value) })}
              />
            </Row>
            <Row label="Hündürlük (mm)">
              <input
                className={inp}
                type="number"
                step={1}
                min={16}
                max={60}
                value={Number(field.box_h_mm ?? 28)}
                onChange={(e) => upd({ box_h_mm: Number(e.target.value) })}
              />
            </Row>
          </>
        )}

        <Divider />

        {/* Position */}
        <Row label="Mövqe (mm)">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1.5 text-[11px] text-slate-500">Sol ← X</p>
              <input
                type="number"
                className={inp}
                step={0.5}
                min={LAYOUT_CONTENT_LEFT_MM}
                max={Math.round(xMax * 10) / 10}
                value={Number(field.x_mm.toFixed(1))}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const cx = clampFieldXMm(field, Number.isFinite(raw) ? raw : LAYOUT_CONTENT_LEFT_MM, sheetConfig);
                  onUpdate({ ...field, x_mm: cx });
                }}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] text-slate-500">Yuxarı ↓ Y</p>
              <input
                type="number"
                className={inp}
                step={0.5}
                min={yMin}
                max={Math.round(yMax * 10) / 10}
                value={Number(field.y_mm.toFixed(1))}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const cy = Number.isFinite(raw)
                    ? Math.min(Math.max(raw, yMin), yMax)
                    : yMin;
                  onUpdate({ ...field, y_mm: cy });
                }}
              />
            </div>
          </div>
        </Row>
      </div>
    </div>
  );
}

function McqGroupsEditor({ field, onUpdate }: { field: LayoutField; onUpdate: (f: LayoutField) => void }) {
  const groups = (field.groups as Group[] | undefined) ?? [];

  const updateGroup = (idx: number, changes: Partial<Group>) => {
    const next = groups.map((g, i) => (i === idx ? { ...g, ...changes } : g));
    onUpdate({ ...field, groups: next });
  };

  const addGroup = () => {
    onUpdate({
      ...field,
      groups: [
        ...groups,
        { id: `g${groups.length}`, label: "Yeni qrup", options: ["A", "B"] },
      ],
    });
  };

  const removeGroup = (idx: number) => {
    onUpdate({ ...field, groups: groups.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Qruplar</p>
      {groups.map((g, idx) => (
        <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-sky-400"
              placeholder="Başlıq"
              value={String(g.label ?? "")}
              onChange={(e) => updateGroup(idx, { label: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeGroup(idx)}
              className="shrink-0 rounded-full p-1.5 text-[14px] leading-none text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              ×
            </button>
          </div>
          <div>
            <p className="mb-1 text-[11px] text-slate-500">Variantlar (vergüllə: A,B,C)</p>
            <input
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-mono outline-none focus:border-sky-400"
              value={((g.options ?? []) as string[]).join(",")}
              onChange={(e) =>
                updateGroup(idx, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
              }
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addGroup}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-[13px] font-medium text-slate-600 transition hover:border-sky-300 hover:bg-sky-50/60 hover:text-sky-700"
      >
        + Qrup əlavə et
      </button>
    </div>
  );
}
