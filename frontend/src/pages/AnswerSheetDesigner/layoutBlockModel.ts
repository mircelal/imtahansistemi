import {
  IDENTITY_STACK_GAP_MM,
  identityZoneTopMmRef,
  MCQ_IDENTITY_SEP_MM,
  LAYOUT_CONTENT_LEFT_MM,
  layoutContentRightMaxMm,
  layoutPaperWidthMm,
  MIN_FREE_FORM_MCQ_RESERVE_MM,
} from "../../constants/sheetLayoutSpec";
import type { SheetConfig } from "./hooks/useSheetConfig";
import { DEFAULT_SHEET_CONFIG } from "./hooks/useSheetConfig";

export type LayoutFieldKind =
  | "digit_groups"
  | "mcq_groups"
  | "horizontal_letters"
  | "vertical_letters"
  | "digits"
  | "mcq"
  | "note"
  | "declaration";

/** UI üçün blockId; API-yə göndərərkən çıxarılır */
export type LayoutField = {
  blockId: string;
  kind: LayoutFieldKind;
  x_mm: number;
  y_mm: number;
} & Record<string, unknown>;

export function newBlockId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `b_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function metFromCfg(cfg: SheetConfig) {
  return {
    letter_d: cfg.identity_letter_d_mm,
    letter_hgap: cfg.identity_letter_hgap_mm,
    letter_vgap: cfg.identity_letter_vgap_mm,
    digit_d: cfg.identity_digit_d_mm,
    digit_vgap: cfg.identity_digit_vgap_mm,
    digit_col_gap: cfg.identity_digit_col_gap_mm,
  };
}

function digitColHeightMm(cfg: SheetConfig): number {
  const m = metFromCfg(cfg);
  return 9.0 * m.digit_vgap + m.digit_d;
}

/** digit_groups bir sətir: başlıq + boşluq + (opsional) əl yazısı kvadratı + balonlar — PDF ilə eyni mm */
function digitGroupShowHandwriteBox(f: LayoutField, cfg: SheetConfig): boolean {
  const rec = f as Record<string, unknown>;
  const raw = rec.handwrite_box;
  if (raw === undefined || raw === null) {
    return Boolean((cfg as unknown as Record<string, unknown>).identity_digit_handwrite_box);
  }
  return Boolean(raw);
}

function digitGroupRowStackHeightMm(cfg: SheetConfig, f?: LayoutField): number {
  const m = metFromCfg(cfg);
  const ch = digitColHeightMm(cfg);
  const pitch = m.digit_col_gap + m.digit_d;
  const showHw = f ? digitGroupShowHandwriteBox(f, cfg) : false;
  const sq = showHw
    ? verticalLettersHandwriteSquareSideMm(m.digit_d, Math.max(m.digit_d + 0.12, pitch), undefined)
    : 0;
  const hwBlock = showHw ? sq + 0.5 : 0;
  return 4.8 + 0.8 + hwBlock + ch;
}

const AZ_COUNT = 32;

/** Şaquli hərf blokunun alt boşluğu — audit / kəsişmə yoxlamasında nəzərə alınmır */
export const VERTICAL_LETTERS_TAIL_MM = 5.5;

/** Sahələr arası minimum məsafə (mm) — backend MIN_FREE_FORM_FIELD_GAP_MM */
export const FIELD_OVERLAP_PAD_MM = 1.2;

/** Bütün sahə növləri üçün vahid üst başlıq zolağı (mm) — kanvas + PDF şaquli/rəqəm ilə sinxron */
export const FIELD_HEADER_BAR_MM = 4.8;

/** Üfüqi hərf bloku — PDF/OMR ilə eyni boşluqlar */
export const HORIZONTAL_LETTERS_TOP_GAP_MM = 0.8;
export const HORIZONTAL_LETTERS_BOTTOM_TAIL_MM = 1.5;
export const HORIZONTAL_LETTERS_HANDWRITE_ROW_EXTRA_MM = 0.5;
export const HORIZONTAL_LETTERS_ROW_LABEL_LEFT_MM = 11.0;

export function horizontalLettersBodyTopMm(): number {
  return FIELD_HEADER_BAR_MM + HORIZONTAL_LETTERS_TOP_GAP_MM;
}

function horizontalLetterRowPitchMm(f: LayoutField, cfg: SheetConfig): number {
  const m = metFromCfg(cfg);
  if (f.row_layout === "handwrite_coding") {
    const hwH = Number(f.handwrite_h_mm ?? cfg.identity_handwrite_h_mm);
    const hwG = Number(f.handwrite_gap_mm ?? cfg.identity_handwrite_gap_mm);
    return hwH + hwG + m.letter_d + HORIZONTAL_LETTERS_HANDWRITE_ROW_EXTRA_MM;
  }
  return m.letter_vgap;
}

function horizontalLetterBlockHeightMm(f: LayoutField, nRows: number, cfg: SheetConfig): number {
  return horizontalLettersBodyTopMm() + nRows * horizontalLetterRowPitchMm(f, cfg) + HORIZONTAL_LETTERS_BOTTOM_TAIL_MM;
}

/**
 * Şaquli (DİM tower) MCQ rejimində backend `config_with_identity_matched_to_mcq` ilə
 * eyni: şəxsiyyət hərf/rəqəm balon ölçüsünü MCQ balon diametrinə uyğunlaşdır.
 * Kanvas estimasiyası bu sync üzərində hesablananda PDF-də gerçəkdən çəkilən boyu
 * görür və yalançı «kəsişir» xəbərdarlıqları aradan qalxır.
 */
export type McqMatchInfo = {
  /** Şaquli MCQ-də balon diametri (mm) */
  bdMcq: number;
  /** Şaquli MCQ rejimidir (towers); horizontal-da sync tətbiq olunmur */
  isTower: boolean;
};

export function applyIdentityMcqBubbleSync(cfg: SheetConfig, info: McqMatchInfo): SheetConfig {
  if (!info.isTower || cfg.identity_match_mcq_bubbles === false) return cfg;
  const bdMcq = info.bdMcq;
  const ld0 = cfg.identity_letter_d_mm;
  const dd0 = cfg.identity_digit_d_mm;
  if (ld0 <= 0 || dd0 <= 0 || !Number.isFinite(bdMcq) || bdMcq <= 0) return cfg;
  const fl = bdMcq / ld0;
  const fd = bdMcq / dd0;
  const dcolTight = Math.max(0.28, Math.min(4.2, cfg.identity_digit_col_gap_mm * fd * 0.62, bdMcq * 0.18));
  return {
    ...cfg,
    identity_letter_d_mm: bdMcq,
    identity_digit_d_mm: bdMcq,
    identity_letter_hgap_mm: Math.max(bdMcq + 0.1, Math.max(2.2, Math.min(14, cfg.identity_letter_hgap_mm * fl))),
    identity_letter_vgap_mm: Math.max(2.5, Math.min(16, cfg.identity_letter_vgap_mm * fl)),
    identity_digit_vgap_mm: Math.max(bdMcq - 0.26, Math.max(2.42, Math.min(16, cfg.identity_digit_vgap_mm * fd))),
    identity_digit_col_gap_mm: dcolTight,
  };
}

/**
 * `dimStandardTemplate` və `buildAnswerCardIdentity` kimi şablon kodu üçün
 * təxmini McqMatchInfo. Faktiki MCQ region kanvasdan alınanda dəqiq dəyər
 * `applyIdentityMcqBubbleSync(cfg, regionInfo)` ilə yenidən hesablanır.
 */
export function defaultDimMcqMatchInfo(cfg: SheetConfig = DEFAULT_SHEET_CONFIG): McqMatchInfo {
  const isTower = cfg.mcq_options_layout !== "horizontal";
  // Tipik A4 + 100q + 4 sütun + identity ilə bd_mcq ≈ 2.5–2.8mm; daha az suallı şablonlar üçün
  // bir az böyük dəyər seçirik ki, vertical_letters bloku təxmindən KIÇIK olmasın.
  const q = Number(cfg.question_count) || 100;
  const cols = Math.max(1, Math.min(6, Number(cfg.columns_count) || 4));
  const rowsPerCol = Math.ceil(q / cols);
  // Daha çox sıra → daha az bd; az sıra → bir az daha böyük bd
  const bdMcq = rowsPerCol >= 22 ? 2.5 : rowsPerCol >= 16 ? 2.8 : 3.2;
  return { bdMcq, isTower };
}

export function verticalLettersBubbleStepMm(ld: number, lvg: number): number {
  return Math.max(ld + 0.34, Math.min(lvg, ld + 0.86));
}

/** Balon mərkəzləri arası (mm). `bubble_pitch_mm` sahəsi varsa PDF ilə eyni tənzimləmə */
export function verticalLettersRowPitchMm(ld: number, lvg: number, f?: LayoutField): number {
  const rec = f as Record<string, unknown> | undefined;
  const raw =
    rec && typeof rec.bubble_pitch_mm === "number" ? Number(rec.bubble_pitch_mm) : Number.NaN;
  if (Number.isFinite(raw) && raw > 0) {
    return Math.max(ld + 0.08, Math.min(raw, ld + 4.0));
  }
  return verticalLettersBubbleStepMm(ld, lvg);
}

/** Üst əl yazı kvadratının tərəfi (mm) — backend `vertical_letters_handwrite_square_side_mm` ilə eyni */
export function verticalLettersHandwriteSquareSideMm(ld: number, lhg: number, f?: LayoutField): number {
  const colPitch = f
    ? Number(f.col_pitch_mm ?? Math.max(ld + 0.12, lhg))
    : Math.max(ld + 0.12, lhg);
  return Math.min(ld + 1.1, Math.max(ld + 0.08, colPitch - 0.28));
}

function verticalLettersBlockHeightMm(ld: number, lvg: number, cfg: SheetConfig, f?: LayoutField): number {
  const m = metFromCfg(cfg);
  const sq = verticalLettersHandwriteSquareSideMm(ld, m.letter_hgap, f);
  const step = verticalLettersRowPitchMm(ld, lvg, f);
  const body = sq + 0.5 + (AZ_COUNT - 1) * step + ld;
  return FIELD_HEADER_BAR_MM + 0.8 + body + VERTICAL_LETTERS_TAIL_MM;
}

/** Audit / kəsişmə üçün effektiv hündürlük (şaquli hərflərdə alt boşluq çıxılır) */
export function fieldAuditHeightMm(
  f: LayoutField,
  cfg: SheetConfig = DEFAULT_SHEET_CONFIG,
  mcqMatch?: McqMatchInfo,
): number {
  const h = estimateBlockHeightMm(f, cfg, mcqMatch);
  if (f.kind === "vertical_letters") return Math.max(4, h - VERTICAL_LETTERS_TAIL_MM);
  return h;
}

function inflatedBoxesOverlapMm(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  pad: number,
): boolean {
  const ax1 = ax - pad;
  const ay1 = ay - pad;
  const aw1 = aw + 2 * pad;
  const ah1 = ah + 2 * pad;
  const bx1 = bx - pad;
  const by1 = by - pad;
  const bw1 = bw + 2 * pad;
  const bh1 = bh + 2 * pad;
  return !(ax1 + aw1 <= bx1 || bx1 + bw1 <= ax1 || ay1 + ah1 <= by1 || by1 + bh1 <= ay1);
}

/** Sürükləmədə sahələri üst-üstə düşməkdən saxlayır — lazım olsa aşağı sıçrayır */
export function clampFieldPositionAvoidingOverlap(
  field: LayoutField,
  xMm: number,
  yMm: number,
  others: LayoutField[],
  cfg: SheetConfig = DEFAULT_SHEET_CONFIG,
  mcqMatch?: McqMatchInfo,
): { x_mm: number; y_mm: number } {
  const w = estimateBlockWidthMm(field, cfg, mcqMatch);
  const h = fieldAuditHeightMm(field, cfg, mcqMatch);
  let x = xMm;
  let y = yMm;
  const pad = FIELD_OVERLAP_PAD_MM;

  for (let pass = 0; pass < 40; pass++) {
    let bumped = false;
    for (const o of others) {
      if (o.blockId === field.blockId) continue;
      const ox = Number(o.x_mm ?? 0);
      const oy = Number(o.y_mm ?? 0);
      const ow = estimateBlockWidthMm(o, cfg, mcqMatch);
      const oh = fieldAuditHeightMm(o, cfg, mcqMatch);
      if (inflatedBoxesOverlapMm(x, y, w, h, ox, oy, ow, oh, pad)) {
        y = oy + oh + pad;
        bumped = true;
      }
    }
    if (!bumped) break;
  }
  return { x_mm: x, y_mm: y };
}


function headerMinWidthForLabelMm(label: string): number {
  const t = String(label || "").trim();
  return Math.max(14, 4 + t.length * 1.65);
}

/** Tək `mcq` bloku — balon sırası + başlıq eni (PDF/kanvas eyni) */
export function mcqSingleBlockWidthMm(f: LayoutField, cfg: SheetConfig = DEFAULT_SHEET_CONFIG): number {
  const m = metFromCfg(cfg);
  const n = Math.max(1, (f.options as string[] | undefined)?.length ?? 2);
  const bubbleSpan = 4 + (n - 1) * m.letter_hgap + m.letter_d;
  return Math.max(bubbleSpan, headerMinWidthForLabelMm(String(f.label ?? "")));
}

export function mcqSingleBlockHeightMm(cfg: SheetConfig = DEFAULT_SHEET_CONFIG): number {
  const m = metFromCfg(cfg);
  return FIELD_HEADER_BAR_MM + 1 + 1.5 + m.letter_d + 3.5;
}

function mcqGroupsRowWidthMm(f: LayoutField, cfg: SheetConfig): number {
  const groups = (f.groups as Array<{ options?: unknown[] }> | undefined) ?? [];
  if (!groups.length) return 88;
  const m = metFromCfg(cfg);
  const gap = Math.max(6.5, m.letter_hgap);
  let x = 2;
  for (const g of groups) {
    const opts = (g.options ?? []) as unknown[];
    const n = Math.max(1, opts.length);
    const bx = x + 14;
    x = bx + Math.max(6.5, n * gap + 2);
  }
  return Math.max(88, x + 6);
}

/** PDF-dəki kimi təxmini en (mm) — kanvas WYSIWYG üçün.
 *
 * `mcqMatch` verilibsə, MCQ-uyğunlaşmış cfg üzərində hesablanır — beləliklə kanvas
 * sahə eni PDF-də gerçəkdən çəkilən en ilə eyni olur (şaquli MCQ rejimində bu mühüm
 * fərq verir; xam cfg ilə hesablanmış en ölçü ~2x daha böyük ola bilər).
 */
export function estimateBlockWidthMm(
  f: LayoutField,
  cfg: SheetConfig = DEFAULT_SHEET_CONFIG,
  mcqMatch?: McqMatchInfo,
): number {
  const eff = mcqMatch ? applyIdentityMcqBubbleSync(cfg, mcqMatch) : cfg;
  const m = metFromCfg(eff);
  const pitch = m.digit_col_gap + m.digit_d;

  if (f.kind === "digit_groups") {
    const groups = (f.groups as Array<{ count?: number }> | undefined) ?? [];
    const twoRows = f.layout === "two_rows" && groups.length >= 2;
    const chunks = twoRows ? [groups.slice(0, 1), groups.slice(1)] : [groups];
    const compact = Boolean(f.compact ?? eff.identity_digit_compact);
    const groupTail = compact ? 3.5 : 10;
    let maxW = 12;
    for (const row of chunks) {
      let x = 2;
      for (const g of row) {
        const cnt = Number(g.count ?? 1);
        x += 2 + cnt * pitch + 1 + groupTail;
      }
      maxW = Math.max(maxW, x);
    }
    return maxW;
  }

  if (f.kind === "horizontal_letters") {
    const nLetters = Math.max(1, Math.min(AZ_COUNT, Number((f as { letters_count?: unknown }).letters_count ?? AZ_COUNT)));
    const labelLeft = HORIZONTAL_LETTERS_ROW_LABEL_LEFT_MM;
    if (f.row_layout === "handwrite_coding") {
      const hwW = Number(f.handwrite_w_mm ?? eff.identity_handwrite_w_mm);
      const lx0 = labelLeft + hwW + 2 + m.letter_d / 2;
      return lx0 + (nLetters - 1) * m.letter_hgap + m.letter_d + 6;
    }
    const lx0 = labelLeft + m.letter_d / 2;
    return lx0 + (nLetters - 1) * m.letter_hgap + m.letter_d + 6;
  }

  if (f.kind === "mcq_groups") return mcqGroupsRowWidthMm(f, eff);
  if (f.kind === "vertical_letters") {
    const ncol = Number(f.columns ?? 8);
    const colPitch = Number(f.col_pitch_mm ?? Math.max(m.letter_d + 0.12, m.letter_hgap));
    return 2 + ncol * colPitch + 1;
  }
  if (f.kind === "digits") {
    const cnt = Number(f.count ?? 6);
    const bubbleSpan = 3 + cnt * pitch + 2;
    return Math.max(bubbleSpan, headerMinWidthForLabelMm(String(f.label ?? "")));
  }
  if (f.kind === "mcq") {
    return mcqSingleBlockWidthMm(f, eff);
  }
  if (f.kind === "note") return 175;
  if (f.kind === "declaration") return Number(f.box_w_mm ?? 175);
  return 80;
}

export function estimateBlockHeightMm(
  f: LayoutField,
  cfg: SheetConfig = DEFAULT_SHEET_CONFIG,
  mcqMatch?: McqMatchInfo,
): number {
  const eff = mcqMatch ? applyIdentityMcqBubbleSync(cfg, mcqMatch) : cfg;
  const kind = f.kind;
  if (kind === "digit_groups") {
    const groups = (f.groups as unknown[] | undefined) ?? [];
    const twoRows = f.layout === "two_rows" && groups.length >= 2;
    const nChunks = twoRows ? 2 : 1;
    const compact = Boolean(f.compact ?? eff.identity_digit_compact);
    const stack = digitGroupRowStackHeightMm(eff, f);
    let h = 0;
    for (let i = 0; i < nChunks; i++) {
      const rowGapAfter = compact ? 4 : i === 0 ? 5 : 6;
      h += stack + rowGapAfter;
    }
    return h;
  }
  if (kind === "mcq_groups") return 18 + FIELD_HEADER_BAR_MM;
  if (kind === "horizontal_letters") {
    const n = Number(f.rows ?? 8);
    return horizontalLetterBlockHeightMm(f, n, eff);
  }
  if (kind === "vertical_letters") {
    const me = metFromCfg(eff);
    return verticalLettersBlockHeightMm(me.letter_d, me.letter_vgap, eff, f);
  }
  if (kind === "digits") {
    return FIELD_HEADER_BAR_MM + 1.5 + digitColHeightMm(eff) + 4.0;
  }
  if (kind === "mcq") {
    return mcqSingleBlockHeightMm(eff);
  }
  if (kind === "note") {
    return FIELD_HEADER_BAR_MM + 5 * Math.max(1, Number(f.lines ?? 1));
  }
  if (kind === "declaration") {
    return FIELD_HEADER_BAR_MM + Number(f.box_h_mm ?? 28);
  }
  return 12;
}

export function createBlock(kind: LayoutFieldKind, cfg: SheetConfig): LayoutField {
  const blockId = newBlockId();
  const base: LayoutField = { blockId, kind, x_mm: LAYOUT_CONTENT_LEFT_MM, y_mm: 52 };
  switch (kind) {
    case "digit_groups":
      return {
        ...base,
        label: "Rəqəm qrupları",
        compact: cfg.identity_digit_compact,
        groups: [
          { id: "w", label: "İş №", count: 6 },
          { id: "sch", label: "Məktəb", count: 3 },
          { id: "cl", label: "Sinif", count: 2 },
        ],
      };
    case "mcq_groups":
      return {
        ...base,
        label: "Seçimlər",
        groups: [
          { id: "grp", label: "Qrup", options: ["1", "2", "3", "4", "5"] },
          { id: "var", label: "Variant", options: ["A", "B", "C", "D"] },
          { id: "sec", label: "Bölmə", options: ["Az", "RU", "GÜ"] },
        ],
      };
    case "horizontal_letters":
      return {
        ...base,
        id: `hl_${blockId.slice(0, 8)}`,
        label: "ADINIZ",
        rows: cfg.identity_ad_rows,
        row_layout: "handwrite_coding",
      };
    case "vertical_letters":
      return { ...base, id: `vl_${blockId.slice(0, 8)}`, label: "Şaquli hərflər", columns: 8 };
    case "digits":
      return { ...base, id: `num_${blockId.slice(0, 8)}`, label: "Kod", count: 6 };
    case "mcq":
      return { ...base, id: `mq_${blockId.slice(0, 8)}`, label: "Variant", options: ["A", "B", "C", "D"] };
    case "note":
      return { ...base, label: "Qeyd", lines: 2 };
    case "declaration":
      return {
        ...base,
        label: "Bəyannamə",
        text: "Mən bu cavab kartındakı məlumatların düzgünlüyünü təsdiq edirəm.",
        box_w_mm: 175,
        box_h_mm: 28,
        signature_label: "İmza",
      };
    default:
      return base;
  }
}

export type DigitGroupItem = { id?: string; label?: string; count?: number };

/** Backend `digit_group_row_chunks` ilə eyni — iki sətir / tək sətir rəqəm qrupları */
export function digitGroupRowChunks(field: LayoutField): DigitGroupItem[][] {
  const groups: DigitGroupItem[] = Array.isArray(field.groups) ? (field.groups as DigitGroupItem[]) : [];
  if (field.layout === "two_rows" && groups.length >= 2) {
    return [groups.slice(0, 1), groups.slice(1)];
  }
  return [groups];
}

export function stackFieldsVertical(fields: LayoutField[], startY = 46, cfg: SheetConfig = DEFAULT_SHEET_CONFIG): LayoutField[] {
  let y = startY;
  const x = LAYOUT_CONTENT_LEFT_MM;
  return fields.map((f) => {
    const nf = { ...f, x_mm: x, y_mm: y };
    y += estimateBlockHeightMm(f, cfg) + IDENTITY_STACK_GAP_MM;
    return nf;
  });
}

/** API üçün blockId çıxaran */
export function fieldsToApiPayload(fields: LayoutField[]): Record<string, unknown>[] {
  return fields.map(({ blockId: _, ...rest }) => {
    const r = { ...rest } as Record<string, unknown>;
    if (r.kind === "horizontal_letters" && r.row_layout === "handwrite_coding") {
      delete r.handwrite_w_mm;
      delete r.handwrite_h_mm;
      delete r.handwrite_gap_mm;
    }
    return r;
  });
}

const KNOWN_FIELD_KINDS: LayoutFieldKind[] = [
  "digit_groups",
  "mcq_groups",
  "horizontal_letters",
  "vertical_letters",
  "digits",
  "mcq",
  "note",
  "declaration",
];

/** Köhnə `digit_groups` / `mcq_groups` bloklarını ayrıca sürüklənə bilən sahələrə ayırır */
export function expandGroupedIdentityFields(
  fields: LayoutField[],
  cfg: SheetConfig = DEFAULT_SHEET_CONFIG,
): LayoutField[] {
  const out: LayoutField[] = [];
  const gap = 3;

  for (const f of fields) {
    if (f.kind === "digit_groups") {
      const rows = digitGroupRowChunks(f);
      let yRun = Number(f.y_mm ?? identityZoneTopMmRef() + 10);
      const x0 = Number(f.x_mm ?? LAYOUT_CONTENT_LEFT_MM);
      for (const rowGroups of rows) {
        let xRun = x0;
        for (const g of rowGroups) {
          const block: LayoutField = {
            blockId: newBlockId(),
            kind: "digits",
            id: String(g.id ?? `dg_${out.length}`),
            label: String(g.label ?? "Kod"),
            count: Number(g.count ?? 6),
            x_mm: xRun,
            y_mm: yRun,
          };
          out.push(block);
          xRun += estimateBlockWidthMm(block, cfg) + gap;
        }
        if (rowGroups.length) {
          const rowH = Math.max(
            ...rowGroups.map((g) =>
              estimateBlockHeightMm(
                { blockId: "", kind: "digits", x_mm: 0, y_mm: 0, count: Number(g.count ?? 6) },
                cfg,
              ),
            ),
          );
          yRun += rowH + gap;
        }
      }
      continue;
    }

    if (f.kind === "mcq_groups") {
      const groups =
        (f.groups as Array<{ id?: string; label?: string; options?: string[] }> | undefined) ?? [];
      let xRun = Number(f.x_mm ?? LAYOUT_CONTENT_LEFT_MM);
      const y = Number(f.y_mm ?? identityZoneTopMmRef() + 10);
      for (const g of groups) {
        const block: LayoutField = {
          blockId: newBlockId(),
          kind: "mcq",
          id: String(g.id ?? `mq_${out.length}`),
          label: String(g.label ?? "Seçim"),
          options: (g.options ?? ["A", "B"]).map(String),
          x_mm: xRun,
          y_mm: y,
        };
        out.push(block);
        xRun += estimateBlockWidthMm(block, cfg) + gap;
      }
      continue;
    }

    out.push(f);
  }
  return out;
}

export function identityFieldPositionKey(f: LayoutField): string {
  const id = String(f.id ?? "").trim();
  if (id) return `${f.kind}|${id}`;
  return `${f.kind}|${String(f.label ?? "")}`;
}

/** Saxladıqdan sonra server normalize mövqeləri dəyişdirsə belə, istifadəçi yerlərini saxla */
export function mergePreservedFieldPositions(
  loaded: LayoutField[],
  previous: LayoutField[],
): LayoutField[] {
  const byKey = new Map(previous.map((f) => [identityFieldPositionKey(f), f]));
  return loaded.map((f) => {
    const prev = byKey.get(identityFieldPositionKey(f));
    if (!prev) return f;
    return { ...f, x_mm: prev.x_mm, y_mm: prev.y_mm, blockId: prev.blockId };
  });
}

/** Saxlanmış şablondan kanvas üçün sahələri bərpa edir; x mövqeyi audit məhdudiyyətinə sıxışdırılır */
export function fieldsFromApiPayload(
  raw: unknown,
  sheetConfig: SheetConfig = DEFAULT_SHEET_CONFIG,
): LayoutField[] {
  if (!Array.isArray(raw)) return [];
  const cfg = sheetConfig;
  const pw = layoutPaperWidthMm(cfg.paper_size);
  const xl = LAYOUT_CONTENT_LEFT_MM;
  const xr = layoutContentRightMaxMm(pw);
  const expanded: LayoutField[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const kind = r.kind as LayoutFieldKind;
    if (!KNOWN_FIELD_KINDS.includes(kind)) continue;
    const field = { ...(r as object), blockId: newBlockId(), kind } as LayoutField;
    expanded.push(field);
  }
  const split = expandGroupedIdentityFields(expanded, cfg);
  const out: LayoutField[] = [];
  for (const field of split) {
    let x = Number(field.x_mm);
    if (!Number.isFinite(x)) x = xl;
    const bw = estimateBlockWidthMm(field, cfg);
    field.x_mm = Math.min(Math.max(x, xl), Math.max(xl, xr - bw));
    out.push(field);
  }
  return out;
}

/** API/template_config-dən SheetConfig sahələri */
export function sheetConfigFromPayload(raw: Record<string, unknown>): SheetConfig {
  const base: SheetConfig = { ...DEFAULT_SHEET_CONFIG };
  (Object.keys(DEFAULT_SHEET_CONFIG) as (keyof SheetConfig)[]).forEach((k) => {
    if (raw[k] !== undefined && raw[k] !== null) {
      (base as Record<string, unknown>)[k] = raw[k];
    }
  });
  if (Array.isArray(raw.mcq_sections)) {
    base.mcq_sections = raw.mcq_sections as SheetConfig["mcq_sections"];
  }
  if (raw.fold_panels && typeof raw.fold_panels === "object") {
    base.fold_panels = raw.fold_panels as SheetConfig["fold_panels"];
  }
  if (Array.isArray(raw.open_blocks)) {
    base.open_blocks = raw.open_blocks as SheetConfig["open_blocks"];
  }
  return base;
}

/**
 * Sərbəst dizayn: backend `identity_height_mm` (freeform) ilə uyğun təxmin.
 * `mcqTopCapMm` — MCQ şəbəkəsinin yuxarı kənarı (mm, kağızın yuxarısından); >0 olanda
 * şəxsiyyət "ayağı" bu xəttin altına qədər kəsilir ki, sahəni aşağı çəkəndə şəbəkə özü yerində qalsın.
 *
 * `mcqMatch` verilibsə, sahə hündürlükləri MCQ-uyğunlaşmış cfg üzərində hesablanır
 * (PDF generator ilə eyni boy → kanvas estimasiyası yalançı pozitiv vermir).
 */
export function estimateFreeformIdentityHeightMm(
  fields: LayoutField[],
  cfg: SheetConfig,
  codeExtraMm = 0,
  mcqTopCapMm?: number,
  mcqMatch?: McqMatchInfo,
): number {
  const zoneTop = identityZoneTopMmRef();
  let mxBottom = zoneTop + 3 + 7;
  for (const f of fields) {
    const y0 = Number(f.y_mm ?? mxBottom);
    mxBottom = Math.max(mxBottom, y0 + estimateBlockHeightMm(f, cfg, mcqMatch));
  }
  let effectiveBottom = mxBottom;
  if (typeof mcqTopCapMm === "number" && mcqTopCapMm > 0 && Number.isFinite(mcqTopCapMm)) {
    const cap = mcqTopCapMm - MCQ_IDENTITY_SEP_MM;
    if (cap > zoneTop + 12) {
      effectiveBottom = Math.min(mxBottom, cap);
    }
  } else {
    const { h: phMm } = paperDimensionsFromCfg(cfg);
    const gb = phMm - 12 - 9;
    const effCap = gb - MIN_FREE_FORM_MCQ_RESERVE_MM;
    if (effCap > zoneTop + 12) {
      effectiveBottom = Math.min(mxBottom, effCap);
    }
  }
  return Math.max(14, effectiveBottom - zoneTop + codeExtraMm + 2);
}

/** Sərbəst dizayn: bütün sahələrin faktiki alt kənarı (mm, kağız yuxarısından). */
export function identityFieldsBottomMm(
  fields: LayoutField[],
  cfg: SheetConfig,
  mcqMatch?: McqMatchInfo,
): number {
  const zoneTop = identityZoneTopMmRef();
  if (!fields.length) return zoneTop + 10;
  let mx = zoneTop + 3;
  for (const f of fields) {
    const y0 = Number(f.y_mm);
    if (!Number.isFinite(y0)) continue;
    mx = Math.max(mx, y0 + estimateBlockHeightMm(f, cfg, mcqMatch));
  }
  return mx;
}

/** Cavab şəbəkəsi anchoru — sahələrin dərhal altından (mm). */
export function minMcqGridTopAnchorMm(
  fields: LayoutField[],
  cfg: SheetConfig,
  mcqMatch?: McqMatchInfo,
  gridLabelHeadroomMm = 0,
): number {
  return identityFieldsBottomMm(fields, cfg, mcqMatch) + MCQ_IDENTITY_SEP_MM + gridLabelHeadroomMm;
}

/** mcq_grid.top_mm → PDF gt anchor; yalnız sahə altından aşağı sürükləməyə icazə. */
export function resolveMcqGridTopAnchorMm(
  mcqTopMm: number,
  fields: LayoutField[],
  cfg: SheetConfig,
  mcqMatch?: McqMatchInfo,
  gridLabelHeadroomMm = 0,
): number {
  const minGt = minMcqGridTopAnchorMm(fields, cfg, mcqMatch, gridLabelHeadroomMm);
  if (!Number.isFinite(mcqTopMm) || mcqTopMm <= 0) return minGt;
  return Math.max(minGt, mcqTopMm);
}

function paperDimensionsFromCfg(cfg: SheetConfig): { w: number; h: number } {
  switch (cfg.paper_size) {
    case "A4L":
      return { w: 297, h: 210 };
    case "A3":
      return { w: 297, h: 420 };
    case "A3L":
      return { w: 420, h: 297 };
    case "A4":
    default:
      return { w: 210, h: 297 };
  }
}

export const MCQ_GRID_DRAG_ID = "__mcq_grid__";
export const MCQ_SECTION_DRAG_PREFIX = "__mcq_sec_";

export function mcqSectionDragId(index: number): string {
  return `${MCQ_SECTION_DRAG_PREFIX}${index}`;
}

export function parseMcqSectionDragIndex(id: string): number | null {
  if (!id.startsWith(MCQ_SECTION_DRAG_PREFIX)) return null;
  const n = Number(id.slice(MCQ_SECTION_DRAG_PREFIX.length));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type McqGridPos = { top_mm: number; left_mm: number };

/** mcq_grid obyektini mövqeyə çevirir */
export function mcqGridFromPayload(raw: unknown): McqGridPos {
  if (!raw || typeof raw !== "object") return { top_mm: 0, left_mm: LAYOUT_CONTENT_LEFT_MM };
  const r = raw as Record<string, unknown>;
  const top = Number(r.top_mm);
  const left = Number(r.left_mm);
  return {
    top_mm: Number.isFinite(top) ? top : 0,
    left_mm: Number.isFinite(left) ? left : LAYOUT_CONTENT_LEFT_MM,
  };
}

/**
 * DİM tipli standart şablon (dizayner «DİM şablonu»):
 * Ən üstdə ADINIZ | SOYADINIZ | ATA ADI yan-yana (şaquli kod),
 * altında şagird kodu / məktəb / sinif, sonra qrup–variant–bölmə.
 *
 * Sahə yerləşdirməsi MCQ-uyğunlaşmış estimasiya ilə hesablanır ki, PDF generator-un
 * `config_with_identity_matched_to_mcq` ilə çəkdiyi gerçək boylar ilə uyğun olsun.
 * Şaquli hərflərə `bubble_pitch_mm=3.0` qoyulur ki, 32 hərflik blok ~95–105mm
 * arasında sabit qalsın (DİM nümunəsində olduğu kimi).
 */
export function dimStandardTemplate(cfg: SheetConfig): {
  fields: LayoutField[];
  mcqGridPos: McqGridPos;
} {
  const mcqMatch = defaultDimMcqMatchInfo(cfg);
  const x = LAYOUT_CONTENT_LEFT_MM;
  const gap = 3;
  const yTop = identityZoneTopMmRef() + 10;
  // Şaquli hərf blok başlığı boyunca pitch: DİM tipli sıxlıq (~3mm) → bütün 32 hərf bloku ~95–105mm.
  const bubblePitch = 3.0;
  // MCQ-match-li cfg üzərində col_pitch: kanvas eni PDF ilə eyni olsun.
  const effForWidth = applyIdentityMcqBubbleSync(cfg, mcqMatch);
  const colPitch = Math.max(effForWidth.identity_letter_d_mm + 0.12, effForWidth.identity_letter_hgap_mm);

  const ad: LayoutField = {
    blockId: newBlockId(),
    kind: "vertical_letters",
    id: "ad",
    label: "ADINIZ",
    columns: 7,
    col_pitch_mm: colPitch,
    bubble_pitch_mm: bubblePitch,
    x_mm: x,
    y_mm: yTop,
  };
  let xRun = x + estimateBlockWidthMm(ad, cfg, mcqMatch) + gap;

  const sn: LayoutField = {
    blockId: newBlockId(),
    kind: "vertical_letters",
    id: "sn",
    label: "SOYADINIZ",
    columns: 8,
    col_pitch_mm: colPitch,
    bubble_pitch_mm: bubblePitch,
    x_mm: xRun,
    y_mm: yTop,
  };
  xRun += estimateBlockWidthMm(sn, cfg, mcqMatch) + gap;

  const fn: LayoutField = {
    blockId: newBlockId(),
    kind: "vertical_letters",
    id: "fn",
    label: "ATA ADI",
    columns: 6,
    col_pitch_mm: colPitch,
    bubble_pitch_mm: bubblePitch,
    x_mm: xRun,
    y_mm: yTop,
  };

  const nameH = Math.max(
    estimateBlockHeightMm(ad, cfg, mcqMatch),
    estimateBlockHeightMm(sn, cfg, mcqMatch),
    estimateBlockHeightMm(fn, cfg, mcqMatch),
  );
  let y = yTop + nameH + 3;
  const rowGap = 3;

  const studentCode: LayoutField = {
    blockId: newBlockId(),
    kind: "digits",
    id: "student_code",
    label: "Şagird kodu",
    count: 6,
    x_mm: x,
    y_mm: y,
  };
  const school: LayoutField = {
    blockId: newBlockId(),
    kind: "digits",
    id: "sch",
    label: "Məktəb №",
    count: 3,
    x_mm: x + estimateBlockWidthMm(studentCode, cfg, mcqMatch) + rowGap,
    y_mm: y,
  };
  const klass: LayoutField = {
    blockId: newBlockId(),
    kind: "digits",
    id: "cl",
    label: "Sinif",
    count: 2,
    x_mm:
      x +
      estimateBlockWidthMm(studentCode, cfg, mcqMatch) +
      rowGap +
      estimateBlockWidthMm(school, cfg, mcqMatch) +
      rowGap,
    y_mm: y,
  };

  y +=
    Math.max(
      estimateBlockHeightMm(studentCode, cfg, mcqMatch),
      estimateBlockHeightMm(school, cfg, mcqMatch),
      estimateBlockHeightMm(klass, cfg, mcqMatch),
    ) + rowGap;

  const grp: LayoutField = {
    blockId: newBlockId(),
    kind: "mcq",
    id: "grp",
    label: "Qrup",
    options: ["1", "2", "3", "4", "5"],
    x_mm: x,
    y_mm: y,
  };
  const variant: LayoutField = {
    blockId: newBlockId(),
    kind: "mcq",
    id: "var",
    label: "Variant",
    options: ["A", "B", "C", "D"],
    x_mm: x + estimateBlockWidthMm(grp, cfg, mcqMatch) + rowGap,
    y_mm: y,
  };
  const section: LayoutField = {
    blockId: newBlockId(),
    kind: "mcq",
    id: "sec",
    label: "Bölmə",
    options: ["Az", "RU", "GÜ"],
    x_mm:
      x +
      estimateBlockWidthMm(grp, cfg, mcqMatch) +
      rowGap +
      estimateBlockWidthMm(variant, cfg, mcqMatch) +
      rowGap,
    y_mm: y,
  };

  const fields = [ad, sn, fn, studentCode, school, klass, grp, variant, section];
  const mcqGridTop = minMcqGridTopAnchorMm(fields, cfg, mcqMatch, FIELD_HEADER_BAR_MM);

  return {
    fields,
    mcqGridPos: { top_mm: mcqGridTop, left_mm: x },
  };
}
