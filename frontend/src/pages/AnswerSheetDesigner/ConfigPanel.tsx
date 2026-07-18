import { useState } from "react";
import type { OpenBlock, PaperSize, McqSection, SheetConfig, SheetFormat } from "./hooks/useSheetConfig";
import { ensureFoldPanels } from "./a3FoldLayout";

type Props = {
  config: SheetConfig;
  onChange: (next: SheetConfig) => void;
  compact?: boolean;
  examManaged?: boolean;
  /** Fənn başlıqlı stacked rejimdə ümumi CAVABLAR gizlidir */
  showMcqGridLabel?: boolean;
  /** A3 qatlanan: yeni açıq sual bu panelə düşür */
  activeFoldPanel?: number;
  onJumpToFoldPanel?: (panel: number) => void;
};

const PAPER_LABELS: Record<PaperSize, string> = {
  A4: "A4",
  A4L: "A4 üfüqi",
  A3: "A3",
  A3L: "A3 üfüqi",
};

function Section({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: string;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">{children}</div>
      {footer ? <p className="px-1 text-[10px] leading-snug text-slate-500">{footer}</p> : null}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
  border = true,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div className={`px-3 py-2.5 ${border ? "border-b border-slate-100 last:border-b-0" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pt-0.5">
          <span className="block text-[13px] font-medium text-slate-900">{label}</span>
          {hint ? <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{hint}</span> : null}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}

function RowStack({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 border-b border-slate-100 px-3 py-2.5 last:border-b-0">
      <div>
        <span className="block text-[13px] font-medium text-slate-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  border = true,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  border?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 ${border ? "border-b border-slate-100 last:border-b-0" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-slate-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{hint}</span> : null}
      </div>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#0071e3] focus:ring-[#0071e3]/30"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function Disclosure({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2.5 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:bg-slate-50/80"
      >
        <div>
          <span className="block text-[13px] font-medium text-slate-900">{title}</span>
          {summary && !open ? (
            <span className="mt-0.5 block text-[11px] text-slate-500">{summary}</span>
          ) : null}
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">{children}</div>
      ) : null}
    </section>
  );
}

const inp =
  "w-full rounded-lg border-0 bg-slate-100/90 px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition focus:bg-white focus:ring-2 focus:ring-[#0071e3]/25";
const inpWide = `${inp} min-w-0`;
const sel =
  "rounded-lg border-0 bg-slate-100/90 py-1.5 pl-2 pr-7 text-[13px] text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-[#0071e3]/25";

function ExamSummary({ config }: { config: SheetConfig }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
        {config.question_count} sual
      </span>
      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
        {config.columns_count} sütun
      </span>
      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
        {config.options_per_question} variant
      </span>
    </div>
  );
}

function McqSectionsEditor({
  config,
  onChange,
}: {
  config: SheetConfig;
  onChange: (next: SheetConfig) => void;
}) {
  const sections = config.mcq_sections ?? [];

  if (!sections.length) {
    return (
      <div className="px-3 py-2.5">
        <button
          type="button"
          className="w-full rounded-lg bg-slate-100 py-2 text-[12px] font-medium text-[#0071e3] transition hover:bg-slate-200/80"
          onClick={() =>
            onChange({
              ...config,
              mcq_sections: [
                {
                  title: "Bölmə 1",
                  from_q: 1,
                  to_q: Math.max(10, Math.min(config.question_count, 30)),
                  columns_count: config.columns_count,
                },
              ],
            })
          }
        >
          Fənn qrupları yarat
        </button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {sections.map((sec, idx) => (
        <div key={idx} className="space-y-2 px-3 py-2.5">
          <input
            className={inpWide}
            placeholder="Fənn adı"
            value={sec.title}
            onChange={(e) => {
              const next = [...sections];
              next[idx] = { ...sec, title: e.target.value };
              onChange({ ...config, mcq_sections: next });
            }}
          />
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <span className="mb-0.5 block text-[10px] text-slate-400">Başlanğıc</span>
              <input
                className={inpWide}
                type="number"
                min={1}
                value={sec.from_q}
                onChange={(e) => {
                  const next = [...sections];
                  next[idx] = { ...sec, from_q: Number(e.target.value) };
                  onChange({ ...config, mcq_sections: next });
                }}
              />
            </div>
            <div>
              <span className="mb-0.5 block text-[10px] text-slate-400">Son</span>
              <input
                className={inpWide}
                type="number"
                min={1}
                value={sec.to_q}
                onChange={(e) => {
                  const next = [...sections];
                  next[idx] = { ...sec, to_q: Number(e.target.value) };
                  onChange({ ...config, mcq_sections: next });
                }}
              />
            </div>
            <div>
              <span className="mb-0.5 block text-[10px] text-slate-400">Sütun</span>
              <select
                className={`${sel} w-full`}
                value={sec.columns_count ?? config.columns_count}
                onChange={(e) => {
                  const next = [...sections];
                  next[idx] = {
                    ...sec,
                    columns_count: Number(e.target.value) as McqSection["columns_count"],
                  };
                  onChange({ ...config, mcq_sections: next });
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ))}
      <div className="px-3 py-2">
        <button
          type="button"
          className="text-[12px] font-medium text-[#0071e3]"
          onClick={() => {
            const lastTo = sections.length ? sections[sections.length - 1].to_q : 0;
            const from = lastTo + 1;
            onChange({
              ...config,
              mcq_sections: [
                ...sections,
                {
                  title: "Yeni fənn",
                  from_q: from,
                  to_q: from + 9,
                  columns_count: config.columns_count,
                },
              ],
            });
          }}
        >
          + Qrup əlavə et
        </button>
      </div>
    </div>
  );
}

export default function ConfigPanel({
  config,
  onChange,
  compact: _compact = false,
  examManaged = false,
  showMcqGridLabel = true,
  activeFoldPanel = 1,
  onJumpToFoldPanel,
}: Props) {
  const layoutLabel =
    (config.mcq_options_layout ?? "vertical") === "vertical" ? "DİM (şaquli A–E)" : "Köhnə (üfüqi)";
  const foldMode = (config.sheet_format ?? "standard") === "a3_duplex_fold";
  const targetPanel = foldMode ? activeFoldPanel : 1;

  return (
    <div className="space-y-4">
      <Section title="Kart">
        <RowStack label="Başlıq" hint="PDF magentada çap olunur">
          <input
            className={inpWide}
            type="text"
            value={config.title}
            onChange={(e) => onChange({ ...config, title: e.target.value })}
          />
        </RowStack>
        <RowStack label="Alt sətir" hint="Boş saxlayın — yalnız başlıq">
          <textarea
            className={`${inpWide} resize-none`}
            rows={2}
            placeholder="İstəyə görə"
            value={config.header_subtitle}
            onChange={(e) => onChange({ ...config, header_subtitle: e.target.value })}
          />
        </RowStack>
        <Row label="Kağız" border={false}>
          <select
            className={sel}
            value={config.paper_size}
            onChange={(e) => onChange({ ...config, paper_size: e.target.value as PaperSize })}
          >
            {(Object.keys(PAPER_LABELS) as PaperSize[]).map((k) => (
              <option key={k} value={k}>
                {PAPER_LABELS[k]}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Kart formatı" border={false}>
          <select
            className={sel}
            value={config.sheet_format ?? "standard"}
            onChange={(e) => {
              const fmt = e.target.value as SheetFormat;
              if (fmt === "a3_duplex_fold") {
                onChange(ensureFoldPanels({ ...config, sheet_format: fmt }));
              } else {
                onChange({
                  ...config,
                  sheet_format: fmt,
                  paper_size: config.paper_size === "A3L" ? "A4" : config.paper_size,
                });
              }
            }}
          >
            <option value="standard">Standart</option>
            <option value="a3_duplex_fold">A3 qatlanan (4 panel)</option>
          </select>
        </Row>
        {(config.sheet_format ?? "standard") === "a3_duplex_fold" ? (
          <div className="mx-1 mb-2 rounded-lg border border-[#c0176a33] bg-[#fde8f3]/90 px-2.5 py-2 text-[10px] leading-relaxed text-[#7a1048]">
            <p className="font-semibold">A3 qatlanan — 4 A4 panel</p>
            <p className="mt-1 opacity-90">
              Kanvasda P1–P4 / Üz 1–2 seçin. Suallar avtomatik panellərə bölünür; açıq
              sualları Config-də panel nömrəsi ilə əlavə edin.
            </p>
            <button
              type="button"
              className="mt-1.5 text-[10px] font-semibold text-[#c0176a] underline"
              onClick={() => onChange(ensureFoldPanels(config, true))}
            >
              Sual bölgüsünü yenilə
            </button>
          </div>
        ) : null}
      </Section>

      {examManaged ? (
        <Section title="İmtahan" footer="Dəyişmək üçün imtahan parametrlərini redaktə edin.">
          <ExamSummary config={config} />
        </Section>
      ) : (
        <Section title="Sual şəbəkəsi">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
            <button
              type="button"
              className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-900 hover:bg-rose-100"
              onClick={() =>
                onChange({
                  ...config,
                  options_per_question: 4,
                  question_count: config.question_count > 0 ? config.question_count : 30,
                })
              }
            >
              DİM standartı
            </button>
            <span className="text-[10px] text-slate-500">A–D · sual sayı saxlanılır (boşdursa 30)</span>
          </div>
          <Row label="Sual sayı">
            <input
              className={`${inp} w-16 text-right`}
              type="number"
              min={5}
              max={300}
              value={config.question_count}
              onChange={(e) => {
                const question_count = Number(e.target.value);
                const next = { ...config, question_count };
                onChange(
                  (config.sheet_format ?? "standard") === "a3_duplex_fold"
                    ? ensureFoldPanels(next)
                    : next,
                );
              }}
            />
          </Row>
          <Row label="Sütun">
            <select
              className={sel}
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
          </Row>
          <Row label="Variant" border={false}>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {([2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange({ ...config, options_per_question: n })}
                  className={`min-w-[2rem] rounded-md px-2 py-1 text-[12px] font-semibold transition ${
                    config.options_per_question === n
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Row>
        </Section>
      )}

      <Section
        title="Cavab şəbəkəsi"
        footer={
          showMcqGridLabel
            ? "Maqenta başlıqdan tutub şəbəkəni sürükləyin."
            : "Hər fənn blokunu öz başlığından sürükləyin."
        }
      >
        {showMcqGridLabel ? (
          <RowStack label="Başlıq zolağı" hint="Kanvasta görünən mətn">
            <input
              className={inpWide}
              type="text"
              value={config.mcq_grid_label ?? "CAVABLAR"}
              onChange={(e) => onChange({ ...config, mcq_grid_label: e.target.value })}
              placeholder="CAVABLAR"
            />
          </RowStack>
        ) : null}

        {(config.mcq_sections?.length ?? 0) > 0 || examManaged ? (
          <div className={showMcqGridLabel ? "border-t border-slate-100" : ""}>
            <p className="px-3 pt-2.5 text-[11px] font-medium text-slate-500">Fənn qrupları</p>
            <McqSectionsEditor config={config} onChange={onChange} />
          </div>
        ) : null}

        <ToggleRow
          label="Bir səhifəyə sığdır"
          hint="Söndürülsə, lazım olanda 2-ci səhifə əlavə olunur"
          checked={config.single_page_layout !== false}
          onChange={(v) => onChange({ ...config, single_page_layout: v })}
        />
        <ToggleRow
          label="Avtomatik sığdır"
          hint="Balon və aralıqları kiçildir"
          checked={config.mcq_auto_fit !== false}
          onChange={(v) => onChange({ ...config, mcq_auto_fit: v })}
          border={false}
        />
      </Section>

      <Disclosure title="Təkmilləşdirilmiş" summary={layoutLabel} defaultOpen={false}>
        <Row label="Sual yerləşməsi">
          <select
            className={`${sel} max-w-[9rem]`}
            value={config.mcq_options_layout ?? "vertical"}
            onChange={(e) => {
              const next = e.target.value as NonNullable<SheetConfig["mcq_options_layout"]>;
              const prev = config.mcq_options_layout ?? "vertical";
              const patch: Partial<SheetConfig> = { mcq_options_layout: next };
              // eyni mcq_hgap_mm: tower strip (~3.35) ≠ üfüqi option pitch (~7.5)
              if (prev !== next) {
                if (next === "horizontal" && config.mcq_hgap_mm < 6) {
                  patch.mcq_hgap_mm = 7.5;
                } else if (next === "vertical" && config.mcq_hgap_mm >= 6) {
                  patch.mcq_hgap_mm = 3.35;
                }
              }
              onChange({ ...config, ...patch });
            }}
          >
            <option value="vertical">DİM tipli</option>
            <option value="horizontal">Köhnə</option>
          </select>
        </Row>
        <Row
          label={(config.mcq_options_layout ?? "vertical") === "horizontal" ? "Variant aralığı" : "Sütun aralığı"}
          hint="mm"
        >
          <input
            className={`${inp} w-16 text-right`}
            type="number"
            step={0.05}
            min={3.2}
            max={12}
            value={config.mcq_hgap_mm}
            onChange={(e) => onChange({ ...config, mcq_hgap_mm: Number(e.target.value) })}
          />
        </Row>
        {config.mcq_auto_fit === false ? (
          <>
            <Row label="Balon Ø">
              <input
                className={`${inp} w-16 text-right`}
                type="number"
                step={0.05}
                min={2.8}
                max={8.5}
                value={config.mcq_bubble_d_mm}
                onChange={(e) => onChange({ ...config, mcq_bubble_d_mm: Number(e.target.value) })}
              />
            </Row>
            <Row label="Sətir aralığı" border={false}>
              <input
                className={`${inp} w-16 text-right`}
                type="number"
                step={0.05}
                min={3}
                max={14}
                value={config.mcq_vgap_mm}
                onChange={(e) => onChange({ ...config, mcq_vgap_mm: Number(e.target.value) })}
              />
            </Row>
          </>
        ) : null}
      </Disclosure>

      <Disclosure title="Peşəkar ölçülər" summary="Şəxsiyyət zonası mm" defaultOpen={false}>
        <Row label="AD sətir">
          <input
            className={`${inp} w-14 text-right`}
            type="number"
            min={1}
            max={20}
            value={config.identity_ad_rows}
            onChange={(e) => onChange({ ...config, identity_ad_rows: Number(e.target.value) })}
          />
        </Row>
        <ToggleRow
          label="Sıx rəqəm sütunu"
          checked={config.identity_digit_compact}
          onChange={(v) => onChange({ ...config, identity_digit_compact: v })}
        />
        <ToggleRow
          label="MCQ ilə eyni balon ölçüsü"
          hint="Şəxsiyyət hərf/rəqəm"
          checked={config.identity_match_mcq_bubbles !== false}
          onChange={(v) => onChange({ ...config, identity_match_mcq_bubbles: v })}
        />
        <ToggleRow
          label="DİQQƏT mətni"
          checked={config.identity_show_notice !== false}
          onChange={(v) => onChange({ ...config, identity_show_notice: v })}
        />
        {config.identity_show_notice !== false ? (
          <RowStack label="Öz mətniniz" hint="Boş = avtomatik">
            <textarea
              className={`${inpWide} resize-none`}
              rows={2}
              placeholder="Məs: Yalnız qələm ilə doldurun…"
              value={config.identity_notice_text ?? ""}
              onChange={(e) => onChange({ ...config, identity_notice_text: e.target.value })}
            />
          </RowStack>
        ) : null}
        <div className="grid grid-cols-2 gap-px bg-slate-100">
          {(
            [
              ["Hərf Ø", "identity_letter_d_mm"],
              ["Hərf gap", "identity_letter_hgap_mm"],
              ["Rəqəm Ø", "identity_digit_d_mm"],
              ["Rəqəm gap", "identity_digit_vgap_mm"],
            ] as const
          ).map(([lbl, key]) => (
            <div key={key} className="bg-white px-3 py-2">
              <span className="block text-[10px] text-slate-400">{lbl}</span>
              <input
                className={`${inpWide} mt-0.5`}
                type="number"
                step={0.05}
                value={config[key]}
                onChange={(e) => onChange({ ...config, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
      </Disclosure>

      <Section
        title="Açıq suallar (open_blocks)"
        footer={
          foldMode
            ? `Yeni blok aktiv panelə (P${targetPanel}) düşür. Kanvasda sürükləyib hizalayın.`
            : "Grid-in / Essay — kanvasda sürükləyib hizalayın."
        }
      >
        <div className="flex flex-wrap gap-2 px-1 py-2">
          <button
            type="button"
            className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
            onClick={() => {
              const blocks = [...(config.open_blocks ?? [])];
              const nextQ =
                blocks.reduce((m, b) => Math.max(m, b.question_number), 0) + 1 || 1;
              blocks.push({
                kind: "grid_in",
                question_number: nextQ,
                x_mm: 20,
                y_mm: 120 + blocks.length * 8,
                answer_length: 3,
                alphabet: "digits",
                page: 1,
                panel: targetPanel,
              });
              onChange({ ...config, open_blocks: blocks });
            }}
          >
            + Grid-in{foldMode ? ` → P${targetPanel}` : ""}
          </button>
          <button
            type="button"
            className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-900 hover:bg-indigo-100"
            onClick={() => {
              const blocks = [...(config.open_blocks ?? [])];
              const nextQ =
                blocks.reduce((m, b) => Math.max(m, b.question_number), 0) + 1 || 1;
              blocks.push({
                kind: "essay",
                question_number: nextQ,
                x_mm: 20,
                y_mm: 120 + blocks.length * 8,
                box_w_mm: 55,
                box_h_mm: 45,
                max_lines: 8,
                page: 1,
                panel: targetPanel,
              });
              onChange({ ...config, open_blocks: blocks });
            }}
          >
            + Essay{foldMode ? ` → P${targetPanel}` : ""}
          </button>
          <button
            type="button"
            className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100"
            title="Essay 31–38 → 5, 39–40 → 10"
            onClick={() => {
              const blocks = (config.open_blocks ?? []).map((b) => {
                if (b.kind !== "essay") return b;
                const qn = b.question_number;
                let max_points = b.max_points;
                if (qn >= 31 && qn <= 38) max_points = 5;
                else if (qn >= 39 && qn <= 40) max_points = 10;
                return { ...b, max_points };
              });
              onChange({ ...config, open_blocks: blocks });
            }}
          >
            DİM essay xalları
          </button>
        </div>
        {(config.open_blocks ?? []).length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Hələ blok yoxdur.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(config.open_blocks ?? []).map((b, idx) => (
              <li key={`${b.kind}-${b.question_number}-${idx}`} className="space-y-1.5 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left font-semibold text-slate-800 hover:text-[#c0176a] hover:underline"
                    onClick={() => {
                      const p = Math.max(1, Math.min(4, Number(b.panel) || 1));
                      onJumpToFoldPanel?.(p);
                    }}
                    title="Kanvasda bu panelə keç"
                  >
                    #{b.question_number} · {b.kind === "grid_in" ? "Grid-in" : "Essay"}
                    {b.kind === "essay" && b.max_points != null ? ` · ${b.max_points}x` : ""}
                    {foldMode ? ` · P${b.panel ?? 1}` : ""}
                  </button>
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() => {
                      const next = (config.open_blocks ?? []).filter((_, i) => i !== idx);
                      onChange({ ...config, open_blocks: next });
                    }}
                  >
                    Sil
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      ["Q№", "question_number", 1],
                      ["X mm", "x_mm", 0.5],
                      ["Y mm", "y_mm", 0.5],
                      ["Panel", "panel", 1],
                    ] as const
                  ).map(([lbl, key, step]) => (
                    <label key={key} className="block">
                      <span className="text-[10px] text-slate-400">{lbl}</span>
                      <input
                        className={`${inpWide} mt-0.5`}
                        type="number"
                        step={step}
                        value={Number(b[key] ?? (key === "panel" ? 1 : 0))}
                        onChange={(e) => {
                          const next = [...(config.open_blocks ?? [])];
                          const val = Number(e.target.value);
                          next[idx] = { ...next[idx], [key]: val } as OpenBlock;
                          onChange({ ...config, open_blocks: next });
                          if (key === "panel" && foldMode) {
                            onJumpToFoldPanel?.(Math.max(1, Math.min(4, val || 1)));
                          }
                        }}
                      />
                    </label>
                  ))}
                </div>
                {b.kind === "grid_in" ? (
                  <div className="grid grid-cols-2 gap-1">
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Uzunluq</span>
                      <input
                        className={`${inpWide} mt-0.5`}
                        type="number"
                        min={1}
                        max={12}
                        value={b.answer_length ?? 3}
                        onChange={(e) => {
                          const next = [...(config.open_blocks ?? [])];
                          next[idx] = { ...next[idx], answer_length: Number(e.target.value) };
                          onChange({ ...config, open_blocks: next });
                        }}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Əlifba</span>
                      <select
                        className={`${sel} mt-0.5`}
                        value={b.alphabet ?? "digits"}
                        onChange={(e) => {
                          const next = [...(config.open_blocks ?? [])];
                          next[idx] = {
                            ...next[idx],
                            alphabet: e.target.value as "digits" | "digits_letters_az",
                          };
                          onChange({ ...config, open_blocks: next });
                        }}
                      >
                        <option value="digits">0–9</option>
                        <option value="digits_letters_az">0–9 + AZ latın</option>
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1">
                    <label className="block">
                      <span className="text-[10px] text-slate-400">En</span>
                      <input
                        className={`${inpWide} mt-0.5`}
                        type="number"
                        value={b.box_w_mm ?? 55}
                        onChange={(e) => {
                          const next = [...(config.open_blocks ?? [])];
                          next[idx] = { ...next[idx], box_w_mm: Number(e.target.value) };
                          onChange({ ...config, open_blocks: next });
                        }}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Hün.</span>
                      <input
                        className={`${inpWide} mt-0.5`}
                        type="number"
                        value={b.box_h_mm ?? 45}
                        onChange={(e) => {
                          const next = [...(config.open_blocks ?? [])];
                          next[idx] = { ...next[idx], box_h_mm: Number(e.target.value) };
                          onChange({ ...config, open_blocks: next });
                        }}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Sətir</span>
                      <input
                        className={`${inpWide} mt-0.5`}
                        type="number"
                        value={b.max_lines ?? 8}
                        onChange={(e) => {
                          const next = [...(config.open_blocks ?? [])];
                          next[idx] = { ...next[idx], max_lines: Number(e.target.value) };
                          onChange({ ...config, open_blocks: next });
                        }}
                      />
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
