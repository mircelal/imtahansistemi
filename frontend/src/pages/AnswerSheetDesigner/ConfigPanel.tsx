import { useState } from "react";
import type { PaperSize, SheetConfig } from "./hooks/useSheetConfig";

type Props = {
  config: SheetConfig;
  onChange: (next: SheetConfig) => void;
  /** Dizayner sol panelində — başlıq gizlədilir, daha sıx */
  compact?: boolean;
};

const PAPER_LABELS: Record<PaperSize, string> = {
  A4: "A4",
  A4L: "A4 üfüqi",
  A3: "A3",
  A3L: "A3 üfüqi",
};

function Field({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <label className={`block font-medium text-slate-700 ${compact ? "text-[11px]" : "text-[13px]"}`}>{label}</label>
      {children}
    </div>
  );
}

const inp =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const inpCompact =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-900 outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-100";
const sel = inp;

export default function ConfigPanel({ config, onChange, compact = false }: Props) {
  const [pro, setPro] = useState(false);
  const fi = compact ? inpCompact : inp;
  const sc = compact ? "space-y-3" : "space-y-5";

  return (
    <div className={sc}>
      {!compact && (
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">Kart</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">Əsas ölçülər və mətnlər</p>
        </div>
      )}

      <Field label="Başlıq (PDF magentada)" compact={compact}>
        <input className={fi} type="text" value={config.title} onChange={(e) => onChange({ ...config, title: e.target.value })} />
      </Field>
      <Field label="Alt sətir (istəyə görə)" compact={compact}>
        <textarea
          className={fi}
          rows={compact ? 2 : 2}
          placeholder="Boş saxlayın — yalnız başlıq çap olunur"
          value={config.header_subtitle}
          onChange={(e) => onChange({ ...config, header_subtitle: e.target.value })}
        />
      </Field>

      <Field label="Kağız" compact={compact}>
        <select
          className={compact ? fi : sel}
          value={config.paper_size}
          onChange={(e) => onChange({ ...config, paper_size: e.target.value as PaperSize })}
        >
          {(Object.keys(PAPER_LABELS) as PaperSize[]).map((k) => (
            <option key={k} value={k}>
              {PAPER_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      <div className={`grid grid-cols-2 ${compact ? "gap-2" : "gap-3"}`}>
        <Field label="Sual sayı" compact={compact}>
          <input
            className={fi}
            type="number"
            min={5}
            max={300}
            value={config.question_count}
            onChange={(e) => onChange({ ...config, question_count: Number(e.target.value) })}
          />
        </Field>
        <Field label="Sütun" compact={compact}>
          <select
            className={compact ? fi : sel}
            value={config.columns_count}
            onChange={(e) =>
              onChange({ ...config, columns_count: Number(e.target.value) as SheetConfig["columns_count"] })
            }
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Variant" compact={compact}>
        <div className="flex flex-wrap gap-2">
          {([2, 3, 4, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ ...config, options_per_question: n })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                config.options_per_question === n
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>

      <div
        className={`space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/60 ${compact ? "p-2" : "p-3"}`}
      >
        <p className={`font-medium text-slate-800 ${compact ? "text-[12px]" : "text-[13px]"}`}>Sual şəbəkəsi (OMR)</p>
        <Field label="Sual yerləşməsi" compact={compact}>
          <select
            className={fi}
            value={config.mcq_options_layout ?? "vertical"}
            onChange={(e) =>
              onChange({ ...config, mcq_options_layout: e.target.value as NonNullable<SheetConfig["mcq_options_layout"]> })
            }
          >
            <option value="vertical">DİM tipli (şaquli A–E, soldan sağa)</option>
            <option value="horizontal">Köhnə (variantlar üfüqi)</option>
          </select>
        </Field>
        <label className={`flex cursor-pointer items-start gap-2 ${compact ? "text-[11px]" : "text-sm"}`}>
          <input
            type="checkbox"
            className="mt-0.5 rounded border-slate-300"
            checked={config.mcq_auto_fit !== false}
            onChange={(e) => onChange({ ...config, mcq_auto_fit: e.target.checked })}
          />
          <span className="text-slate-700">
            Balon və şaquli aralığı avtomatik sığdır{" "}
            <span className="text-slate-500">(bir səhifəyə sığmaq üçün kiçildir)</span>
          </span>
        </label>
        <Field label="Variantlar arası (üfüqi) mm" compact={compact}>
          <input
            className={fi}
            type="number"
            step={0.05}
            min={3.2}
            max={12}
            value={config.mcq_hgap_mm}
            onChange={(e) => onChange({ ...config, mcq_hgap_mm: Number(e.target.value) })}
          />
        </Field>
        {config.mcq_auto_fit === false && (
          <div className={`grid grid-cols-2 ${compact ? "gap-2" : "gap-3"}`}>
            <Field label="Balon Ø mm" compact={compact}>
              <input
                className={fi}
                type="number"
                step={0.05}
                min={2.8}
                max={8.5}
                value={config.mcq_bubble_d_mm}
                onChange={(e) => onChange({ ...config, mcq_bubble_d_mm: Number(e.target.value) })}
              />
            </Field>
            <Field label="Sətir aralığı (şaquli) mm" compact={compact}>
              <input
                className={fi}
                type="number"
                step={0.05}
                min={3}
                max={14}
                value={config.mcq_vgap_mm}
                onChange={(e) => onChange({ ...config, mcq_vgap_mm: Number(e.target.value) })}
              />
            </Field>
          </div>
        )}
      </div>

      <label
        className={`flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 ${compact ? "p-2" : "p-3"}`}
      >
        <input
          type="checkbox"
          className="mt-1 rounded border-slate-300"
          checked={config.single_page_layout !== false}
          onChange={(e) => onChange({ ...config, single_page_layout: e.target.checked })}
        />
        <span>
          <span className={`block font-medium text-slate-800 ${compact ? "text-[12px]" : "text-[13px]"}`}>Bir səhifəyə sığdır</span>
          <span className={`mt-0.5 block leading-snug text-slate-500 ${compact ? "text-[10px]" : "text-[11px]"}`}>
            Söndürülsə və suallar sığmırsa, PDF avtomatik 2-ci səhifə əlavə edir.
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={() => setPro((v) => !v)}
        className={`flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white text-left font-medium text-slate-700 shadow-sm hover:bg-slate-50 ${compact ? "px-2 py-2 text-[12px]" : "px-3 py-2.5 text-[13px]"}`}
      >
        Peşəkar ölçülər
        <span className="text-slate-400">{pro ? "−" : "+"}</span>
      </button>

      {pro && (
        <div className={`space-y-4 rounded-xl border border-slate-200/90 bg-white shadow-sm ${compact ? "p-2" : "p-4"}`}>
          <div className={`grid grid-cols-2 ${compact ? "gap-2" : "gap-3"}`}>
            <Field label="AD sətir (şablon)" compact={compact}>
              <input
                className={fi}
                type="number"
                min={1}
                max={20}
                value={config.identity_ad_rows}
                onChange={(e) => onChange({ ...config, identity_ad_rows: Number(e.target.value) })}
              />
            </Field>
            <Field label="Sıx rəqəm" compact={compact}>
              <label className={`flex items-center gap-2 text-slate-600 ${compact ? "text-[11px]" : "text-sm"}`}>
                <input
                  type="checkbox"
                  checked={config.identity_digit_compact}
                  onChange={(e) => onChange({ ...config, identity_digit_compact: e.target.checked })}
                />
                Bəli
              </label>
            </Field>
          </div>
          <label className={`flex cursor-pointer items-start gap-2 ${compact ? "text-[11px]" : "text-sm"}`}>
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={config.identity_match_mcq_bubbles !== false}
              onChange={(e) => onChange({ ...config, identity_match_mcq_bubbles: e.target.checked })}
            />
            <span className="text-slate-700">
              Şaquli sual şəbəkəsi ilə eyni balon ölçüsü{" "}
              <span className="text-slate-500">(şəxsiyyət hərf/rəqəm)</span>
            </span>
          </label>
          <label className={`flex cursor-pointer items-start gap-2 ${compact ? "text-[11px]" : "text-sm"}`}>
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={config.identity_show_notice !== false}
              onChange={(e) => onChange({ ...config, identity_show_notice: e.target.checked })}
            />
            <span className="text-slate-700">Şəxsiyyət üstü DİQQƏT mətni</span>
          </label>
          {config.identity_show_notice !== false && (
            <Field label="Öz DİQQƏT mətniniz (boş = avtomatik)" compact={compact}>
              <textarea
                className={fi}
                rows={compact ? 2 : 3}
                placeholder="Məs: Yalnız qələm ilə doldurun…"
                value={config.identity_notice_text ?? ""}
                onChange={(e) => onChange({ ...config, identity_notice_text: e.target.value })}
              />
            </Field>
          )}
          <div className={`grid grid-cols-2 text-[12px] ${compact ? "gap-2" : "gap-3"}`}>
            <Field label="Hərf Ø mm" compact={compact}>
              <input
                className={fi}
                type="number"
                step={0.05}
                value={config.identity_letter_d_mm}
                onChange={(e) => onChange({ ...config, identity_letter_d_mm: Number(e.target.value) })}
              />
            </Field>
            <Field label="Hərf aralıq mm" compact={compact}>
              <input
                className={fi}
                type="number"
                step={0.05}
                value={config.identity_letter_hgap_mm}
                onChange={(e) => onChange({ ...config, identity_letter_hgap_mm: Number(e.target.value) })}
              />
            </Field>
            <Field label="Rəqəm Ø mm" compact={compact}>
              <input
                className={fi}
                type="number"
                step={0.05}
                value={config.identity_digit_d_mm}
                onChange={(e) => onChange({ ...config, identity_digit_d_mm: Number(e.target.value) })}
              />
            </Field>
            <Field label="Rəqəm aralıq mm" compact={compact}>
              <input
                className={fi}
                type="number"
                step={0.05}
                value={config.identity_digit_vgap_mm}
                onChange={(e) => onChange({ ...config, identity_digit_vgap_mm: Number(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}
