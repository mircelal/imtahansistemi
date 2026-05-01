/**
 * İmtahan sorğusu üçün default cavab kartı şəxsiyyəti.
 * Referans PDF: ən üstdə ADINIZ | SOYADINIZ | ATA ADI yan-yana (şaquli A–Z kod blokları),
 * altında şagird kodu / məktəb / sinif və qrup–variant–bölmə və s.
 */

import { DEFAULT_SHEET_CONFIG } from "../AnswerSheetDesigner/hooks/useSheetConfig";
import { estimateBlockHeightMm, estimateBlockWidthMm, type LayoutField } from "../AnswerSheetDesigner/layoutBlockModel";

export type AnswerCardIdentitySelection = {
  student_code: boolean;
  school: boolean;
  class_num: boolean;
  phone: boolean;
  first_name: boolean;
  last_name: boolean;
  father_name: boolean;
  foreign_lang: boolean;
  section: boolean;
  variant: boolean;
  group: boolean;
};

export function defaultAnswerCardIdentity(): AnswerCardIdentitySelection {
  return {
    student_code: true,
    school: true,
    class_num: true,
    phone: false,
    first_name: true,
    last_name: true,
    father_name: true,
    foreign_lang: true,
    section: true,
    variant: true,
    group: true,
  };
}

/** @deprecated Əvvəl köhnə referans üçün sabit floor idi — MCQ-ni çox aşağı salıb balonları sıxırdı */
export const DIM_REFERENCE_MCQ_GRID_TOP_MM = 0;

/** Üst sətirdə yan-yana düzülüş üçün sütun sayı — A4 məzmun eninə sığır (referans PDF) */
export const DIM_VL_COLS_AD = 7;
export const DIM_VL_COLS_SN = 8;
export const DIM_VL_COLS_FN = 6;

/** @deprecated — köhnə üfüqi ad sahəsi; yalnız arxa uyğunluq */
export const DIM_NAME_ROWS = 4;
export const DIM_COLUMN_LETTERS_COUNT = 14;

const IDENTITY_X_MM = 19.0;
const FIELD_STACK_GAP_MM = 3.0;
/** `layoutBlockModel.identityZoneTopMmRef` + 10 ilə sinxron */
const IDENTITY_BLOCK_START_Y_MM = 26.5;

function colPitchMm(): number {
  const c = DEFAULT_SHEET_CONFIG;
  return Math.max(c.identity_letter_d_mm + 0.12, c.identity_letter_hgap_mm);
}

/** Bir sıra kompakt digit_groups + başlıq üçün təxmini mm */
function compactDigitBandHeightMm(twoRows: boolean): number {
  const ch = 9.0 * 4.15 + 4.0;
  return ch + (twoRows ? ch + 8.0 : 6.0) + 4.8;
}

function fieldHeightForOverlay(f: Record<string, unknown>): number {
  const k = f.kind as string;
  if (k === "vertical_letters") {
    return estimateBlockHeightMm(f as unknown as LayoutField, DEFAULT_SHEET_CONFIG);
  }
  if (k === "horizontal_letters") {
    const rows = Number(f.rows ?? 4);
    const hw_h = 5.0;
    const hw_gap = 1.4;
    const ld = 3.05;
    const rowPitch = hw_h + hw_gap + ld + 1.5;
    return 5.0 + 6.0 + rows * rowPitch + 5.0;
  }
  if (k === "digit_groups") {
    const gr = f.groups as unknown[] | undefined;
    return compactDigitBandHeightMm((gr?.length ?? 0) >= 3);
  }
  if (k === "mcq_groups") return 22.0;
  if (k === "mcq") return 16.0;
  return 24.0;
}

export function buildIdentityFieldsFromSelection(s: AnswerCardIdentitySelection): Record<string, unknown>[] {
  const fields: Record<string, unknown>[] = [];
  let yCursor = IDENTITY_BLOCK_START_Y_MM;

  const nameSpecs: { id: string; label: string; cols: number }[] = [];
  if (s.first_name) nameSpecs.push({ id: "ad", label: "ADINIZ", cols: DIM_VL_COLS_AD });
  if (s.last_name) nameSpecs.push({ id: "sn", label: "SOYADINIZ", cols: DIM_VL_COLS_SN });
  if (s.father_name) nameSpecs.push({ id: "fn", label: "ATA ADI", cols: DIM_VL_COLS_FN });

  const pitch = colPitchMm();
  let xRun = IDENTITY_X_MM;
  let maxNameH = 0;
  for (const spec of nameSpecs) {
    const b: Record<string, unknown> = {
      kind: "vertical_letters",
      id: spec.id,
      label: spec.label,
      columns: spec.cols,
      col_pitch_mm: pitch,
      x_mm: xRun,
      y_mm: yCursor,
    };
    fields.push(b);
    maxNameH = Math.max(maxNameH, fieldHeightForOverlay(b));
    xRun += estimateBlockWidthMm(b as unknown as LayoutField, DEFAULT_SHEET_CONFIG) + FIELD_STACK_GAP_MM;
  }
  if (nameSpecs.length > 0) {
    yCursor += maxNameH + FIELD_STACK_GAP_MM;
  }

  const primaryDigits: { id: string; label: string; count: number }[] = [];
  if (s.student_code) {
    primaryDigits.push({ id: "student_code", label: "Şagird kodu", count: 6 });
  }
  if (s.school) primaryDigits.push({ id: "sch", label: "Məktəb №", count: 3 });
  if (s.class_num) primaryDigits.push({ id: "cl", label: "Sinif", count: 2 });

  if (primaryDigits.length > 0) {
    const twoRows = primaryDigits.length >= 3;
    const row: Record<string, unknown> = {
      kind: "digit_groups",
      compact: true,
      x_mm: IDENTITY_X_MM,
      y_mm: yCursor,
      groups: primaryDigits,
    };
    if (twoRows) {
      row.layout = "two_rows";
    }
    fields.push(row);
    yCursor += fieldHeightForOverlay(row) + FIELD_STACK_GAP_MM;
  }

  if (s.phone) {
    fields.push({
      kind: "digit_groups",
      compact: true,
      x_mm: IDENTITY_X_MM,
      y_mm: yCursor,
      groups: [{ id: "ph", label: "Əlaqə nömrəsi", count: 9 }],
    });
    yCursor += compactDigitBandHeightMm(false) + FIELD_STACK_GAP_MM;
  }

  const mcqGroups: { id: string; label: string; options: string[] }[] = [];
  if (s.group) mcqGroups.push({ id: "grp", label: "Qrup", options: ["1", "2", "3", "4", "5"] });
  if (s.variant) mcqGroups.push({ id: "var", label: "Variant", options: ["A", "B", "C", "D"] });
  if (s.section) mcqGroups.push({ id: "sec", label: "Bölmə", options: ["Az", "RU", "GÜ"] });
  if (mcqGroups.length > 0) {
    fields.push({
      kind: "mcq_groups",
      x_mm: IDENTITY_X_MM,
      y_mm: yCursor,
      groups: mcqGroups,
    });
    yCursor += 22.0 + FIELD_STACK_GAP_MM;
  }

  if (s.foreign_lang) {
    fields.push({
      kind: "mcq",
      id: "lang",
      label: "Xarici dil",
      x_mm: IDENTITY_X_MM,
      y_mm: yCursor,
      options: ["In", "Ru", "Al", "Fr", "Dr"],
    });
  }

  return fields;
}

export function buildAnswerSheetIdentityOverlay(s: AnswerCardIdentitySelection): Record<string, unknown> {
  let identity_fields = buildIdentityFieldsFromSelection(s);
  if (identity_fields.length === 0) {
    identity_fields = buildIdentityFieldsFromSelection(defaultAnswerCardIdentity());
  }

  let yMax = IDENTITY_BLOCK_START_Y_MM;
  for (const f of identity_fields) {
    const y = typeof f.y_mm === "number" ? f.y_mm : IDENTITY_BLOCK_START_Y_MM;
    const h = fieldHeightForOverlay(f);
    yMax = Math.max(yMax, y + h);
  }

  /** Şəbəkə şəxsiyyət zonasından dərhal sonra başlasın (DİM tipli sıxlıq üçün sabit 188 mm floor istifadə etmə). */
  const mcqTop = Math.min(248.0, Math.max(yMax + 10.0, 92.0));

  return {
    layout_mode: "freeform",
    identity_section: true,
    identity_fields,
    identity_digit_compact: true,
    identity_ad_rows: DIM_NAME_ROWS,
    identity_sn_rows: DIM_NAME_ROWS,
    identity_fn_rows: DIM_NAME_ROWS,
    single_page_layout: true,
    mcq_grid: { top_mm: mcqTop },
  };
}

export function isAnswerCardIdentityPartial(
  raw: unknown,
): raw is Partial<AnswerCardIdentitySelection> & Record<string, unknown> {
  return raw != null && typeof raw === "object" && !Array.isArray(raw);
}
