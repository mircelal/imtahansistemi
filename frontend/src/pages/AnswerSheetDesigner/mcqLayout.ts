/**
 * MCQ şəbəkəsi ölçüləri — backend dim_sheet_layout.py ilə eyni məntiq.
 */
import {
  LAYOUT_CONTENT_LEFT_MM,
  layoutContentRightMaxMm,
  MIN_FREE_FORM_MCQ_RESERVE_MM,
  MIN_GRID_ABOVE_FOOTER_MM,
  SAFE_CONTENT_INSET_MM,
} from "../../constants/sheetLayoutSpec";
import type { McqSection, SheetConfig } from "./hooks/useSheetConfig";
import type { LayoutField } from "./layoutBlockModel";
import {
  estimateFreeformIdentityHeightMm,
  identityFieldsBottomMm,
  resolveMcqGridTopAnchorMm,
} from "./layoutBlockModel";

const L = {
  margin: 12.0,
  header_h: 9.8,
  sep_v: 1.5,
  footer_h: 9.0,
  q_num_w: 11.0,
  bubble_d: 6.0,
  hgap: 7.5,
  vgap: 8.0,
  grid_top_pad: 1.25,
  /** Şaquli MCQ: mcq_hgap_mm yoxdursa (backend L_BASE ilə eyni) */
  mcq_tower_strip_gap: 3.35,
  /** Backend L_BASE.mcq_tower_opt_min_clear_mm — şaquli variant dairələri üst-üstə düşməsin */
  mcq_tower_opt_min_clear_mm: 1.05,
};

/** Şəxsiyyət bitənə qədər MCQ-yə boşluq — dim_sheet_layout L_BASE.sep_v ilə sinxron */
export function sheetSepBelowIdentityMm(): number {
  return L.sep_v;
}

const TIMING = 7.0;

/** dim_sheet_layout.py ilə sinxron — üst fiducial + magenta + şəxsiyyət/MCQ yuxarı istinad */
const FID_INSET = 0.7;
const FID_RO = 3.0;
const FID_GAP_MAG_BELOW = 0.35;
const FID_GAP_MAG_SIDE = 0.4;

export function fiducialCornerCenterFromEdgeMm(): number {
  return FID_INSET + FID_RO;
}
export function fiducialOuterBottomFromPageTopMm(): number {
  return fiducialCornerCenterFromEdgeMm() + FID_RO;
}
export function headerMagentaTopFromPageTopMm(): number {
  return fiducialOuterBottomFromPageTopMm() + FID_GAP_MAG_BELOW;
}
export function identityZoneTopMm(): number {
  return headerMagentaTopFromPageTopMm() + L.header_h;
}

export function headerMagentaHorizontalInsetMm(): number {
  return fiducialOuterBottomFromPageTopMm() + FID_GAP_MAG_SIDE;
}

/** dim_sheet_layout.tower_num_label_box_width_mm ilə eyni — zolaq eni toxunmadan nömrə qutusu */
const TOWER_NUM_LABEL_MIN_W_MM = 8.2;

export function towerNumLabelBoxWidthMm(stripPitchMm: number, numCellMm: number): number {
  const safe = Math.max(0.1, stripPitchMm - 0.35);
  return Math.min(safe, Math.max(numCellMm, TOWER_NUM_LABEL_MIN_W_MM));
}

export function contentLeftMm(): number {
  return LAYOUT_CONTENT_LEFT_MM;
}

/** Məzmun üçün sağ təhlükəsiz sərhəd (mm) — layout_audit `right_max` ilə eyni */
export function contentRightMaxMm(pageWidthMm: number): number {
  return layoutContentRightMaxMm(pageWidthMm);
}

export function paperDimensionsMm(paper: SheetConfig["paper_size"]): { w: number; h: number } {
  switch (paper) {
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

export function mcqOptionsHorizontal(cfg: SheetConfig): boolean {
  return String(cfg.mcq_options_layout ?? "vertical").toLowerCase() === "horizontal";
}

export function mcqTowerStripGapMm(cfg: SheetConfig): number {
  const raw = cfg.mcq_hgap_mm ?? L.mcq_tower_strip_gap;
  return Math.max(2.25, Math.min(12.0, Number.isFinite(raw) ? raw : L.mcq_tower_strip_gap));
}

function towerNumCellMm(bd: number, cfg: SheetConfig): number {
  const raw = cfg.mcq_num_cell_mm;
  if (raw != null && Number.isFinite(raw)) {
    return Math.max(2.8, Math.min(8.0, raw));
  }
  return Math.max(2.55, Math.min(5.2, bd + 0.12));
}

function solveMcqTowerSpacingSinglePage(
  phMm: number,
  availWMm: number,
  qCount: number,
  options: number,
  gtMm: number,
  cfg: SheetConfig,
): [number, number, number] {
  const gbMm = phMm - L.margin - L.footer_h;
  const y0 = gtMm + L.grid_top_pad;
  const hg = mcqTowerStripGapMm(cfg);
  const bandGap = cfg.mcq_tower_band_gap_mm ?? 0.95;
  const padBelowNum = cfg.mcq_num_to_bubbles_pad_mm ?? 0.48;
  const auto = cfg.mcq_auto_fit !== false;
  const aw = Math.max(10.0, availWMm);

  if (!auto) {
    const bd0 = cfg.mcq_bubble_d_mm ?? L.bubble_d;
    const vg0 = cfg.mcq_vgap_mm ?? L.vgap;
    const bd = Math.max(2.8, Math.min(8.5, Number.isFinite(bd0) ? bd0 : L.bubble_d));
    const vgRaw = Math.max(3.0, Math.min(14.0, Number.isFinite(vg0) ? vg0 : L.vgap));
    const clear = cfg.mcq_tower_opt_min_clear_mm ?? L.mcq_tower_opt_min_clear_mm;
    const vg = Math.max(bd + clear, vgRaw);
    return [bd, vg, towerNumCellMm(bd, cfg)];
  }

  const totalHeightIfFits = (bd: number, vg: number, numCell: number): number | null => {
    const strip = Math.max(numCell, bd) + hg;
    if (strip <= 0) return null;
    const nPerRow = Math.max(1, Math.floor(aw / strip));
    const nRows = qCount > 0 ? Math.ceil(qCount / nPerRow) : 0;
    if (nRows <= 0) return 0;
    const rowH = numCell + padBelowNum + (options - 1) * vg + bd;
    const totalH = nRows * rowH + Math.max(0, nRows - 1) * bandGap;
    if (y0 + totalH <= gbMm - 0.5) return totalH;
    return null;
  };

  let best: [number, number, number] | null = null;
  let bestH = Infinity;
  const bdHi = Math.min(6.0, L.bubble_d);
  const bdLo = 2.42;
  const step = 0.16;

  const clear = cfg.mcq_tower_opt_min_clear_mm ?? L.mcq_tower_opt_min_clear_mm;
  for (let bdI = bdHi; bdI >= bdLo - 1e-9; bdI -= step) {
    const numCell = towerNumCellMm(bdI, cfg);
    const vgMin = bdI + clear;
    const vgSoft = Math.min(L.vgap, Math.max(bdI * 1.12, bdI + 0.85));
    const vgMax = Math.max(vgSoft, vgMin);
    for (let vgI = vgMax; vgI >= vgMin - 1e-9; vgI -= step) {
      const th = totalHeightIfFits(bdI, vgI, numCell);
      if (th != null && th < bestH) {
        bestH = th;
        best = [bdI, vgI, numCell];
      }
    }
  }

  if (best) return best;

  const bdE = Math.max(2.42, bdLo);
  const ncE = towerNumCellMm(bdE, cfg);
  const vgFloor = bdE + clear;
  for (let vgE = vgFloor; vgE <= 8.0; vgE += 0.12) {
    if (totalHeightIfFits(bdE, vgE, ncE) != null) return [bdE, vgE, ncE];
  }
  return [Math.max(2.8, bdE), Math.max(vgFloor, 2.65), ncE];
}

export function computeMcquestionTowerRows(
  pwMm: number,
  phMm: number,
  qCount: number,
  gtMm: number,
  leftMm: number,
  bubbleD: number,
  optVgap: number,
  hgStrip: number,
  numCell: number,
  options: number,
  cfg: SheetConfig,
): { blocks: McqTowerRowBlock[]; gt: number; gb: number } {
  const gb = phMm - L.margin - L.footer_h;
  let left = leftMm;
  let availW = pwMm - left - L.margin;
  if (availW <= 10) {
    availW = Math.max(10, pwMm - 2 * L.margin);
    left = L.margin;
  }
  const hg = Math.max(2.25, Math.min(12.0, hgStrip));
  const bandGap = cfg.mcq_tower_band_gap_mm ?? 0.95;
  const padBelowNum = cfg.mcq_num_to_bubbles_pad_mm ?? 0.48;
  const stripPitch = Math.max(numCell, bubbleD) + hg;
  const nPerRow = Math.max(1, Math.floor(availW / stripPitch));
  const numLabelW = towerNumLabelBoxWidthMm(stripPitch, numCell);
  const blocks: McqTowerRowBlock[] = [];
  let qn = 1;
  let rowY0 = gtMm + L.grid_top_pad;
  while (qn <= qCount) {
    const chunk = Array.from({ length: Math.min(nPerRow, qCount - qn + 1) }, (_, i) => qn + i);
    const firstCx = left + stripPitch / 2.0;
    const firstCy = rowY0 + numCell + padBelowNum + bubbleD / 2.0;
    blocks.push({
      layout: "mcq_tower_row",
      row_y0_mm: rowY0,
      row_left_mm: left,
      strip_pitch_mm: stripPitch,
      num_cell_mm: numCell,
      num_label_w_mm: numLabelW,
      qs: chunk,
      bd: bubbleD,
      opt_vgap: optVgap,
      options,
      pad_below_num: padBelowNum,
      first_bx_mm: firstCx,
      first_by_mm: firstCy,
    });
    const rowH = numCell + padBelowNum + (options - 1) * optVgap + bubbleD;
    rowY0 += rowH + bandGap;
    qn += chunk.length;
  }
  return { blocks, gt: gtMm, gb };
}

function mcqFitsOnePageAuto(phMm: number, cols: number, qCount: number, gtMm: number): boolean {
  if (qCount <= 0) return true;
  const gbMm = phMm - L.margin - L.footer_h;
  const [bd, vg] = solveMcqSpacingSinglePage(phMm, cols, qCount, gtMm);
  const perCol = Math.ceil(qCount / cols);
  if (perCol <= 1) return true;
  const firstBy = gtMm + L.grid_top_pad + bd / 2.0;
  const lastC = firstBy + (perCol - 1) * vg;
  return lastC + bd / 2.0 <= gbMm - 0.5;
}

export function maxQuestionsFitBelowIdentity(
  phMm: number,
  cols: number,
  identityH_mm: number,
  cfg: SheetConfig,
  pwMm = 210.0,
  leftMm?: number,
): number {
  const gt = identityZoneTopMm() + identityH_mm + L.sep_v;
  const gb = phMm - L.margin - L.footer_h;
  const left = leftMm ?? contentLeftMm();
  const options = Math.max(2, Math.min(5, cfg.options_per_question));
  const auto = cfg.mcq_auto_fit !== false;

  if (!mcqOptionsHorizontal(cfg)) {
    const availW = Math.max(10.0, pwMm - left - L.margin);
    const hg = mcqTowerStripGapMm(cfg);
    const bandGap = cfg.mcq_tower_band_gap_mm ?? 0.95;
    const padBelowNum = cfg.mcq_num_to_bubbles_pad_mm ?? 0.48;
    const y0 = gt + L.grid_top_pad;
    const availH = gb - y0 - 0.5;

    if (!auto) {
      const bd0 = cfg.mcq_bubble_d_mm ?? L.bubble_d;
      const vg0 = cfg.mcq_vgap_mm ?? L.vgap;
      const bd = Math.max(2.8, Math.min(8.5, Number.isFinite(bd0) ? bd0 : L.bubble_d));
      const vgRaw = Math.max(3.0, Math.min(14.0, Number.isFinite(vg0) ? vg0 : L.vgap));
      const clear = cfg.mcq_tower_opt_min_clear_mm ?? L.mcq_tower_opt_min_clear_mm;
      const vg = Math.max(bd + clear, vgRaw);
      const numCell = towerNumCellMm(bd, cfg);
      const strip = Math.max(numCell, bd) + hg;
      const nPerRow = Math.max(1, Math.floor(availW / strip));
      const rowH = numCell + padBelowNum + (options - 1) * vg + bd;
      if (rowH <= 0 || nPerRow <= 0) return 0;
      let lo = 0;
      let hi = 400;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi + 1) / 2);
        const need = mid * rowH + Math.max(0, mid - 1) * bandGap;
        if (need <= availH) lo = mid;
        else hi = mid - 1;
      }
      return Math.max(0, lo * nPerRow);
    }

    const fitsTower = (qn: number): boolean => {
      if (qn <= 0) return true;
      const [bd, vg, numCell] = solveMcqTowerSpacingSinglePage(phMm, availW, qn, options, gt, cfg);
      const strip = Math.max(numCell, bd) + hg;
      const nPerRow = Math.max(1, Math.floor(availW / strip));
      const nRows = Math.ceil(qn / nPerRow);
      const rowH = numCell + padBelowNum + (options - 1) * vg + bd;
      const totalH = nRows * rowH + Math.max(0, nRows - 1) * bandGap;
      return y0 + totalH <= gb - 0.5;
    };

    let lo = 0;
    let hi = 400;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi + 1) / 2);
      if (fitsTower(mid)) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  if (!auto) {
    const bd0 = cfg.mcq_bubble_d_mm ?? L.bubble_d;
    const vg0 = cfg.mcq_vgap_mm ?? L.vgap;
    const bd = Math.max(2.8, Math.min(8.5, Number.isFinite(bd0) ? bd0 : L.bubble_d));
    const vg = Math.max(3.0, Math.min(14.0, Number.isFinite(vg0) ? vg0 : L.vgap));
    const firstBy = gt + L.grid_top_pad + bd / 2.0;
    const avail = gb - firstBy - bd / 2.0 - 1.0;
    if (avail <= 0) return 0;
    const maxPerCol = Math.floor(avail / vg) + 1;
    return Math.max(0, maxPerCol * cols);
  }

  let lo = 0;
  let hi = 400;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    if (mcqFitsOnePageAuto(phMm, cols, mid, gt)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function solveMcqSpacingSinglePage(
  phMm: number,
  cols: number,
  qCount: number,
  gtMm: number,
): [number, number] {
  const gbMm = phMm - L.margin - L.footer_h;
  const perCol = Math.ceil(qCount / cols);
  if (perCol <= 1) return [L.bubble_d, L.vgap];

  let bd = L.bubble_d;
  while (bd >= 4.0) {
    const firstBy = gtMm + L.grid_top_pad + bd / 2.0;
    const maxCenterSpan = gbMm - bd / 2.0 - firstBy - 0.5;
    if (maxCenterSpan <= 0) {
      bd -= 0.35;
      continue;
    }
    const maxVgap = maxCenterSpan / (perCol - 1);
    const vgap = Math.min(L.vgap, Math.max(4.5, maxVgap));
    const lastC = firstBy + (perCol - 1) * vgap;
    if (lastC + bd / 2.0 <= gbMm - 0.5) return [bd, vgap];
    bd -= 0.35;
  }
  const vgap = 4.5;
  return [Math.max(4.0, bd), vgap];
}

/** Üfüqi variant pitch: tower strip (~3.35) qarışmasın; min = Ø + 0.5. */
export function horizontalOptionPitchMm(cfg: SheetConfig, bubbleDMm?: number): number {
  const bd = Math.max(2.8, Math.min(8.5, bubbleDMm ?? cfg.mcq_bubble_d_mm ?? L.bubble_d));
  const raw = cfg.mcq_hgap_mm;
  let h = raw == null || !Number.isFinite(raw) ? L.hgap : Number(raw);
  if (h + 1e-6 < bd) {
    h = L.hgap;
  }
  return Math.max(bd + 0.5, Math.min(12.0, h));
}

export function fitHorizontalRowPitch(
  colWMm: number,
  options: number,
  bubbleDMm: number,
  hgapMm: number,
  qNumWMm = L.q_num_w,
): number {
  const opts = Math.max(1, options);
  const bd = Math.max(2.8, bubbleDMm);
  const pad = 1.5;
  if (opts <= 1) return hgapMm;
  const needed = qNumWMm + (opts - 1) * hgapMm + bd + pad;
  if (needed <= colWMm + 1e-6) return hgapMm;
  const maxHg = (colWMm - qNumWMm - bd - pad) / (opts - 1);
  return Math.max(bd + 0.5, Math.min(hgapMm, maxHg));
}

/** Backend `resolve_mcq_spacing`: (bubbleD, vgap, hgap, numCell). numCell>0 → DIM şaquli sütunlar. */
export function resolveMcqSpacing(
  phMm: number,
  cols: number,
  qCount: number,
  gtMm: number,
  cfg: SheetConfig,
  pwMm = 210.0,
  leftMm?: number,
): [number, number, number, number] {
  const left = leftMm ?? contentLeftMm();
  const auto = cfg.mcq_auto_fit !== false;
  const options = Math.max(2, Math.min(5, cfg.options_per_question));
  const availW = Math.max(10.0, pwMm - left - L.margin);

  if (mcqOptionsHorizontal(cfg)) {
    let bd: number;
    let vg: number;
    if (auto) {
      [bd, vg] = solveMcqSpacingSinglePage(phMm, cols, qCount, gtMm);
    } else {
      bd = Math.max(2.8, Math.min(8.5, cfg.mcq_bubble_d_mm));
      vg = Math.max(3.0, Math.min(14.0, cfg.mcq_vgap_mm));
    }
    let hg = horizontalOptionPitchMm(cfg, bd);
    const colW = availW / Math.max(1, cols);
    hg = fitHorizontalRowPitch(colW, options, bd, hg);
    return [bd, vg, hg, 0];
  }

  const hg = mcqTowerStripGapMm(cfg);
  if (auto) {
    const [bd, vg, nc] = solveMcqTowerSpacingSinglePage(phMm, availW, qCount, options, gtMm, cfg);
    return [bd, vg, hg, nc];
  }
  const bd = Math.max(2.8, Math.min(8.5, cfg.mcq_bubble_d_mm));
  const vgRaw = Math.max(3.0, Math.min(14.0, cfg.mcq_vgap_mm));
  const clear = cfg.mcq_tower_opt_min_clear_mm ?? L.mcq_tower_opt_min_clear_mm;
  const vg = Math.max(bd + clear, vgRaw);
  return [bd, vg, hg, towerNumCellMm(bd, cfg)];
}

export type McqColumnBlock = {
  qs: number[];
  col_x: number;
  col_w: number;
  fbx: number;
  fby: number;
  _bd?: number;
  _vg?: number;
  _hg?: number;
};

export type McqTowerRowBlock = {
  layout: "mcq_tower_row";
  row_y0_mm: number;
  row_left_mm: number;
  strip_pitch_mm: number;
  num_cell_mm: number;
  /** Üfüqi nömrə qutusu eni (mm); zolaq eni strip_pitch_mm */
  num_label_w_mm: number;
  qs: number[];
  bd: number;
  opt_vgap: number;
  options: number;
  pad_below_num: number;
  first_bx_mm: number;
  first_by_mm: number;
};

export type McqSectionTitleBlock = {
  layout: "mcq_section_title";
  title: string;
  y_mm: number;
  left_mm: number;
  width_mm: number;
  section_index: number;
};

export type McqBlock = McqColumnBlock | McqTowerRowBlock | McqSectionTitleBlock;

export function isTowerRowBlock(b: McqBlock): b is McqTowerRowBlock {
  return (b as McqTowerRowBlock).layout === "mcq_tower_row";
}

export function isSectionTitleBlock(b: McqBlock): b is McqSectionTitleBlock {
  return (b as McqSectionTitleBlock).layout === "mcq_section_title";
}

export function isColumnBlock(b: McqBlock): b is McqColumnBlock {
  return !isTowerRowBlock(b) && !isSectionTitleBlock(b);
}

export const MCQ_SECTION_TITLE_H_MM = 6.2;
export const MCQ_SECTION_GAP_MM = 3.5;

export function resolveMcqSections(cfg: SheetConfig): McqSection[] {
  if (cfg.mcq_sections?.length) return cfg.mcq_sections;
  const q = Math.max(1, cfg.question_count);
  return [{ title: "", from_q: 1, to_q: q, columns_count: cfg.columns_count }];
}

/** Çoxbölməli və ya başlıqlı fənn blokları — PDF/OMR/audit ilə eyni qayda. */
export function mcqSectionsUseStacked(cfg: SheetConfig): boolean {
  const secs = resolveMcqSections(cfg);
  return secs.length > 1 || secs.some((s) => String(s.title ?? "").trim().length > 0);
}

/** Fənn başlıqları olduqda ümumi CAVABLAR zolağını gizlət (təkrar başlıq olmasın). */
export function shouldShowMcqGridLabel(cfg: SheetConfig): boolean {
  if (!mcqSectionsUseStacked(cfg)) return true;
  return !resolveMcqSections(cfg).some((s) => String(s.title ?? "").trim().length > 0);
}

function sectionAnchorMm(
  sec: McqSection,
  sectionIndex: number,
  gtAnchor: number,
  leftAnchor: number,
  stackTopMm: number,
): { topMm: number; leftMm: number } {
  const topRaw = sec.top_mm;
  const leftRaw = sec.left_mm;
  const topMm =
    topRaw != null && Number.isFinite(topRaw)
      ? topRaw
      : sectionIndex === 0
        ? gtAnchor
        : stackTopMm;
  const leftMm = leftRaw != null && Number.isFinite(leftRaw) ? leftRaw : leftAnchor;
  return { topMm, leftMm };
}

function sectionBottomTowerMm(blocks: McqTowerRowBlock[], optN: number): number {
  let bottom = 0;
  for (const blk of blocks) {
    const rowH = blk.num_cell_mm + blk.pad_below_num + (optN - 1) * blk.opt_vgap + blk.bd;
    bottom = Math.max(bottom, blk.row_y0_mm + rowH);
  }
  return bottom;
}

function mcqBlocksHorizontalSpanMm(blocks: McqBlock[], leftAnchor: number): number {
  let right = leftAnchor;
  for (const b of blocks) {
    if (isTowerRowBlock(b)) {
      const bandW = b.qs.length * b.strip_pitch_mm;
      right = Math.max(right, b.row_left_mm + bandW);
    } else if (isColumnBlock(b) && b.qs.length) {
      right = Math.max(right, b.col_x + b.col_w);
    }
  }
  return Math.max(0, right - leftAnchor);
}

function mcqSectionTitleWidthMm(
  title: string,
  sectionBlocks: McqBlock[],
  leftAnchor: number,
  pwMm: number,
): number {
  const span = mcqBlocksHorizontalSpanMm(sectionBlocks, leftAnchor);
  const textW = Math.max(18, 4 + title.trim().length * 1.65);
  const pageW = Math.max(40, pwMm - leftAnchor - L.margin);
  return Math.min(pageW, Math.max(18, textW, span + 2));
}

/** Cavab şəbəkəsi sürüklənən başlığının eni — sual sütunlarının faktiki span-ı, tam səhifə yox */
export function mcqGridHandleWidthMm(
  label: string,
  region: McqRegionBounds,
  pwMm: number,
): number {
  const dataBlocks = region.blocks.filter((b) => !isSectionTitleBlock(b));
  const left = region.leftMm;
  const span = dataBlocks.length ? mcqBlocksHorizontalSpanMm(dataBlocks, left) : region.widthMm;
  const textW = Math.max(18, 4 + String(label || "CAVABLAR").trim().length * 1.65);
  const pageW = Math.max(40, pwMm - left - L.margin);
  return Math.min(pageW, Math.max(18, textW, span + 2, Math.min(region.widthMm + 1.5, pageW)));
}

function computeStackedMcqBlocks(
  cfg: SheetConfig,
  pwMm: number,
  phMm: number,
  gtAnchor: number,
  leftAnchor: number,
): { blocks: McqBlock[]; gt: number; gb: number; bd: number; vg: number; hg: number; nc: number } {
  const sections = resolveMcqSections(cfg);
  const optN = cfg.options_per_question;
  const defaultCols = cfg.columns_count;
  const gb = phMm - L.margin - L.footer_h;
  const all: McqBlock[] = [];
  let gtCursor = gtAnchor;
  let bd = 6;
  let vg = 8;
  let hg = 7.5;
  let nc = 0;

  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    const fq = sec.from_q;
    const tq = sec.to_q;
    const n = Math.max(0, tq - fq + 1);
    if (n <= 0) continue;
    const cols = sec.columns_count ?? defaultCols;
    const title = String(sec.title ?? "").trim();
    const { topMm: secTop, leftMm: secLeft } = sectionAnchorMm(sec, si, gtAnchor, leftAnchor, gtCursor);
    let blockGt = secTop;

    if (title) {
      const titleH = MCQ_SECTION_TITLE_H_MM + L.grid_top_pad * 0.35;
      blockGt = secTop + titleH;
    }

    const [bdSec, vgSec, hgSec, ncSec] = resolveMcqSpacing(phMm, cols, n, blockGt, cfg, pwMm, secLeft);
    bd = bdSec;
    vg = vgSec;
    hg = hgSec;
    nc = ncSec;

    let sectionBlocks: McqBlock[] = [];
    if (ncSec > 0) {
      const { blocks } = computeMcquestionTowerRows(
        pwMm, phMm, n, blockGt, secLeft, bdSec, vgSec, hgSec, ncSec, optN, cfg,
      );
      sectionBlocks = blocks.map((b) => ({ ...b, qs: b.qs.map((q) => fq + q - 1) }));
    } else {
      const { blocks } = computeMcquestionBlocksWithGt(
        pwMm, phMm, cols, n, blockGt, secLeft, bdSec, vgSec, hgSec,
      );
      sectionBlocks = blocks.map((b) => ({ ...b, qs: b.qs.map((q) => fq + q - 1) }));
    }

    if (title) {
      all.push({
        layout: "mcq_section_title",
        title,
        y_mm: secTop,
        left_mm: secLeft,
        width_mm: mcqSectionTitleWidthMm(title, sectionBlocks, secLeft, pwMm),
        section_index: si,
      });
    }

    all.push(...sectionBlocks);

    if (ncSec > 0) {
      const secBottom = sectionBottomTowerMm(sectionBlocks.filter(isTowerRowBlock), optN);
      if (secBottom > gtCursor) gtCursor = secBottom + MCQ_SECTION_GAP_MM;
    } else {
      let secBottom = blockGt;
      for (const b of sectionBlocks) {
        if (!isColumnBlock(b)) continue;
        const per = b.qs.length;
        secBottom = Math.max(secBottom, b.fby + (per - 1) * vgSec + bdSec / 2);
      }
      gtCursor = secBottom + MCQ_SECTION_GAP_MM;
    }
  }

  return { blocks: all, gt: gtAnchor, gb, bd, vg, hg, nc };
}

export function buildMcqSectionsFromGrading(
  grading: Record<string, unknown> | undefined | null,
  defaultCols: SheetConfig["columns_count"],
): McqSection[] | undefined {
  if (!grading) return undefined;
  const blocks = grading.question_blocks;
  const subjects = grading.subjects;
  if (!Array.isArray(blocks) || !blocks.length) return undefined;
  const names = new Map<string, string>();
  if (Array.isArray(subjects)) {
    for (const s of subjects) {
      if (s && typeof s === "object") {
        const r = s as Record<string, unknown>;
        const code = String(r.code ?? "").trim();
        if (code) names.set(code, String(r.name ?? code).trim() || code);
      }
    }
  }
  const out: McqSection[] = [];
  for (const row of blocks) {
    if (!row || typeof row !== "object") continue;
    const b = row as Record<string, unknown>;
    const fq = Number(b.from_q);
    const tq = Number(b.to_q);
    if (!Number.isFinite(fq) || !Number.isFinite(tq) || fq < 1 || tq < fq) continue;
    const sc = String(b.subject_code ?? "").trim();
    const title = sc ? names.get(sc) ?? sc : `Sual ${fq}–${tq}`;
    const sec: McqSection = { title, from_q: fq, to_q: tq };
    const cc = Number(b.columns_count);
    if (Number.isFinite(cc) && cc >= 1) sec.columns_count = Math.min(6, cc) as SheetConfig["columns_count"];
    else sec.columns_count = defaultCols;
    out.push(sec);
  }
  return out.length ? out : undefined;
}

export function computeMcquestionBlocksWithGt(
  pwMm: number,
  phMm: number,
  cols: number,
  qCount: number,
  gtMm: number,
  leftMm: number,
  bubbleD: number,
  vgap: number,
  hgap: number,
): { blocks: McqColumnBlock[]; gt: number; gb: number } {
  let left = leftMm;
  let availW = pwMm - left - L.margin;
  if (availW <= 10) {
    availW = Math.max(10, pwMm - 2 * L.margin);
    left = L.margin;
  }
  const colW = availW / cols;
  const perCol = Math.ceil(qCount / cols);
  const gb = phMm - L.margin - L.footer_h;
  const firstBy = gtMm + L.grid_top_pad + bubbleD / 2.0;
  const blocks: McqColumnBlock[] = [];
  for (let ci = 0; ci < cols; ci++) {
    const qFrom = ci * perCol + 1;
    const qTo = Math.min(qFrom + perCol - 1, qCount);
    if (qFrom > qCount) break;
    const colLeft = left + ci * colW;
    const firstBx = colLeft + L.q_num_w + bubbleD / 2.0;
    blocks.push({
      qs: Array.from({ length: qTo - qFrom + 1 }, (_, i) => qFrom + i),
      col_x: colLeft,
      col_w: colW,
      fbx: firstBx,
      fby: firstBy,
      _bd: bubbleD,
      _vg: vgap,
      _hg: hgap,
    });
  }
  return { blocks, gt: gtMm, gb };
}

export type McqRegionBounds = {
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  gtMm: number;
  gbMm: number;
  bubbleDMm: number;
  vgapMm: number;
  hgapMm: number;
  qNumWMm: number;
  gridTopPadMm: number;
  optionsPerQuestion: number;
  blocks: McqBlock[];
  /** DIM tipli şaquli variant / köhnə sütun */
  mcqLayout: "towers" | "columns";
};

function boundsFromTowerRows(
  blocks: McqTowerRowBlock[],
  gt: number,
  gb: number,
  bd: number,
  vg: number,
  hg: number,
  optN: number,
  leftAnchor: number,
  gtAnchor: number,
): McqRegionBounds {
  let minX = Infinity;
  let maxX = 0;
  let minY = Infinity;
  let maxY = 0;
  for (const b of blocks) {
    const rowH = b.num_cell_mm + b.pad_below_num + (optN - 1) * b.opt_vgap + b.bd;
    const w = b.qs.length * b.strip_pitch_mm;
    minX = Math.min(minX, b.row_left_mm);
    maxX = Math.max(maxX, b.row_left_mm + w);
    minY = Math.min(minY, b.row_y0_mm);
    maxY = Math.max(maxY, b.row_y0_mm + rowH);
  }
  if (!blocks.length) {
    return {
      leftMm: leftAnchor,
      topMm: gtAnchor,
      widthMm: 40,
      heightMm: 40,
      gtMm: gtAnchor,
      gbMm: gb,
      bubbleDMm: bd,
      vgapMm: vg,
      hgapMm: hg,
      qNumWMm: L.q_num_w,
      gridTopPadMm: L.grid_top_pad,
      optionsPerQuestion: optN,
      blocks: [],
      mcqLayout: "towers",
    };
  }
  return {
    leftMm: minX,
    topMm: minY,
    widthMm: maxX - minX,
    heightMm: maxY - minY,
    gtMm: gt,
    gbMm: gb,
    bubbleDMm: bd,
    vgapMm: vg,
    hgapMm: hg,
    qNumWMm: L.q_num_w,
    gridTopPadMm: L.grid_top_pad,
    optionsPerQuestion: optN,
    blocks,
    mcqLayout: "towers",
  };
}

export function computeMcqRegionForFreeform(
  cfg: SheetConfig,
  fields: LayoutField[],
  mcqTopMm: number,
  mcqLeftMm: number,
): McqRegionBounds {
  const { w: pwMm, h: phMm } = paperDimensionsMm(cfg.paper_size);
  const qCount = Math.max(1, cfg.question_count);
  const gtAnchor = resolveMcqGridTopAnchorMm(mcqTopMm, fields, cfg);
  const leftAnchor = Number.isFinite(mcqLeftMm) ? mcqLeftMm : contentLeftMm();
  const optN = cfg.options_per_question;

  const secs = resolveMcqSections(cfg);
  const useStacked = mcqSectionsUseStacked(cfg);

  if (useStacked) {
    const { blocks, gt, gb, bd, vg, hg, nc } = computeStackedMcqBlocks(
      cfg, pwMm, phMm, gtAnchor, leftAnchor,
    );
    if (nc > 0) {
      const region = boundsFromTowerRows(
        blocks.filter(isTowerRowBlock),
        gt,
        gb,
        bd,
        vg,
        hg,
        optN,
        leftAnchor,
        gtAnchor,
      );
      return { ...region, blocks };
    }
    let minX = Infinity;
    let maxX = 0;
    let minY = Infinity;
    let maxY = 0;
    for (const b of blocks) {
      if (isSectionTitleBlock(b)) {
        minX = Math.min(minX, b.left_mm);
        maxX = Math.max(maxX, b.left_mm + b.width_mm);
        minY = Math.min(minY, b.y_mm);
        maxY = Math.max(maxY, b.y_mm + MCQ_SECTION_TITLE_H_MM);
        continue;
      }
      if (!isColumnBlock(b)) continue;
      minX = Math.min(minX, b.col_x);
      const rowRight = b.fbx + (optN - 1) * hg + bd / 2 + 2;
      maxX = Math.max(maxX, rowRight, b.col_x + b.col_w);
      const n = b.qs.length;
      minY = Math.min(minY, b.fby - bd / 2);
      maxY = Math.max(maxY, b.fby + (n - 1) * vg + bd / 2);
    }
    return {
      leftMm: Number.isFinite(minX) ? minX : leftAnchor,
      topMm: Number.isFinite(minY) ? minY : gtAnchor,
      widthMm: Math.max(40, maxX - minX),
      heightMm: Math.max(20, maxY - minY),
      gtMm: gt,
      gbMm: gb,
      bubbleDMm: bd,
      vgapMm: vg,
      hgapMm: hg,
      qNumWMm: L.q_num_w,
      gridTopPadMm: L.grid_top_pad,
      optionsPerQuestion: optN,
      blocks,
      mcqLayout: "columns",
    };
  }

  const cols = cfg.columns_count;
  const [bd, vg, hg, nc] = resolveMcqSpacing(phMm, cols, qCount, gtAnchor, cfg, pwMm, leftAnchor);

  if (nc > 0) {
    const { blocks, gt, gb } = computeMcquestionTowerRows(
      pwMm,
      phMm,
      qCount,
      gtAnchor,
      leftAnchor,
      bd,
      vg,
      hg,
      nc,
      optN,
      cfg,
    );
    return boundsFromTowerRows(blocks, gt, gb, bd, vg, hg, optN, leftAnchor, gtAnchor);
  }

  const { blocks, gt, gb } = computeMcquestionBlocksWithGt(
    pwMm,
    phMm,
    cols,
    qCount,
    gtAnchor,
    leftAnchor,
    bd,
    vg,
    hg,
  );

  let minX = Infinity;
  let maxX = 0;
  let minY = Infinity;
  let maxY = 0;
  for (const b of blocks) {
    minX = Math.min(minX, b.col_x);
    const rowRight = b.fbx + (optN - 1) * hg + bd / 2 + 2;
    maxX = Math.max(maxX, rowRight, b.col_x + b.col_w);
    const n = b.qs.length;
    minY = Math.min(minY, b.fby - bd / 2);
    maxY = Math.max(maxY, b.fby + (n - 1) * vg + bd / 2);
  }
  if (!blocks.length) {
    return {
      leftMm: leftAnchor,
      topMm: gtAnchor,
      widthMm: 40,
      heightMm: 40,
      gtMm: gtAnchor,
      gbMm: gb,
      bubbleDMm: bd,
      vgapMm: vg,
      hgapMm: hg,
      qNumWMm: L.q_num_w,
      gridTopPadMm: L.grid_top_pad,
      optionsPerQuestion: optN,
      blocks: [],
      mcqLayout: "columns",
    };
  }

  return {
    leftMm: minX,
    topMm: minY,
    widthMm: maxX - minX,
    heightMm: maxY - minY,
    gtMm: gt,
    gbMm: gb,
    bubbleDMm: bd,
    vgapMm: vg,
    hgapMm: hg,
    qNumWMm: L.q_num_w,
    gridTopPadMm: L.grid_top_pad,
    optionsPerQuestion: optN,
    blocks,
    mcqLayout: "columns",
  };
}

function gridBottomFromBlocks(
  blocks: McqBlock[],
  gtAnchor: number,
  options: number,
  bd: number,
  vg: number,
  padBelowNum: number,
): number {
  let bottom = gtAnchor;
  for (const blk of blocks) {
    if (isTowerRowBlock(blk)) {
      const rowH = blk.num_cell_mm + padBelowNum + (options - 1) * blk.opt_vgap + blk.bd;
      bottom = Math.max(bottom, blk.row_y0_mm + rowH);
    } else if (isColumnBlock(blk)) {
      const per = blk.qs.length;
      if (per <= 0) continue;
      const lastC = blk.fby + (per - 1) * vg;
      bottom = Math.max(bottom, lastC + bd / 2.0);
    }
  }
  return bottom;
}

/** Backend `mcq_content_bottom_mm` — MCQ şəbəkəsinin ən aşağı kənarı (mm). */
export function mcqContentBottomMm(
  cfg: SheetConfig,
  fields: LayoutField[],
  pwMm: number,
  phMm: number,
  forceSingleSheetGrid = false,
  mcqTopMm = 0,
  mcqLeftMm?: number,
): number | null {
  const qCount = Math.max(1, cfg.question_count);
  const options = Math.max(2, Math.min(5, cfg.options_per_question));
  const cols = Math.max(1, Math.min(6, cfg.columns_count));
  const leftFit = mcqLeftMm ?? contentLeftMm();
  const idH = estimateFreeformIdentityHeightMm(
    fields,
    cfg,
    0,
    mcqTopMm > 0 ? mcqTopMm : undefined,
  );
  const twoPage = forceSingleSheetGrid
    ? false
    : answerSheetTwoPageRequired(cfg, fields, leftFit, mcqTopMm);

  const runGrid = (gtAnchor: number, leftAnchor: number): number => {
    const [bd, vg, hg, nc] = resolveMcqSpacing(phMm, cols, qCount, gtAnchor, cfg, pwMm, leftAnchor);
    const padBelowNum = cfg.mcq_num_to_bubbles_pad_mm ?? 0.48;
    let blocks: McqBlock[];
    if (nc > 0) {
      ({ blocks } = computeMcquestionTowerRows(
        pwMm, phMm, qCount, gtAnchor, leftAnchor, bd, vg, hg, nc, options, cfg,
      ));
    } else {
      ({ blocks } = computeMcquestionBlocksWithGt(
        pwMm, phMm, cols, qCount, gtAnchor, leftAnchor, bd, vg, hg,
      ));
    }
    return gridBottomFromBlocks(blocks, gtAnchor, options, bd, vg, padBelowNum);
  };

  if (twoPage) {
    const gtP2 = identityZoneTopMm() + L.sep_v;
    return runGrid(gtP2, contentLeftMm());
  }

  const gtAnchor = resolveMcqGridTopAnchorMm(mcqTopMm, fields, cfg);
  return runGrid(gtAnchor, leftFit);
}

/** Backend `answer_sheet_two_page_required` — PDF/audit ilə eyni qayda. */
export function answerSheetTwoPageRequired(
  cfg: SheetConfig,
  fields: LayoutField[],
  mcqLeftMm?: number,
  mcqTopMm = 0,
): boolean {
  const { w: pwMm, h: phMm } = paperDimensionsMm(cfg.paper_size);
  const cols = Math.max(1, Math.min(6, cfg.columns_count));
  const qCount = Math.max(1, cfg.question_count);
  const left = mcqLeftMm ?? contentLeftMm();
  const zoneTop = identityZoneTopMm();
  const idH = Math.max(14, identityFieldsBottomMm(fields, cfg) - zoneTop);
  const fit1 = maxQuestionsFitBelowIdentity(phMm, cols, idH, cfg, pwMm, left);
  if (fit1 < qCount) return true;
  const bottomSafe =
    phMm - L.margin - L.footer_h - MIN_GRID_ABOVE_FOOTER_MM - SAFE_CONTENT_INSET_MM;
  const bb = mcqContentBottomMm(cfg, fields, pwMm, phMm, true, mcqTopMm, left);
  return bb !== null && bb > bottomSafe + 0.12;
}

export function shouldUseTwoPages(
  cfg: SheetConfig,
  fields: LayoutField[],
  mcqLeftMm?: number,
  mcqTopMm = 0,
): boolean {
  return answerSheetTwoPageRequired(cfg, fields, mcqLeftMm, mcqTopMm);
}

/** PDF 2-ci səhifə: yalnız başlıq + sual şəbəkəsi (şəxsiyyət yoxdur). */
export function computeMcqRegionSecondPage(cfg: SheetConfig): McqRegionBounds {
  const { w: pwMm, h: phMm } = paperDimensionsMm(cfg.paper_size);
  const gtAnchor = identityZoneTopMm() + L.sep_v;
  const leftAnchor = contentLeftMm();
  const optN = cfg.options_per_question;

  if (mcqSectionsUseStacked(cfg)) {
    const { blocks, gt, gb, bd, vg, hg, nc } = computeStackedMcqBlocks(
      cfg, pwMm, phMm, gtAnchor, leftAnchor,
    );
    if (nc > 0) {
      const region = boundsFromTowerRows(
        blocks.filter(isTowerRowBlock),
        gt,
        gb,
        bd,
        vg,
        hg,
        optN,
        leftAnchor,
        gtAnchor,
      );
      return { ...region, blocks };
    }
    let minX = Infinity;
    let maxX = 0;
    let minY = Infinity;
    let maxY = 0;
    for (const b of blocks) {
      if (isSectionTitleBlock(b)) {
        minX = Math.min(minX, b.left_mm);
        maxX = Math.max(maxX, b.left_mm + b.width_mm);
        minY = Math.min(minY, b.y_mm);
        maxY = Math.max(maxY, b.y_mm + MCQ_SECTION_TITLE_H_MM);
        continue;
      }
      if (!isColumnBlock(b)) continue;
      minX = Math.min(minX, b.col_x);
      const rowRight = b.fbx + (optN - 1) * hg + bd / 2 + 2;
      maxX = Math.max(maxX, rowRight, b.col_x + b.col_w);
      const n = b.qs.length;
      minY = Math.min(minY, b.fby - bd / 2);
      maxY = Math.max(maxY, b.fby + (n - 1) * vg + bd / 2);
    }
    return {
      leftMm: Number.isFinite(minX) ? minX : leftAnchor,
      topMm: Number.isFinite(minY) ? minY : gtAnchor,
      widthMm: Math.max(40, maxX - minX),
      heightMm: Math.max(20, maxY - minY),
      gtMm: gt,
      gbMm: gb,
      bubbleDMm: bd,
      vgapMm: vg,
      hgapMm: hg,
      qNumWMm: L.q_num_w,
      gridTopPadMm: L.grid_top_pad,
      optionsPerQuestion: optN,
      blocks,
      mcqLayout: "columns",
    };
  }

  const cols = cfg.columns_count;
  const qCount = Math.max(1, cfg.question_count);
  const [bd, vg, hg, nc] = resolveMcqSpacing(phMm, cols, qCount, gtAnchor, cfg, pwMm, leftAnchor);

  if (nc > 0) {
    const { blocks, gt, gb } = computeMcquestionTowerRows(
      pwMm,
      phMm,
      qCount,
      gtAnchor,
      leftAnchor,
      bd,
      vg,
      hg,
      nc,
      optN,
      cfg,
    );
    return boundsFromTowerRows(blocks, gt, gb, bd, vg, hg, optN, leftAnchor, gtAnchor);
  }

  const { blocks, gt, gb } = computeMcquestionBlocksWithGt(
    pwMm,
    phMm,
    cols,
    qCount,
    gtAnchor,
    leftAnchor,
    bd,
    vg,
    hg,
  );
  let minX = Infinity;
  let maxX = 0;
  let minY = Infinity;
  let maxY = 0;
  for (const b of blocks) {
    minX = Math.min(minX, b.col_x);
    const rowRight = b.fbx + (optN - 1) * hg + bd / 2 + 2;
    maxX = Math.max(maxX, rowRight, b.col_x + b.col_w);
    const n = b.qs.length;
    minY = Math.min(minY, b.fby - bd / 2);
    maxY = Math.max(maxY, b.fby + (n - 1) * vg + bd / 2);
  }
  if (!blocks.length) {
    return {
      leftMm: leftAnchor,
      topMm: gtAnchor,
      widthMm: 40,
      heightMm: 40,
      gtMm: gtAnchor,
      gbMm: gb,
      bubbleDMm: bd,
      vgapMm: vg,
      hgapMm: hg,
      qNumWMm: L.q_num_w,
      gridTopPadMm: L.grid_top_pad,
      optionsPerQuestion: optN,
      blocks: [],
      mcqLayout: "columns",
    };
  }
  return {
    leftMm: minX,
    topMm: minY,
    widthMm: maxX - minX,
    heightMm: maxY - minY,
    gtMm: gt,
    gbMm: gb,
    bubbleDMm: bd,
    vgapMm: vg,
    hgapMm: hg,
    qNumWMm: L.q_num_w,
    gridTopPadMm: L.grid_top_pad,
    optionsPerQuestion: optN,
    blocks,
    mcqLayout: "columns",
  };
}
