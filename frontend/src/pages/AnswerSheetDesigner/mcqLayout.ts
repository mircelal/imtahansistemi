/**
 * MCQ şəbəkəsi ölçüləri — backend dim_sheet_layout.py ilə eyni məntiq.
 */
import type { SheetConfig } from "./hooks/useSheetConfig";
import type { LayoutField } from "./layoutBlockModel";
import { estimateFreeformIdentityHeightMm } from "./layoutBlockModel";

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
  mcq_tower_opt_min_clear_mm: 1.0,
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
  return L.margin + TIMING;
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

function clampMcqHgapMm(h: number): number {
  return Math.max(3.2, Math.min(12.0, h));
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
    const hgH = cfg.mcq_hgap_mm ?? L.hgap;
    const hg = clampMcqHgapMm(Number.isFinite(hgH) ? hgH : L.hgap);
    if (auto) {
      const [bd, vg] = solveMcqSpacingSinglePage(phMm, cols, qCount, gtMm);
      return [bd, vg, hg, 0];
    }
    const bd = Math.max(2.8, Math.min(8.5, cfg.mcq_bubble_d_mm));
    const vg = Math.max(3.0, Math.min(14.0, cfg.mcq_vgap_mm));
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

export type McqBlock = McqColumnBlock | McqTowerRowBlock;

export function isTowerRowBlock(b: McqBlock): b is McqTowerRowBlock {
  return (b as McqTowerRowBlock).layout === "mcq_tower_row";
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
  _hgap: number,
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
  const cols = cfg.columns_count;
  const qCount = Math.max(1, cfg.question_count);
  const idH = estimateFreeformIdentityHeightMm(fields, cfg, 0, mcqTopMm);
  const defaultGt = identityZoneTopMm() + idH + L.sep_v;
  const gtAnchor =
    !Number.isFinite(mcqTopMm) || mcqTopMm <= 0 ? defaultGt : Math.max(defaultGt, mcqTopMm);
  const leftAnchor = Number.isFinite(mcqLeftMm) ? mcqLeftMm : contentLeftMm();
  const [bd, vg, hg, nc] = resolveMcqSpacing(phMm, cols, qCount, gtAnchor, cfg, pwMm, leftAnchor);
  const optN = cfg.options_per_question;

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

export function shouldUseTwoPages(
  cfg: SheetConfig,
  fields: LayoutField[],
  mcqLeftMm?: number,
): boolean {
  if (cfg.single_page_layout !== false) return false;
  const { w: pwMm, h: phMm } = paperDimensionsMm(cfg.paper_size);
  const idH = estimateFreeformIdentityHeightMm(fields, cfg);
  const left = mcqLeftMm ?? contentLeftMm();
  const fit = maxQuestionsFitBelowIdentity(phMm, cfg.columns_count, idH, cfg, pwMm, left);
  return fit < cfg.question_count;
}

/** PDF 2-ci səhifə: yalnız başlıq + sual şəbəkəsi (şəxsiyyət yoxdur). */
export function computeMcqRegionSecondPage(cfg: SheetConfig): McqRegionBounds {
  const { w: pwMm, h: phMm } = paperDimensionsMm(cfg.paper_size);
  const cols = cfg.columns_count;
  const qCount = Math.max(1, cfg.question_count);
  const gtAnchor = identityZoneTopMm() + L.sep_v;
  const leftAnchor = contentLeftMm();
  const [bd, vg, hg, nc] = resolveMcqSpacing(phMm, cols, qCount, gtAnchor, cfg, pwMm, leftAnchor);
  const optN = cfg.options_per_question;

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
