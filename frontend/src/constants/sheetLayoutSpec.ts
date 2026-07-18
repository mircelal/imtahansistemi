/**
 * Cavab kartı layout spesifikasiyası (mm) — backend sheet_layout_spec.py ilə eyni rəqəmlər.
 * Dəyişəndə hər iki faylı sinxron saxlayın.
 */
export const SAFE_CONTENT_INSET_MM = 2.5;
export const MIN_FREE_FORM_FIELD_GAP_MM = 1.2;
/** MCQ şəbəkəsi footer xəttindən əvvəl minimum boşluq (mm) — backend MIN_GRID_ABOVE_FOOTER_MM */
export const MIN_GRID_ABOVE_FOOTER_MM = 0.5;
/** Freeform: şəxsiyyət hündürlüyü hesabında MCQ üçün saxlanılan minimum zolaq (mm) */
export const MIN_FREE_FORM_MCQ_RESERVE_MM = 72.0;
/** Kağız kənarı (mm) — backend L_BASE.margin ilə sinxron */
export const LAYOUT_SIDE_MARGIN_MM = 12.0;
/** DİM tipli timing zolağı (mm) — backend TIMING_TRACK_MM */
export const LAYOUT_TIMING_TRACK_MM = 7.0;
/** Məzmunun təhlükəsiz sol sərhədi (mm) — dim_sheet_layout.content_left_mm */
export const LAYOUT_CONTENT_LEFT_MM = LAYOUT_SIDE_MARGIN_MM + LAYOUT_TIMING_TRACK_MM;
/** Şaquli stack (dizayner «stack») üçün sahələr arası boşluq — backend MIN_IDENTITY_STACK_GAP_MM */
export const IDENTITY_STACK_GAP_MM = 2.6;
export const MCQ_IDENTITY_SEP_MM = 1.5;

/** dim_sheet_layout: fiducial + magenta + header — identity_zone_top_mm */
export function identityZoneTopMmRef(): number {
  const fidC = 0.7 + 3.0;
  const fidBot = fidC + 3.0;
  const magTop = fidBot + 0.35;
  return magTop + 9.8;
}

/** Kağız eni (mm) — dizayner/mcqLayout ilə eyni cədvəl */
export function layoutPaperWidthMm(paper: string | undefined): number {
  switch (paper) {
    case "A4L":
      return 297;
    case "A3":
      return 297;
    case "A3L":
      return 420;
    case "A4":
    default:
      return 210;
  }
}

/** Kağız hündürlüyü (mm) */
export function layoutPaperHeightMm(paper: string | undefined): number {
  switch (paper) {
    case "A4L":
      return 210;
    case "A3":
      return 420;
    case "A3L":
      return 297;
    case "A4":
    default:
      return 297;
  }
}

/** Sağ məzmun sərhədi (mm) — layout_audit right_max */
export function layoutContentRightMaxMm(pageWidthMm: number): number {
  return pageWidthMm - LAYOUT_SIDE_MARGIN_MM - SAFE_CONTENT_INSET_MM;
}

export const PRINT_CHECKLIST_AZ: readonly string[] = [
  "PDF çapında «Actual size» / «100%» seçin; «Fit to page» söndürün.",
  "Kağız: A4 (şablona uyğun); ofis printerdə «Borderless» söndürün.",
  "Nümunə çapdan sonra şaquli və üfüqi ölçüləri ruler ilə yoxlayın.",
  "Mətn və balonlar kəsilmirsə — printer sürücüsündə minimum margin təyinini yoxlayın.",
  "Serverdə DejaVu və ya Arial TTF olmasa PDF Helvetica ilə gedə bilər — AZ hərfləri üçün TTF quraşdırın.",
];

const PAPER_CHECKLIST_LINE: Record<string, string> = {
  A4: "Kağız: A4 (210×297 mm); ofis printerdə «Borderless» söndürün.",
  A4L: "Kağız: A4 üfüqi (297×210 mm); ofis printerdə «Borderless» söndürün.",
  A3: "Kağız: A3 (297×420 mm); ofis printerdə «Borderless» söndürün.",
  A3L: "Kağız: A3 üfüqi (420×297 mm); ofis printerdə «Borderless» söndürün.",
};

export function printChecklistForPaper(paperKey?: string): string[] {
  const key = (paperKey ?? "A4").toUpperCase();
  const paperLine = PAPER_CHECKLIST_LINE[key] ?? `Kağız: ${key} (şablona uyğun).`;
  return PRINT_CHECKLIST_AZ.map((line) => (line.startsWith("Kağız:") ? paperLine : line));
}
