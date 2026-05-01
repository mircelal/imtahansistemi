import type { SheetConfig } from "./hooks/useSheetConfig";
import { DEFAULT_SHEET_CONFIG } from "./hooks/useSheetConfig";

export type LayoutFieldKind =
  | "digit_groups"
  | "mcq_groups"
  | "horizontal_letters"
  | "vertical_letters"
  | "digits"
  | "mcq"
  | "note";

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

const AZ_COUNT = 32;

/** Bütün sahə növləri üçün vahid üst başlıq zolağı (mm) — kanvas + PDF şaquli/rəqəm ilə sinxron */
export const FIELD_HEADER_BAR_MM = 4.8;

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
  return FIELD_HEADER_BAR_MM + 0.8 + body + 5.5;
}

function horizontalLetterBlockHeightMm(f: LayoutField, nRows: number, cfg: SheetConfig): number {
  const m = metFromCfg(cfg);
  if (f.row_layout === "handwrite_coding") {
    const hwH = Number(f.handwrite_h_mm ?? cfg.identity_handwrite_h_mm);
    const hwG = Number(f.handwrite_gap_mm ?? cfg.identity_handwrite_gap_mm);
    const ld = m.letter_d;
    const rowPitch = hwH + hwG + ld + 1.5;
    return 5.0 + 6.0 + nRows * rowPitch + 5.0;
  }
  return 5.0 + 6.0 + nRows * m.letter_vgap + 5.0;
}

/** PDF-dəki kimi təxmini en (mm) — kanvas WYSIWYG üçün */
export function estimateBlockWidthMm(f: LayoutField, cfg: SheetConfig = DEFAULT_SHEET_CONFIG): number {
  const m = metFromCfg(cfg);
  const pitch = m.digit_col_gap + m.digit_d;

  if (f.kind === "digit_groups") {
    const groups = (f.groups as Array<{ count?: number }> | undefined) ?? [];
    const twoRows = f.layout === "two_rows" && groups.length >= 3;
    const chunks = twoRows ? [groups.slice(0, 1), groups.slice(1)] : [groups];
    const compact = Boolean(f.compact ?? cfg.identity_digit_compact);
    const labelW = compact ? 13 : 26;
    const groupTail = compact ? 3.5 : 10;
    let maxW = 12;
    for (const row of chunks) {
      let x = 2;
      for (const g of row) {
        const cnt = Number(g.count ?? 1);
        x += labelW + cnt * pitch + groupTail;
      }
      maxW = Math.max(maxW, x);
    }
    return Math.min(maxW, 175);
  }

  if (f.kind === "horizontal_letters") {
    const nLetters = 32;
    if (f.row_layout === "handwrite_coding") {
      const hwW = Number(f.handwrite_w_mm ?? cfg.identity_handwrite_w_mm);
      const lx0 = 11 + hwW + 2 + m.letter_d / 2;
      return lx0 + (nLetters - 1) * m.letter_hgap + m.letter_d + 6;
    }
    const lx0 = 11 + m.letter_d / 2;
    return lx0 + (nLetters - 1) * m.letter_hgap + m.letter_d + 6;
  }

  if (f.kind === "mcq_groups") return 168;
  if (f.kind === "vertical_letters") {
    const ncol = Number(f.columns ?? 8);
    const colPitch = Number(f.col_pitch_mm ?? Math.max(m.letter_d + 0.12, m.letter_hgap));
    return 2 + ncol * colPitch + 1;
  }
  if (f.kind === "digits") {
    const cnt = Number(f.count ?? 6);
    return 2 + cnt * pitch + m.digit_d + 4;
  }
  if (f.kind === "mcq") {
    const opts = (f.options as string[] | undefined)?.length ?? 4;
    return 14 + opts * 9 + 8;
  }
  if (f.kind === "note") return 175;
  return 80;
}

export function estimateBlockHeightMm(f: LayoutField, cfg: SheetConfig = DEFAULT_SHEET_CONFIG): number {
  const kind = f.kind;
  if (kind === "digit_groups") {
    const groups = (f.groups as unknown[] | undefined) ?? [];
    const twoRows = f.layout === "two_rows" && groups.length >= 3;
    const nChunks = twoRows ? 2 : 1;
    const compact = Boolean(f.compact ?? cfg.identity_digit_compact);
    const ch = digitColHeightMm(cfg);
    let h = 0;
    for (let i = 0; i < nChunks; i++) {
      const gap = compact ? 4 : i === 0 ? 5 : 6;
      h += ch + gap;
    }
    return h + FIELD_HEADER_BAR_MM;
  }
  if (kind === "mcq_groups") return 18 + FIELD_HEADER_BAR_MM;
  if (kind === "horizontal_letters") {
    const n = Number(f.rows ?? 8);
    return FIELD_HEADER_BAR_MM + horizontalLetterBlockHeightMm(f, n, cfg);
  }
  if (kind === "vertical_letters") {
    const m = metFromCfg(cfg);
    return verticalLettersBlockHeightMm(m.letter_d, m.letter_vgap, cfg, f);
  }
  if (kind === "digits") {
    return FIELD_HEADER_BAR_MM + 1.5 + digitColHeightMm(cfg) + 4.0;
  }
  if (kind === "mcq") {
    const opts = (f.options as string[] | undefined)?.length ?? 4;
    return FIELD_HEADER_BAR_MM + 3.2 + opts * 2.15;
  }
  if (kind === "note") {
    return FIELD_HEADER_BAR_MM + 5 * Math.max(1, Number(f.lines ?? 1));
  }
  return 12;
}

export function createBlock(kind: LayoutFieldKind, cfg: SheetConfig): LayoutField {
  const blockId = newBlockId();
  const base: LayoutField = { blockId, kind, x_mm: 19, y_mm: 52 };
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
          { id: "var", label: "Variant", options: ["A", "B"] },
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
    default:
      return base;
  }
}

export function stackFieldsVertical(fields: LayoutField[], startY = 46, cfg: SheetConfig = DEFAULT_SHEET_CONFIG): LayoutField[] {
  let y = startY;
  const x = 19;
  return fields.map((f) => {
    const nf = { ...f, x_mm: x, y_mm: y };
    y += estimateBlockHeightMm(f, cfg) + 3;
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
  "note"
];

/** Saxlanmış şablondan kanvas üçün sahələri bərpa edir */
export function fieldsFromApiPayload(raw: unknown): LayoutField[] {
  if (!Array.isArray(raw)) return [];
  const out: LayoutField[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const kind = r.kind as LayoutFieldKind;
    if (!KNOWN_FIELD_KINDS.includes(kind)) continue;
    out.push({ ...(r as object), blockId: newBlockId(), kind } as LayoutField);
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
  return base;
}

/** dim_sheet_layout.identity_zone_top_mm — mcqLayout ilə eyni (import dövrəsi yox). */
function identityZoneTopMmRef(): number {
  const fidC = 0.7 + 3.0;
  const fidBot = fidC + 3.0;
  const magTop = fidBot + 0.35;
  return magTop + 9.8;
}

/** `L.sep_v` / mcqLayout — dairəvi import yoxdur */
const MCQ_IDENTITY_SEP_MM = 1.5;

/**
 * Sərbəst dizayn: backend `identity_height_mm` (freeform) ilə uyğun təxmin.
 * `mcqTopCapMm` — MCQ şəbəkəsinin yuxarı kənarı (mm, kağızın yuxarısından); >0 olanda
 * şəxsiyyət “ayağı” bu xəttin altına qədər kəsilir ki, sahəni aşağı çəkəndə şəbəkə özü yerində qalsın.
 */
export function estimateFreeformIdentityHeightMm(
  fields: LayoutField[],
  cfg: SheetConfig,
  codeExtraMm = 0,
  mcqTopCapMm?: number,
): number {
  const zoneTop = identityZoneTopMmRef();
  let mxBottom = zoneTop + 3 + 7;
  for (const f of fields) {
    const y0 = Number(f.y_mm ?? mxBottom);
    mxBottom = Math.max(mxBottom, y0 + estimateBlockHeightMm(f, cfg));
  }
  let effectiveBottom = mxBottom;
  if (typeof mcqTopCapMm === "number" && mcqTopCapMm > 0 && Number.isFinite(mcqTopCapMm)) {
    const cap = mcqTopCapMm - MCQ_IDENTITY_SEP_MM;
    if (cap > zoneTop + 12) {
      effectiveBottom = Math.min(mxBottom, cap);
    }
  }
  return Math.max(14, effectiveBottom - zoneTop + codeExtraMm + 2);
}

export const MCQ_GRID_DRAG_ID = "__mcq_grid__";

export type McqGridPos = { top_mm: number; left_mm: number };

/** mcq_grid obyektini mövqeyə çevirir */
export function mcqGridFromPayload(raw: unknown): McqGridPos {
  if (!raw || typeof raw !== "object") return { top_mm: 0, left_mm: 19 };
  const r = raw as Record<string, unknown>;
  const top = Number(r.top_mm);
  const left = Number(r.left_mm);
  return {
    top_mm: Number.isFinite(top) ? top : 0,
    left_mm: Number.isFinite(left) ? left : 19
  };
}

/**
 * DİM tipli standart şablon (dizayner «DİM şablonu»):
 * Ən üstdə ADINIZ | SOYADINIZ | ATA ADI yan-yana (şaquli kod),
 * altında şagird kodu / məktəb / sinif, sonra qrup–variant–bölmə.
 */
export function dimStandardTemplate(cfg: SheetConfig): {
  fields: LayoutField[];
  mcqGridPos: McqGridPos;
} {
  const colPitch = Math.max(cfg.identity_letter_d_mm + 0.12, cfg.identity_letter_hgap_mm);
  const x = 19;
  const gap = 3;
  const yTop = identityZoneTopMmRef() + 10;

  const ad: LayoutField = {
    blockId: newBlockId(),
    kind: "vertical_letters",
    id: "ad",
    label: "ADINIZ",
    columns: 7,
    col_pitch_mm: colPitch,
    x_mm: x,
    y_mm: yTop,
  };
  let xRun = x + estimateBlockWidthMm(ad, cfg) + gap;

  const sn: LayoutField = {
    blockId: newBlockId(),
    kind: "vertical_letters",
    id: "sn",
    label: "SOYADINIZ",
    columns: 8,
    col_pitch_mm: colPitch,
    x_mm: xRun,
    y_mm: yTop,
  };
  xRun += estimateBlockWidthMm(sn, cfg) + gap;

  const fn: LayoutField = {
    blockId: newBlockId(),
    kind: "vertical_letters",
    id: "fn",
    label: "ATA ADI",
    columns: 6,
    col_pitch_mm: colPitch,
    x_mm: xRun,
    y_mm: yTop,
  };

  const nameH = Math.max(
    estimateBlockHeightMm(ad, cfg),
    estimateBlockHeightMm(sn, cfg),
    estimateBlockHeightMm(fn, cfg),
  );
  let y = yTop + nameH + 3;

  const digitBlock: LayoutField = {
    blockId: newBlockId(),
    kind: "digit_groups",
    compact: cfg.identity_digit_compact,
    x_mm: x,
    y_mm: y,
    layout: "two_rows",
    groups: [
      { id: "student_code", label: "Şagird kodu", count: 6 },
      { id: "sch", label: "Məktəb №", count: 3 },
      { id: "cl", label: "Sinif", count: 2 },
    ],
  } as LayoutField;

  y += estimateBlockHeightMm(digitBlock, cfg) + 3;

  const meta: LayoutField = {
    blockId: newBlockId(),
    kind: "mcq_groups",
    x_mm: x,
    y_mm: y,
    groups: [
      { id: "grp", label: "Qrup", options: ["1", "2", "3", "4", "5"] },
      { id: "var", label: "Variant", options: ["A", "B", "C", "D"] },
      { id: "sec", label: "Bölmə", options: ["Az", "RU", "GÜ"] },
    ],
  } as LayoutField;

  return {
    fields: [ad, sn, fn, digitBlock, meta],
    mcqGridPos: { top_mm: 0, left_mm: x },
  };
}
