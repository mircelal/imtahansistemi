import type { OpenBlock } from "./hooks/useSheetConfig";

/** Backend open_question_layout.py ilə sinxron ölçülər */
const GRID_IN_BUBBLE_D_MM = 4.0;
const GRID_IN_VGAP_MM = 4.15;
const GRID_IN_COL_GAP_MM = 1.8;
const GRID_IN_HANDWRITE_H_MM = 5.5;
const GRID_IN_LABEL_H_MM = 4.5;
const GRID_IN_PAD_MM = 1.5;

const AZ_DIGITS_LETTERS =
  "0123456789ABCÇDEƏFGĞHXIİJKQLMNOPÖRSŞTUÜVYZ";

export function openBlockDragId(block: OpenBlock, index: number): string {
  return `open-block-${index}-p${block.panel ?? 1}-q${block.question_number}`;
}

export function parseOpenBlockDragIndex(id: string): number | null {
  const m = /^open-block-(\d+)-/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function gridInBubbleValues(alphabet?: string): string[] {
  if (alphabet === "digits_letters_az") return [...AZ_DIGITS_LETTERS];
  return [..."0123456789"];
}

export function openBlockSizeMm(block: OpenBlock): { w: number; h: number } {
  if (block.kind === "essay") {
    return {
      w: Math.max(20, Number(block.box_w_mm) || 55),
      h: Math.max(15, Number(block.box_h_mm) || 45),
    };
  }
  const nCols = Math.max(1, Math.min(12, Number(block.answer_length) || 3));
  const values = gridInBubbleValues(block.alphabet);
  const pitch = GRID_IN_BUBBLE_D_MM + GRID_IN_COL_GAP_MM;
  const w = GRID_IN_PAD_MM * 2 + nCols * pitch + 2.0;
  const hBubbles = (values.length - 1) * GRID_IN_VGAP_MM + GRID_IN_BUBBLE_D_MM;
  const h =
    GRID_IN_LABEL_H_MM + GRID_IN_HANDWRITE_H_MM + 1.0 + hBubbles + GRID_IN_PAD_MM;
  return { w, h };
}

export { GRID_IN_BUBBLE_D_MM, GRID_IN_VGAP_MM, GRID_IN_COL_GAP_MM, GRID_IN_HANDWRITE_H_MM, GRID_IN_LABEL_H_MM, GRID_IN_PAD_MM };
