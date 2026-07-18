import React from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { McqSection, SheetConfig } from "./hooks/useSheetConfig";
import type { LayoutField } from "./layoutBlockModel";
import {
  FIELD_HEADER_BAR_MM,
  HORIZONTAL_LETTERS_BOTTOM_TAIL_MM,
  HORIZONTAL_LETTERS_HANDWRITE_ROW_EXTRA_MM,
  HORIZONTAL_LETTERS_ROW_LABEL_LEFT_MM,
  HORIZONTAL_LETTERS_TOP_GAP_MM,
  MCQ_GRID_DRAG_ID,
  mcqSectionDragId,
  parseMcqSectionDragIndex,
  applyIdentityMcqBubbleSync,
  clampFieldPositionAvoidingOverlap,
  digitGroupRowChunks,
  estimateBlockHeightMm,
  estimateBlockWidthMm,
  minMcqGridTopAnchorMm,
  mcqSingleBlockWidthMm,
  verticalLettersHandwriteSquareSideMm,
  verticalLettersRowPitchMm,
  type McqGridPos,
  type McqMatchInfo,
} from "./layoutBlockModel";
import {
  type McqRegionBounds,
  type McqSectionTitleBlock,
  computeMcqRegionForFreeform,
  computeMcqRegionSecondPage,
  contentLeftMm,
  contentRightMaxMm,
  mcqGridHandleWidthMm,
  towerNumLabelBoxWidthMm,
  fiducialCornerCenterFromEdgeMm,
  fiducialOuterBottomFromPageTopMm,
  headerMagentaHorizontalInsetMm,
  headerMagentaTopFromPageTopMm,
  identityZoneTopMm,
  isSectionTitleBlock,
  isColumnBlock,
  isTowerRowBlock,
  MCQ_SECTION_TITLE_H_MM,
  mcqSectionsUseStacked,
  paperDimensionsMm,
  resolveMcqSections,
  shouldShowMcqGridLabel,
} from "./mcqLayout";
import {
  FACE_PANEL_MAP,
  PANEL_META,
  foldPanelRange,
  isA3DuplexFold,
  panelHasIdentity,
  panelViewConfig,
} from "./a3FoldLayout";
import type { OpenBlock } from "./hooks/useSheetConfig";
import {
  GRID_IN_BUBBLE_D_MM,
  GRID_IN_COL_GAP_MM,
  GRID_IN_HANDWRITE_H_MM,
  GRID_IN_LABEL_H_MM,
  GRID_IN_VGAP_MM,
  gridInBubbleValues,
  openBlockDragId,
  openBlockSizeMm,
  parseOpenBlockDragIndex,
} from "./openBlockGeometry";

const PX_MM = 2.65;
/** PDF `L_BASE["header_h"]` ilə sinxron (~30% alçaq) */
const SHEET_HEADER_MM = 9.8;
/** PDF `footer_h` — magentalı xətt + mətn sətiri */
const SHEET_FOOTER_LINE_MM = 9;
/** Aşağıda QR + fiducial üçün sürükləmə ehtiyatı (mm) */
const FOOTER_RESERVE_MM = 22;
const PAGE_MARGIN_MM = 12;
const TIMING_TRACK_MM = 7.0;
/** PDF fiducial — kənar inset (mm) */
const FIDUCIAL_INSET_MM = 0.7;
const FIDUCIAL_RO_MM = 3.0;

/** MCQ region-dan McqMatchInfo qurur (kanvas → estimasiya köprüsü). */
function mcqMatchInfoFromRegion(region: McqRegionBounds): McqMatchInfo {
  return { bdMcq: region.bubbleDMm, isTower: region.mcqLayout === "towers" };
}

type FieldDragHandleBinding = Pick<ReturnType<typeof useDraggable>, "listeners" | "attributes">;

/** PDF `AZ_LATIN` ilə eyni sıra */
const AZ_LATIN = "ABCÇDEƏFGĞHXIİJKQLMNOPÖRSŞTUÜVYZ";

/** Pink DİM rəngi */
const C_MAG = "#c0176a";
const C_MAG_LT = "#fde8f3";
const C_MAG_ST = "#9b1257";

function px(mm: number) {
  return mm * PX_MM;
}

/** Kanvas `scale()` tətbiq olunanda dnd-kit delta-sını mm-ə çevirir */
function dragDeltaToMm(deltaPx: number, scale: number): number {
  return deltaPx / PX_MM / Math.max(0.01, scale);
}

function dragTransformCss(transform: { x: number; y: number } | null, scale: number): string | undefined {
  if (!transform) return undefined;
  return `translate3d(${transform.x / scale}px, ${transform.y / scale}px, 0)`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** DİM-stilli balaca bubble — PDF `_draw_bubble` ilə vizual uyğun mərkəzləmə */
function Bubble({
  dMm,
  label,
  fsPx,
}: {
  dMm: number;
  label?: string;
  fsPx?: number;
}) {
  const s = px(dMm);
  const fs = fsPx ?? Math.max(4.5, s * 0.38);
  const nudgeY = s * 0.045;
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: s,
        height: s,
        fontSize: fs,
        background: C_MAG_LT,
        border: `0.4px solid ${C_MAG_ST}`,
        boxSizing: "border-box",
        lineHeight: 1,
      }}
    >
      {label ? (
        <span
          style={{
            color: C_MAG_ST,
            fontWeight: 600,
            lineHeight: 1,
            textAlign: "center",
            display: "block",
            transform: `translateY(${nudgeY}px)`,
            letterSpacing: label.length > 2 ? -0.03 * fs : 0,
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** DİM-stilli başlıq barı — ~20% incə şrift; sürükləmə tutacağı ola bilər */
function HeaderBar({
  label,
  widthPx,
  heightPx = px(5),
  compactTitle,
  dragHandle,
}: {
  label: string;
  widthPx: number;
  heightPx?: number;
  /** Uzun mətn (məs. ADINIZ) — kiçik şrift, mərkəz, kəsilməsin */
  compactTitle?: boolean;
  dragHandle?: FieldDragHandleBinding;
}) {
  const fs =
    (compactTitle
      ? Math.max(5.2, Math.min(heightPx * 0.34, (widthPx / Math.max(label.length * 0.52, 10)) * 1.05))
      : Math.max(6, heightPx * 0.4)) * 0.8;
  return (
    <div
      className={`touch-none flex w-full items-center justify-center overflow-hidden ${compactTitle ? "px-1.5 py-0.5" : "px-1"}`}
      style={{
        width: widthPx,
        minHeight: heightPx,
        background: C_MAG,
        borderRadius: "2px 2px 0 0",
        flexShrink: 0,
        cursor: dragHandle ? "grab" : undefined,
      }}
      {...(dragHandle?.attributes ?? {})}
      {...(dragHandle?.listeners ?? {})}
    >
      <span
        style={{
          color: "#fff",
          fontSize: fs,
          fontWeight: 600,
          letterSpacing: compactTitle ? 0.16 : 0.24,
          textTransform: "uppercase",
          whiteSpace: compactTitle ? "normal" : "nowrap",
          textAlign: "center",
          lineHeight: 1.12,
          overflow: compactTitle ? "visible" : "hidden",
          textOverflow: compactTitle ? "clip" : "ellipsis",
          maxWidth: compactTitle ? widthPx - 4 : undefined,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function BlockWysiwyg({ field, cfg, dragHandle }: { field: LayoutField; cfg: SheetConfig; dragHandle?: FieldDragHandleBinding }) {
  const dd = cfg.identity_digit_d_mm;
  const dvg = cfg.identity_digit_vgap_mm;
  const dcol = cfg.identity_digit_col_gap_mm;
  const ld = cfg.identity_letter_d_mm;
  const lhg = cfg.identity_letter_hgap_mm;
  const lvg = cfg.identity_letter_vgap_mm;

  /* ─── ŞAQULI HƏRF KODU (vertical_letters) ─── */
  if (field.kind === "vertical_letters") {
    const ncol = Number(field.columns ?? 8);
    const colPitch = Number(field.col_pitch_mm ?? Math.max(ld + 0.12, cfg.identity_letter_hgap_mm));
    const totalW = 2 + ncol * colPitch + 1;
    const barH = FIELD_HEADER_BAR_MM;
    const vlStep = verticalLettersRowPitchMm(ld, lvg, field);
    const sqTop = verticalLettersHandwriteSquareSideMm(ld, cfg.identity_letter_hgap_mm, field);

    return (
      <div style={{ width: px(totalW) }}>
        <HeaderBar
          label={String(field.label ?? "")}
          widthPx={px(totalW)}
          heightPx={px(barH)}
          compactTitle
          dragHandle={dragHandle}
        />
        <div
          className="flex"
          style={{
            paddingLeft: px(2),
            paddingTop: px(0.8),
            background: "white",
            border: `0.5px solid ${C_MAG_ST}33`,
            borderTop: "none",
          }}
        >
          {Array.from({ length: ncol }, (_, ci) => (
            <div
              key={ci}
              className="flex shrink-0 flex-col items-center"
              style={{
                width: px(colPitch),
                gap: px(Math.max(0.08, vlStep - ld)),
                background: ci % 2 === 0 ? "rgba(253, 232, 243, 0.95)" : "#ffffff",
                borderRight: ci < ncol - 1 ? `0.35px solid ${C_MAG_ST}20` : undefined,
                paddingTop: px(0.35),
                paddingBottom: px(0.35),
              }}
            >
              <div
                className="shrink-0 rounded-sm bg-white"
                style={{
                  width: px(sqTop),
                  height: px(sqTop),
                  border: `0.45px solid ${C_MAG_ST}`,
                  boxSizing: "border-box",
                }}
              />
              {AZ_LATIN.split("").map((ch) => (
                <div key={ch} className="flex justify-center">
                  <Bubble dMm={ld} label={ch} fsPx={px(ld) * 0.38} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─── RƏQƏM SÜTUNLARI (digits) ─── */
  if (field.kind === "digits") {
    const cnt = Number(field.count ?? 6);
    const pitch = dcol + dd;
    const colW = dd;
    const totalW = estimateBlockWidthMm(field, cfg);
    const barH = FIELD_HEADER_BAR_MM;
    const bubbleStep = Math.max(dd + 0.08, dvg);

    return (
      <div style={{ width: px(totalW) }}>
        <HeaderBar
          label={String(field.label ?? "")}
          widthPx={px(totalW)}
          heightPx={px(barH)}
          compactTitle
          dragHandle={dragHandle}
        />
        <div
          className="flex"
          style={{
            gap: px(dcol),
            paddingLeft: px(2),
            paddingRight: px(2),
            paddingTop: px(1.5),
            paddingBottom: px(1),
            background: "white",
            border: `0.5px solid ${C_MAG_ST}33`,
            borderTop: "none",
            boxSizing: "border-box",
          }}
        >
          {Array.from({ length: cnt }, (_, ci) => (
            <div
              key={ci}
              className="flex flex-col items-center"
              style={{
                width: px(colW),
                gap: px(Math.max(0, bubbleStep - dd)),
              }}
            >
              {Array.from({ length: 10 }, (_, di) => (
                <Bubble key={di} dMm={dd} label={String(di)} fsPx={px(dd) * 0.38} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─── SEÇİM QRUPLARI (mcq_groups) — hər qrup ayrı maqenta başlıq + mərkəzlənmiş balonlar ─── */
  if (field.kind === "mcq_groups") {
    const groups = (field.groups as Array<{ id?: string; label?: string; options?: string[] }> | undefined) ?? [];
    const wMm = estimateBlockWidthMm(field, cfg);
    const interGap = 3;
    let firstHdr = true;
    return (
      <div className="flex flex-nowrap items-end" style={{ width: px(wMm), gap: px(interGap) }}>
        {groups.map((g, gi) => {
          const opts = (g.options ?? ["A", "B"]).map(String);
          const bubbleGap = Math.max(0.08, lhg - ld);
          const pseudo: LayoutField = {
            ...field,
            kind: "mcq",
            label: String(g.label ?? ""),
            options: opts,
          };
          const groupW = mcqSingleBlockWidthMm(pseudo, cfg);
          const dh = firstHdr ? dragHandle : undefined;
          firstHdr = false;
          return (
            <div key={String(g.id ?? gi)} style={{ width: px(groupW), flexShrink: 0 }}>
              <HeaderBar
                label={String(g.label ?? "").replace(/:\s*$/, "") || "Seçim"}
                widthPx={px(groupW)}
                heightPx={px(FIELD_HEADER_BAR_MM)}
                compactTitle
                dragHandle={dh}
              />
              <div
                className="flex justify-center"
                style={{
                  gap: px(bubbleGap),
                  padding: `${px(1.2)} ${px(1.5)} ${px(1.5)}`,
                  background: "white",
                  border: `0.5px solid ${C_MAG_ST}33`,
                  borderTop: "none",
                  boxSizing: "border-box",
                }}
              >
                {opts.map((lab, j) => (
                  <Bubble key={j} dMm={ld} label={lab} fsPx={px(ld) * 0.38} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ─── ÜFÜQİ HƏRF KODU (horizontal_letters) ─── */
  if (field.kind === "horizontal_letters") {
    const nrows = Number(field.rows ?? 4);
    const hwMode = field.row_layout === "handwrite_coding";
    const hwW = Number(field.handwrite_w_mm ?? cfg.identity_handwrite_w_mm);
    const hwH = Number(field.handwrite_h_mm ?? cfg.identity_handwrite_h_mm);
    const hwG = Number(field.handwrite_gap_mm ?? cfg.identity_handwrite_gap_mm);
    const nLetters = Math.max(1, Math.min(AZ_LATIN.length, Number(field.letters_count ?? AZ_LATIN.length)));
    const labelLeft = HORIZONTAL_LETTERS_ROW_LABEL_LEFT_MM;
    const totalW = hwMode
      ? labelLeft + hwW + 2 + ((nLetters - 1) * lhg + ld) + 6
      : labelLeft + ((nLetters - 1) * lhg + ld) + 6;
    const rowPitch = hwMode ? hwH + hwG + ld + HORIZONTAL_LETTERS_HANDWRITE_ROW_EXTRA_MM : lvg;
    const bodyH = nrows * rowPitch + HORIZONTAL_LETTERS_BOTTOM_TAIL_MM;
    const barH = FIELD_HEADER_BAR_MM;

    return (
      <div style={{ width: px(totalW) }}>
        <HeaderBar label={String(field.label ?? "")} widthPx={px(totalW)} heightPx={px(barH)} dragHandle={dragHandle} />
        <div
          className="flex flex-col"
          style={{
            paddingLeft: px(1.5),
            paddingTop: px(HORIZONTAL_LETTERS_TOP_GAP_MM),
            paddingBottom: px(HORIZONTAL_LETTERS_BOTTOM_TAIL_MM),
            background: "white",
            border: `0.5px solid ${C_MAG_ST}33`,
            borderTop: "none",
            boxSizing: "border-box",
            minHeight: px(bodyH),
          }}
        >
          {Array.from({ length: nrows }, (_, ri) => (
            <div
              key={ri}
              className="flex items-center"
              style={{
                height: px(rowPitch),
                gap: px(1),
                background: ri % 2 === 0 ? "rgba(253,240,246,0.35)" : "#fff",
                borderBottom: ri < nrows - 1 ? `0.5px solid ${C_MAG_ST}20` : undefined,
                marginLeft: px(-1),
                marginRight: px(-1),
                paddingLeft: px(1),
                paddingRight: px(1),
                boxSizing: "border-box",
              }}
            >
              <span
                style={{
                  width: px(7),
                  fontSize: px(2.5),
                  fontFamily: "monospace",
                  color: "#94a3b8",
                  flexShrink: 0,
                }}
              >
                {String(ri + 1).padStart(2, "0")}
              </span>
              {hwMode && (
                <div
                  className="shrink-0"
                  style={{
                    width: px(hwW),
                    height: px(hwH),
                    border: `0.8px solid ${C_MAG_ST}`,
                    borderRadius: 2,
                    background: "#fffdf5",
                    marginRight: px(1),
                  }}
                />
              )}
              <div
                className="flex min-w-0 flex-1 items-center overflow-hidden"
                style={{ gap: px(Math.max(0.08, lhg - ld)) }}
              >
                {AZ_LATIN.slice(0, nLetters).split("").map((ch, li) => (
                  <Bubble key={li} dMm={ld} label={ch} fsPx={px(ld) * 0.38} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─── RƏQƏM QRUPLARI — AD/SOYAD üslubu: maqenta başlıq, (opsional) əl yazısı kvadratı, sonra 0–9 ─── */
  if (field.kind === "digit_groups") {
    const compact = Boolean(field.compact ?? cfg.identity_digit_compact);
    const groupTail = compact ? 3.5 : 10;
    const wMm = estimateBlockWidthMm(field, cfg);
    const pitch = dcol + dd;
    const dgHdr = FIELD_HEADER_BAR_MM;
    const topGap = 0.8;
    const showHw = Boolean(
      (field as unknown as { handwrite_box?: unknown }).handwrite_box
        ?? (cfg as unknown as { identity_digit_handwrite_box?: unknown }).identity_digit_handwrite_box,
    );
    const sqTop = showHw
      ? verticalLettersHandwriteSquareSideMm(dd, Math.max(dd + 0.12, pitch), undefined)
      : 0;
    const rows = digitGroupRowChunks(field);
    let firstHdr = true;
    return (
      <div style={{ width: px(wMm) }}>
        {rows.map((rowGroups, ri) => {
          const rowGapAfter = compact ? 4 : ri === 0 ? 5 : 6;
          return (
          <div
            key={ri}
            className="flex flex-wrap items-end"
            style={{
              gap: px(4),
              marginBottom: ri < rows.length - 1 ? px(rowGapAfter) : 0,
            }}
          >
            {rowGroups.map((g, gi) => {
              const cnt = Number(g.count ?? 1);
              const groupW = 2 + cnt * pitch + 1;
              const dh = firstHdr ? dragHandle : undefined;
              firstHdr = false;
              return (
                <div
                  key={String(g.id ?? g.label)}
                  className="flex flex-col items-start"
                  style={{
                    width: px(groupW),
                    marginRight: gi < rowGroups.length - 1 ? px(groupTail) : 0,
                  }}
                >
                  <HeaderBar
                    label={String(g.label ?? "").replace(/:\s*$/, "") || "Kod"}
                    widthPx={px(groupW)}
                    heightPx={px(dgHdr)}
                    compactTitle
                    dragHandle={dh}
                  />
                  <div
                    className="flex"
                    style={{
                      paddingLeft: px(2),
                      paddingTop: px(topGap),
                      width: px(groupW),
                      background: "white",
                      border: `0.5px solid ${C_MAG_ST}33`,
                      borderTop: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    {Array.from({ length: cnt }, (_, ci) => (
                      <div
                        key={ci}
                        className="flex shrink-0 flex-col items-center"
                        style={{
                          width: px(pitch),
                          gap: px(Math.max(0.12, dvg - dd)),
                          background: ci % 2 === 0 ? "rgba(253, 232, 243, 0.95)" : "#ffffff",
                          borderRight: ci < cnt - 1 ? `0.35px solid ${C_MAG_ST}20` : undefined,
                          paddingTop: px(0.35),
                          paddingBottom: px(0.35),
                        }}
                      >
                        {showHw ? (
                          <div
                            className="shrink-0 rounded-sm bg-white"
                            style={{
                              width: px(sqTop),
                              height: px(sqTop),
                              border: `0.45px solid ${C_MAG_ST}`,
                              boxSizing: "border-box",
                              marginBottom: px(0.5),
                            }}
                          />
                        ) : null}
                        {Array.from({ length: 10 }, (_, di) => (
                          <div key={di} className="flex justify-center">
                            <Bubble dMm={dd} label={String(di)} fsPx={px(dd) * 0.38} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );})}
      </div>
    );
  }

  /* ─── TƏK SEÇİM (mcq) ─── */
  if (field.kind === "mcq") {
    const opts = (field.options as string[] | undefined)?.map(String) ?? ["A", "B", "C", "D"];
    const bubbleGap = Math.max(0.08, lhg - ld);
    const wMm = mcqSingleBlockWidthMm(field, cfg);
    return (
      <div style={{ width: px(wMm) }}>
        <HeaderBar
          label={String(field.label ?? "Variant")}
          widthPx={px(wMm)}
          heightPx={px(FIELD_HEADER_BAR_MM)}
          compactTitle
          dragHandle={dragHandle}
        />
        <div
          className="flex justify-center"
          style={{
            padding: `${px(1.2)} ${px(1.5)} ${px(1.5)}`,
            background: "white",
            border: `0.5px solid ${C_MAG_ST}33`,
            borderTop: "none",
            boxSizing: "border-box",
          }}
        >
          <div className="flex items-center justify-center" style={{ gap: px(bubbleGap) }}>
            {opts.map((lab, j) => (
              <Bubble key={j} dMm={ld} label={lab} fsPx={px(ld) * 0.38} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ─── QEYD XANASI (note) ─── */
  if (field.kind === "note") {
    const lines = Math.max(1, Number(field.lines ?? 1));
    const wMm = estimateBlockWidthMm(field, cfg);
    return (
      <div style={{ width: px(wMm) }}>
        <HeaderBar
          label={String(field.label ?? "Qeyd")}
          widthPx={px(wMm)}
          heightPx={px(FIELD_HEADER_BAR_MM)}
          compactTitle
          dragHandle={dragHandle}
        />
        <div
          style={{
            minHeight: px(5 * lines),
            border: `1px dashed ${C_MAG_ST}60`,
            borderTop: "none",
            borderRadius: "0 0 3px 3px",
            padding: "6px 6px",
            background: "#fffdf5",
            fontSize: px(2.5),
            color: "#94a3b8",
          }}
        />
      </div>
    );
  }

  /* ─── BƏYANNAMƏ + İMZA ─── */
  if (field.kind === "declaration") {
    const wMm = estimateBlockWidthMm(field, cfg);
    const bodyH = Number(field.box_h_mm ?? 28);
    const text = String(field.text ?? "Mən bu cavab kartındakı məlumatların düzgünlüyünü təsdiq edirəm.");
    const sig = String(field.signature_label ?? "İmza");
    return (
      <div style={{ width: px(wMm) }}>
        <HeaderBar
          label={String(field.label ?? "Bəyannamə")}
          widthPx={px(wMm)}
          heightPx={px(FIELD_HEADER_BAR_MM)}
          compactTitle
          dragHandle={dragHandle}
        />
        <div
          style={{
            height: px(bodyH),
            border: `1px solid ${C_MAG_ST}80`,
            borderTop: "none",
            borderRadius: "0 0 3px 3px",
            padding: `${px(2)}px ${px(3)}px`,
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          <p style={{ margin: 0, fontSize: px(2.4), lineHeight: 1.35, color: "#334155" }}>{text}</p>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              gap: px(2),
              borderTop: "1px solid #cbd5e1",
              paddingTop: px(1.5),
              marginTop: px(2),
            }}
          >
            <span style={{ fontSize: px(2.2), color: "#64748b" }}>{sig}:</span>
            <div style={{ width: px(40), borderBottom: "1px solid #334155", height: px(4) }} />
          </div>
        </div>
      </div>
    );
  }

  return <span style={{ fontSize: 10, color: "#94a3b8" }}>{field.kind}</span>;
}

function DraggableBlock({
  field,
  sheetConfig,
  selected,
  onSelect,
  readOnly,
  scale,
}: {
  field: LayoutField;
  sheetConfig: SheetConfig;
  selected: boolean;
  onSelect: () => void;
  readOnly?: boolean;
  scale: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: field.blockId,
    disabled: Boolean(readOnly),
  });
  const left = field.x_mm * PX_MM;
  const top = field.y_mm * PX_MM;
  const wPx = px(estimateBlockWidthMm(field, sheetConfig));
  const hPx = px(estimateBlockHeightMm(field, sheetConfig));
  const dragBind: FieldDragHandleBinding = { attributes, listeners };

  const style: React.CSSProperties = {
    position: "absolute",
    left,
    top,
    width: wPx,
    minHeight: hPx,
    transform: dragTransformCss(transform, scale),
    zIndex: isDragging ? 50 : selected ? 20 : 10,
    opacity: isDragging ? 0.9 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex min-h-0 flex-col overflow-hidden rounded-sm transition-shadow ${
        selected
          ? "shadow-[0_0_0_2px_#c0176a,0_4px_16px_rgba(192,23,106,0.25)]"
          : "shadow-[0_0_0_1px_#e9c2d8] hover:shadow-[0_0_0_1.5px_#c0176a60]"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        if (!readOnly) onSelect();
      }}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <BlockWysiwyg
          field={field}
          cfg={sheetConfig}
          dragHandle={(readOnly ? { attributes: {}, listeners: {} } : dragBind) as FieldDragHandleBinding}
        />
      </div>
    </div>
  );
}

/** PDF-dəki kimi tam sual şəbəkəsi — digər sahələr kimi WYSIWYG */
function McqGridWysiwyg({
  region,
  hideSectionTitles = false,
}: {
  region: McqRegionBounds;
  hideSectionTitles?: boolean;
}) {
  if (!region.blocks.length) {
    return (
      <div
        className="pointer-events-none absolute z-[5] flex items-center justify-center rounded border border-dashed border-amber-400/50 bg-amber-50/40 text-[9px] text-amber-900"
        style={{
          left: region.leftMm * PX_MM,
          top: region.gtMm * PX_MM,
          width: Math.max(40, region.widthMm) * PX_MM,
          height: 24,
        }}
      >
        Sual şəbəkəsi — parametrləri yoxlayın
      </div>
    );
  }

  const bd = region.bubbleDMm;
  const vg = region.vgapMm;
  const hg = region.hgapMm;
  const qnw = region.qNumWMm;
  const gtp = region.gridTopPadMm;
  const opts = "ABCDE".slice(0, region.optionsPerQuestion).split("");

  if (region.mcqLayout === "towers") {
    return (
      <>
        {region.blocks.map((b, idx) => {
          if (isSectionTitleBlock(b)) {
            if (hideSectionTitles) return null;
            return (
              <div
                key={`sec-${idx}-${b.title}`}
                className="pointer-events-none absolute z-[7] flex items-center overflow-hidden"
                style={{
                  left: b.left_mm * PX_MM,
                  top: b.y_mm * PX_MM,
                  width: b.width_mm * PX_MM,
                  height: MCQ_SECTION_TITLE_H_MM * PX_MM,
                  background: C_MAG,
                  borderRadius: "2px 2px 0 0",
                  padding: `0 ${px(2)}`,
                }}
              >
                <span style={{ color: "#fff", fontSize: px(2.6), fontWeight: 600 }}>{b.title}</span>
              </div>
            );
          }
          if (!isTowerRowBlock(b)) return null;
          const rowH = b.num_cell_mm + b.pad_below_num + (opts.length - 1) * b.opt_vgap + b.bd;
          const bandW = b.qs.length * b.strip_pitch_mm;
          return (
            <div
              key={`mcq-tower-${b.qs[0]}-${b.qs[b.qs.length - 1]}`}
              className="pointer-events-none absolute z-[6] overflow-hidden"
              style={{
                left: b.row_left_mm * PX_MM,
                top: b.row_y0_mm * PX_MM,
                width: bandW * PX_MM,
                height: rowH * PX_MM,
                boxSizing: "border-box",
                border: `0.45px solid ${C_MAG_ST}55`,
                borderRadius: 2,
                background: "transparent",
              }}
            >
              {b.qs.map((qnum, j) => {
                const ncPx = b.num_cell_mm * PX_MM;
                const spPx = b.strip_pitch_mm * PX_MM;
                const nwMm = b.num_label_w_mm ?? towerNumLabelBoxWidthMm(b.strip_pitch_mm, b.num_cell_mm);
                const nwPx = nwMm * PX_MM;
                const colBg =
                  (qnum - 1) % 2 === 0 ? "rgba(253, 240, 246, 0.78)" : "rgba(255, 250, 252, 0.98)";
                return (
                  <div
                    key={qnum}
                    style={{
                      position: "absolute",
                      left: j * spPx,
                      top: 0,
                      width: spPx,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      background: colBg,
                    }}
                  >
                    <div
                      style={{
                        width: nwPx,
                        height: ncPx,
                        boxSizing: "border-box",
                        border: `0.4px solid ${C_MAG_ST}88`,
                        background: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: Math.max(6, Math.min(ncPx * 0.38, nwPx * 0.22)),
                        fontWeight: 700,
                        color: "#1e293b",
                      }}
                    >
                      {String(qnum).padStart(3, "0")}
                    </div>
                    <div style={{ height: b.pad_below_num * PX_MM, flexShrink: 0 }} />
                    {opts.map((lab, i) => (
                      <React.Fragment key={lab}>
                        {i > 0 ? (
                          <div style={{ height: Math.max(0, (b.opt_vgap - b.bd) * PX_MM), flexShrink: 0 }} />
                        ) : null}
                        <Bubble dMm={b.bd} label={lab} fsPx={px(b.bd) * 0.38} />
                      </React.Fragment>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      {region.blocks.map((b, idx) => {
        if (isSectionTitleBlock(b)) {
          if (hideSectionTitles) return null;
          return (
            <div
              key={`sec-col-${idx}`}
              className="pointer-events-none absolute z-[7] flex items-center overflow-hidden"
              style={{
                left: b.left_mm * PX_MM,
                top: b.y_mm * PX_MM,
                width: b.width_mm * PX_MM,
                height: MCQ_SECTION_TITLE_H_MM * PX_MM,
                background: C_MAG,
                borderRadius: "2px 2px 0 0",
                padding: `0 ${px(2)}`,
              }}
            >
              <span style={{ color: "#fff", fontSize: px(2.6), fontWeight: 600 }}>{b.title}</span>
            </div>
          );
        }
        if (!isColumnBlock(b)) return null;
        const bdUse = b._bd ?? bd;
        const vgUse = b._vg ?? vg;
        const hgUse = b._hg ?? hg;
        const nQ = b.qs.length;
        const gridTopMm = b.fby - bdUse / 2 - gtp;
        const gridBotMm = b.fby + Math.max(0, nQ - 1) * vgUse + bdUse / 2 + 1.0;
        const colH = Math.max(4, gridBotMm - gridTopMm) * PX_MM;
        const hdrHMm = 5.5;
        const hdrLabel = `Sual ${b.qs[0]}–${b.qs[b.qs.length - 1]}`;
        const bubbleSpan =
          opts.length > 0 ? qnw + 2 + (opts.length - 1) * hgUse + bdUse : b.col_w * 0.5;
        const hdrWmm = Math.min(b.col_w, Math.max(bubbleSpan, qnw + 6, hdrLabel.length * 1.2 + 6));
        return (
          <div
            key={`mcq-${b.qs[0]}-${b.qs[b.qs.length - 1]}`}
            className="pointer-events-none absolute z-[6]"
            style={{
              left: b.col_x * PX_MM,
              top: (gridTopMm - hdrHMm) * PX_MM,
              width: b.col_w * PX_MM,
              height: colH + hdrHMm * PX_MM,
              boxSizing: "border-box",
            }}
          >
            {/* PDF: magenta başlıq şəbəkənin ÜSTÜNDƏ */}
            <div
              className="flex items-center justify-center font-bold uppercase"
              style={{
                width: px(hdrWmm),
                maxWidth: "100%",
                margin: "0 auto",
                height: px(hdrHMm),
                background: C_MAG,
                color: "#fff",
                fontSize: Math.max(5, px(2.4)),
                letterSpacing: 0.3,
                borderRadius: "2px 2px 0 0",
              }}
            >
              {hdrLabel}
            </div>
            <div
              className="relative overflow-hidden"
              style={{
                height: colH,
                boxSizing: "border-box",
                border: `0.45px solid ${C_MAG_ST}55`,
                borderRadius: "0 0 2px 2px",
                background: "rgba(255,252,254,0.96)",
              }}
            >
              {opts.map((lab, j) => (
                <span
                  key={lab}
                  className="absolute font-bold uppercase"
                  style={{
                    left: px(b.fbx + j * hgUse - b.col_x),
                    top: px(gtp - 0.5 - 1.8),
                    transform: "translateX(-50%)",
                    fontSize: px(2.4),
                    color: C_MAG_ST,
                  }}
                >
                  {lab}
                </span>
              ))}
              {b.qs.map((qnum, i) => {
                const cy = b.fby + i * vgUse - gridTopMm;
                return (
                  <div key={qnum} className="absolute inset-x-0" style={{ top: 0, height: 0 }}>
                    <span
                      className="absolute"
                      style={{
                        left: px(1.5),
                        top: px(cy - 1.2),
                        width: px(qnw),
                        fontSize: px(2.5),
                        fontWeight: 700,
                        color: "#1e293b",
                      }}
                    >
                      {String(qnum).padStart(3, "0")}.
                    </span>
                    {opts.map((lab, j) => (
                      <div
                        key={lab}
                        className="absolute"
                        style={{
                          left: px(b.fbx + j * hgUse - bdUse / 2 - b.col_x),
                          top: px(cy - bdUse / 2),
                        }}
                      >
                        <Bubble dMm={bdUse} label={lab} fsPx={px(bdUse) * 0.4} />
                      </div>
                    ))}
                    {i < b.qs.length - 1 ? (
                      <div
                        className="absolute"
                        style={{
                          left: px(1),
                          right: px(1),
                          top: px(cy + bdUse / 2 + 1.2),
                          height: 0.45,
                          background: "#e8dfe4",
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}


function DraggableMcqGridHandle({
  mcq,
  region,
  minTopMm,
  sheetConfig,
  pwMm,
  selected,
  onSelect,
  readOnly,
  scale,
}: {
  mcq: McqGridPos;
  region: McqRegionBounds;
  minTopMm: number;
  sheetConfig: SheetConfig;
  pwMm: number;
  selected: boolean;
  onSelect: () => void;
  readOnly?: boolean;
  scale: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: MCQ_GRID_DRAG_ID,
    disabled: Boolean(readOnly),
  });
  const anchorTopMm = mcq.top_mm <= 0 ? minTopMm : Math.max(mcq.top_mm, minTopMm);
  const label = String(sheetConfig.mcq_grid_label ?? "CAVABLAR").trim() || "CAVABLAR";
  const hdrW = mcqGridHandleWidthMm(label, region, pwMm);
  const hdrH = FIELD_HEADER_BAR_MM;
  const leftMm = region.leftMm;
  const topMm = anchorTopMm - hdrH;
  const dragBind: FieldDragHandleBinding = { attributes, listeners };

  return (
    <>
      {selected && region.blocks.length > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-sm"
          style={{
            left: region.leftMm * PX_MM,
            top: region.topMm * PX_MM,
            width: Math.max(hdrW, region.widthMm) * PX_MM,
            height: region.heightMm * PX_MM,
            boxShadow: "0 0 0 1.5px rgba(192,23,106,0.45)",
            zIndex: 7,
          }}
        />
      ) : null}
      <div
        ref={setNodeRef}
        style={{
          position: "absolute",
          left: leftMm * PX_MM,
          top: topMm * PX_MM,
          width: px(hdrW),
          transform: dragTransformCss(transform, scale),
          zIndex: isDragging ? 50 : selected ? 28 : 22,
          opacity: isDragging ? 0.92 : 1,
        }}
        className={`touch-none overflow-hidden rounded-sm transition-shadow ${
          selected
            ? "shadow-[0_0_0_2px_#c0176a,0_4px_16px_rgba(192,23,106,0.22)]"
            : "shadow-[0_0_0_1px_#e9c2d8] hover:shadow-[0_0_0_1.5px_#c0176a60]"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (!readOnly) onSelect();
        }}
      >
        <HeaderBar
          label={label}
          widthPx={px(hdrW)}
          heightPx={px(hdrH)}
          compactTitle
          dragHandle={(readOnly ? { attributes: {}, listeners: {} } : dragBind) as FieldDragHandleBinding}
        />
      </div>
    </>
  );
}

function DraggableMcqSectionHandle({
  block,
  region,
  minTopMm,
  selected,
  onSelect,
  readOnly,
  scale,
}: {
  block: McqSectionTitleBlock;
  region: McqRegionBounds;
  minTopMm: number;
  selected: boolean;
  onSelect: () => void;
  readOnly?: boolean;
  scale: number;
}) {
  const dragId = mcqSectionDragId(block.section_index);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: Boolean(readOnly),
  });
  const hdrH = MCQ_SECTION_TITLE_H_MM;
  const leftMm = block.left_mm;
  const topMm = Math.max(block.y_mm, minTopMm);
  const hdrW = block.width_mm;
  const dragBind: FieldDragHandleBinding = { attributes, listeners };

  return (
    <>
      {selected ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-sm"
          style={{
            left: region.leftMm * PX_MM,
            top: region.topMm * PX_MM,
            width: Math.max(hdrW, region.widthMm) * PX_MM,
            height: region.heightMm * PX_MM,
            boxShadow: "0 0 0 1.5px rgba(192,23,106,0.45)",
            zIndex: 7,
          }}
        />
      ) : null}
      <div
        ref={setNodeRef}
        style={{
          position: "absolute",
          left: leftMm * PX_MM,
          top: topMm * PX_MM,
          width: px(hdrW),
          height: px(hdrH),
          transform: dragTransformCss(transform, scale),
          zIndex: isDragging ? 50 : selected ? 28 : 22,
          opacity: isDragging ? 0.92 : 1,
        }}
        className={`touch-none overflow-hidden rounded-sm transition-shadow ${
          selected
            ? "shadow-[0_0_0_2px_#c0176a,0_4px_16px_rgba(192,23,106,0.22)]"
            : "shadow-[0_0_0_1px_#e9c2d8] hover:shadow-[0_0_0_1.5px_#c0176a60]"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (!readOnly) onSelect();
        }}
      >
        <HeaderBar
          label={block.title}
          widthPx={px(hdrW)}
          heightPx={px(hdrH)}
          compactTitle
          dragHandle={(readOnly ? { attributes: {}, listeners: {} } : dragBind) as FieldDragHandleBinding}
        />
      </div>
    </>
  );
}

type Props = {
  sheetConfig: SheetConfig;
  /** PDF önizləməsi üçün; boş olanda nümunə mətn */
  sheetUuidPreview?: string | null;
  fields: LayoutField[];
  mcq: McqGridPos;
  showSecondPage?: boolean;
  selectedFieldId: string | null;
  onFieldsChange: (next: LayoutField[]) => void;
  onMcqChange: (next: McqGridPos) => void;
  onMcqSectionsChange?: (next: McqSection[]) => void;
  /** Açıq sual bloklarını paneldə yenilə */
  onOpenBlocksChange?: (next: OpenBlock[]) => void;
  onSelectField: (id: string | null) => void;
  /** Yalnız baxış — sürükləmə və MCQ işarəsini köçürmə söndürülür */
  readOnly?: boolean;
  zoom: number;
  /** A3 qatlanan: aktiv panel (1–4) */
  foldPanel?: number;
  onFoldPanelChange?: (panel: number) => void;
};

function FoldFaceSchematic({
  face,
  activePanel,
  onSelectPanel,
}: {
  face: 1 | 2;
  activePanel: number;
  onSelectPanel: (p: number) => void;
}) {
  const [left, right] = FACE_PANEL_MAP[face];
  return (
    <div className="mx-auto flex max-w-xl items-stretch gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {([left, right] as const).map((p, i) => {
        const meta = PANEL_META[p];
        const active = p === activePanel;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onSelectPanel(p)}
            className={`relative flex min-h-[72px] flex-1 flex-col items-center justify-center gap-0.5 px-3 py-3 text-center transition ${
              active ? "bg-[#fde8f3] text-[#9b1257]" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            } ${i === 0 ? "border-r border-dashed border-[#c0176a88]" : ""}`}
          >
            <span className="text-[11px] font-bold tracking-wide">{meta.short}</span>
            <span className="text-[10px] leading-tight opacity-80">{meta.side} panel</span>
            {active ? (
              <span className="mt-1 rounded-full bg-[#c0176a] px-2 py-0.5 text-[9px] font-semibold text-white">
                redaktə
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function OpenBlockOverlay({
  block,
  index,
  selected,
  readOnly,
  scale,
  onSelect,
}: {
  block: OpenBlock;
  index: number;
  selected: boolean;
  readOnly: boolean;
  scale: number;
  onSelect: () => void;
}) {
  const dragId = openBlockDragId(block, index);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: Boolean(readOnly),
  });
  const { w, h } = openBlockSizeMm(block);
  const values = block.kind === "grid_in" ? gridInBubbleValues(block.alphabet) : [];
  const nCols = Math.max(1, Number(block.answer_length) || 3);
  const pitch = GRID_IN_BUBBLE_D_MM + GRID_IN_COL_GAP_MM;

  return (
    <div
      ref={setNodeRef}
      className={`absolute cursor-grab active:cursor-grabbing rounded-md border-2 shadow-sm ${
        selected
          ? "border-[#c0176a] bg-[#fff5fa] ring-2 ring-[#c0176a55]"
          : "border-sky-500 bg-sky-50/95"
      }`}
      style={{
        left: px(block.x_mm),
        top: px(block.y_mm),
        width: px(w),
        height: px(h),
        zIndex: isDragging ? 55 : selected ? 25 : 14,
        opacity: isDragging ? 0.92 : 1,
        transform: dragTransformCss(transform, scale),
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!readOnly) onSelect();
      }}
      {...(readOnly ? {} : { ...listeners, ...attributes })}
      title={`${block.kind === "essay" ? "Esse" : "Grid-in"} · Sual ${block.question_number} — sürükləyin`}
    >
      {block.kind === "grid_in" ? (
        <>
          <div
            className="flex items-center justify-center font-bold text-white"
            style={{
              height: px(GRID_IN_LABEL_H_MM),
              background: "#c0176a",
              fontSize: Math.max(8, px(GRID_IN_LABEL_H_MM) * 0.7),
            }}
          >
            {block.question_number}
          </div>
          <div className="flex justify-center gap-0.5 px-0.5" style={{ height: px(GRID_IN_HANDWRITE_H_MM) }}>
            {Array.from({ length: nCols }).map((_, j) => (
              <div
                key={j}
                className="rounded-[1px] border border-[#9b1257] bg-white"
                style={{
                  width: px(GRID_IN_HANDWRITE_H_MM),
                  height: px(GRID_IN_HANDWRITE_H_MM),
                }}
              />
            ))}
          </div>
          <div className="relative mt-0.5 flex justify-center" style={{ gap: px(GRID_IN_COL_GAP_MM) }}>
            {Array.from({ length: nCols }).map((_, j) => (
              <div key={j} className="flex flex-col items-center" style={{ gap: px(GRID_IN_VGAP_MM - GRID_IN_BUBBLE_D_MM) }}>
                {values.slice(0, 10).map((v) => (
                  <div
                    key={v}
                    className="grid place-items-center rounded-full border border-slate-500 text-[5px] text-slate-600"
                    style={{ width: px(GRID_IN_BUBBLE_D_MM), height: px(GRID_IN_BUBBLE_D_MM) }}
                  >
                    {v}
                  </div>
                ))}
                {values.length > 10 ? (
                  <span className="text-[6px] text-slate-400">+{values.length - 10}</span>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-1">
            <span className="rounded bg-[#c0176a] px-1.5 py-0.5 text-[9px] font-bold text-white">
              Esse · {block.question_number}
            </span>
          </div>
          <div
            className="pointer-events-none absolute inset-x-2 bottom-2 top-6 opacity-40"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent, transparent 7px, #c0176a55 7px, #c0176a55 8px)",
            }}
          />
        </>
      )}
    </div>
  );
}

function FoldGuideOverlay({ pwMm, phMm }: { pwMm: number; phMm: number }) {
  const mid = (pwMm / 2) * PX_MM;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 20 }}>
      <div
        className="absolute top-0 bottom-0 border-l-2 border-dashed border-[#c0176a99]"
        style={{ left: mid }}
      />
      <span
        className="absolute rounded bg-[#c0176a] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
        style={{ left: mid, top: 8 * PX_MM, transform: "translateX(-50%)" }}
      >
        qatlama
      </span>
    </div>
  );
}

function FiducialMark() {
  const sz = (FIDUCIAL_RO_MM * 2 + 0.6) * PX_MM;
  return (
    <svg width={sz} height={sz} viewBox="0 0 20 20" style={{ display: "block" }}>
      <circle cx="10" cy="10" r="6" fill="none" stroke="#000" strokeWidth="0.55" />
      <circle cx="10" cy="10" r="3.3" fill="none" stroke="#000" strokeWidth="0.5" />
      <circle cx="10" cy="10" r="1.1" fill="#000" />
    </svg>
  );
}

function SheetTimingStrip({ phMm }: { phMm: number }) {
  const w = TIMING_TRACK_MM * PX_MM * 0.92;
  const barH = 2.0 * PX_MM;
  const gap = 2.2 * PX_MM;
  const Hpx = phMm * PX_MM;
  const marginPx = PAGE_MARGIN_MM * PX_MM;
  const bars: number[] = [];
  let y = fiducialOuterBottomFromPageTopMm() * PX_MM;
  while (y < Hpx - marginPx) {
    bars.push(y);
    y += barH + gap;
  }
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: 2, width: w + 0.3 * PX_MM, height: Hpx }}
    >
      {bars.map((top, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 0.3 * PX_MM,
            top,
            width: w,
            height: barH,
            background: "#000",
          }}
        />
      ))}
    </div>
  );
}

function SheetHeaderMag({ pwMm: _pwMm, cfg }: { pwMm: number; cfg: SheetConfig }) {
  const h = SHEET_HEADER_MM * PX_MM;
  const topPx = headerMagentaTopFromPageTopMm() * PX_MM;
  const sidePx = headerMagentaHorizontalInsetMm() * PX_MM;
  const sub = (cfg.header_subtitle || "").trim();
  const titleFs = Math.max(8, Math.min(13, h * 0.22));
  const subFs = Math.max(5.5, h * 0.11);
  return (
    <div
      className="pointer-events-none absolute flex px-2 text-center"
      style={{
        zIndex: 6,
        left: sidePx,
        right: sidePx,
        top: topPx,
        height: h,
        background: C_MAG,
        borderRadius: 2,
        color: "#fff",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: sub ? "center" : "center",
        gap: sub ? Math.max(1, h * 0.04) : 0,
      }}
    >
      <span
        style={{
          fontSize: titleFs,
          fontWeight: 800,
          letterSpacing: 0.35,
          lineHeight: 1.05,
          display: "block",
        }}
      >
        {(cfg.title || "CAVAB KARTI").slice(0, 72)}
      </span>
      {sub ? (
        <span
          style={{
            fontSize: subFs,
            fontWeight: 500,
            opacity: 0.96,
            lineHeight: 1.12,
            whiteSpace: "pre-wrap",
            maxWidth: "100%",
          }}
        >
          {sub.slice(0, 200)}
        </span>
      ) : null}
    </div>
  );
}

function SheetFiducials({ phMm }: { phMm: number }) {
  const sz = (FIDUCIAL_RO_MM * 2 + 0.6) * PX_MM;
  const cx = fiducialCornerCenterFromEdgeMm() * PX_MM;
  const topCenterPx = fiducialCornerCenterFromEdgeMm() * PX_MM;
  const botCenterPx = (phMm - FIDUCIAL_INSET_MM - FIDUCIAL_RO_MM) * PX_MM;
  const box: React.CSSProperties = { position: "absolute", zIndex: 16, pointerEvents: "none", width: sz, height: sz };
  return (
    <>
      <div style={{ ...box, left: cx - sz / 2, top: topCenterPx - sz / 2 }}>
        <FiducialMark />
      </div>
      <div style={{ ...box, right: cx - sz / 2, top: topCenterPx - sz / 2 }}>
        <FiducialMark />
      </div>
      <div style={{ ...box, left: cx - sz / 2, top: botCenterPx - sz / 2 }}>
        <FiducialMark />
      </div>
      <div style={{ ...box, right: cx - sz / 2, top: botCenterPx - sz / 2 }}>
        <FiducialMark />
      </div>
    </>
  );
}

function SheetFooterChrome({ pwMm, sheetUuid }: { pwMm: number; sheetUuid: string }) {
  const lm = contentLeftMm() * PX_MM;
  const rm = PAGE_MARGIN_MM * PX_MM;
  const span = pwMm * PX_MM - lm - rm;
  const fh = SHEET_FOOTER_LINE_MM * PX_MM;
  const uid = (sheetUuid || "PREVIEW00").slice(0, 8).toUpperCase();
  const dot = Math.max(5, fh * 0.42);
  return (
    <div
      className="pointer-events-none absolute flex flex-col"
      style={{ zIndex: 10, left: lm, right: rm, bottom: 0, height: fh }}
    >
      <div style={{ height: 1.25, background: C_MAG, width: "100%", flexShrink: 0 }} />
      <div className="flex min-h-0 flex-1 items-center gap-0.5" style={{ color: "#111", marginTop: 2 }}>
        <div className="flex shrink-0 items-center gap-0.5" style={{ width: span * 0.23, fontSize: Math.max(5.2, fh * 0.28) }}>
          <span className="inline-block shrink-0 rounded-full bg-black" style={{ width: dot, height: dot }} />
          <span className="min-w-0 leading-tight">Düzgün qaralama</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5" style={{ width: span * 0.24, fontSize: Math.max(5.2, fh * 0.28) }}>
          <span
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-black bg-white"
            style={{ width: dot, height: dot, fontSize: dot * 0.55, fontWeight: 700, lineHeight: 1 }}
          >
            ✕
          </span>
          <span className="min-w-0 leading-tight">Səhv qaralama</span>
        </div>
        <div
          className="min-w-0 flex-1 truncate text-center font-semibold leading-tight"
          style={{ fontSize: Math.max(5.1, fh * 0.27) }}
        >
          DİQQƏT: Tələb olunan bütün xanaları qeyd edin!
        </div>
        <div className="shrink-0 text-right leading-tight text-slate-500" style={{ width: span * 0.2, fontSize: Math.max(4.8, fh * 0.26) }}>
          Kart: {uid}…
        </div>
      </div>
    </div>
  );
}

function SheetQrPlaceholder() {
  const sz = 13 * PX_MM;
  const fi = FIDUCIAL_INSET_MM * PX_MM;
  const fro = FIDUCIAL_RO_MM * PX_MM;
  const gap = 2.2 * PX_MM;
  const rightPx = fi + fro + gap;
  const bottom = SHEET_FOOTER_LINE_MM * PX_MM + 1 * PX_MM;
  return (
    <div
      className="pointer-events-none absolute flex flex-col items-center border border-dashed border-slate-400 bg-white"
      style={{
        zIndex: 11,
        width: sz,
        height: sz,
        right: Math.max(PAGE_MARGIN_MM * PX_MM, rightPx),
        bottom,
        fontSize: 5,
        color: "#64748b",
      }}
    >
      <span className="mt-0.5 opacity-70">QR</span>
    </div>
  );
}

function PageArtboard({
  pageLabel,
  pwMm,
  phMm,
  sheetConfig,
  sheetUuidPreview,
  onBackgroundClick,
  children,
}: {
  pageLabel: string;
  pwMm: number;
  phMm: number;
  sheetConfig: SheetConfig;
  sheetUuidPreview?: string | null;
  onBackgroundClick?: () => void;
  children: React.ReactNode;
}) {
  const Wpx = pwMm * PX_MM;
  const Hpx = phMm * PX_MM;
  const uuid = sheetUuidPreview || "PREVIEW00000000";
  return (
    <div className="space-y-2">
      <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">{pageLabel}</p>
      <div
        className="relative cursor-default overflow-hidden rounded-2xl bg-white"
        style={{
          width: Wpx,
          height: Hpx,
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.08)",
        }}
        onClick={onBackgroundClick}
      >
        <SheetTimingStrip phMm={phMm} />
        <SheetHeaderMag pwMm={pwMm} cfg={sheetConfig} />
        <div className="relative" style={{ zIndex: 4, width: Wpx, height: Hpx }}>
          {children}
        </div>
        <SheetFooterChrome pwMm={pwMm} sheetUuid={uuid} />
        <SheetQrPlaceholder />
        <SheetFiducials phMm={phMm} />
      </div>
    </div>
  );
}

export default function FreeformCanvas({
  sheetConfig,
  sheetUuidPreview = null,
  fields,
  mcq,
  showSecondPage = false,
  selectedFieldId,
  onFieldsChange,
  onMcqChange,
  onMcqSectionsChange,
  onOpenBlocksChange,
  onSelectField,
  readOnly = false,
  zoom,
  foldPanel: foldPanelProp,
  onFoldPanelChange,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const foldMode = isA3DuplexFold(sheetConfig);
  const [foldPanelLocal, setFoldPanelLocal] = React.useState(1);
  const foldPanel = foldPanelProp ?? foldPanelLocal;
  const setFoldPanel = (p: number) => {
    setFoldPanelLocal(p);
    onFoldPanelChange?.(p);
  };
  const [foldFace, setFoldFace] = React.useState<1 | 2>(1);

  React.useEffect(() => {
    if (!foldMode) return;
    const meta = PANEL_META[foldPanel];
    if (meta) setFoldFace(meta.face);
  }, [foldMode, foldPanel]);

  const viewConfig = React.useMemo(
    () => (foldMode ? panelViewConfig(sheetConfig, foldPanel) : sheetConfig),
    [foldMode, sheetConfig, foldPanel],
  );

  const showIdentity = !foldMode || panelHasIdentity(sheetConfig, foldPanel);
  const canvasFields = showIdentity ? fields : [];

  const { w: PAGE_W_MM, h: PAGE_H_MM } = paperDimensionsMm(viewConfig.paper_size);
  const showMcqGridLabel = shouldShowMcqGridLabel(viewConfig);
  const useSecondPage = showSecondPage && !foldMode;

  const mcqRegion = React.useMemo(
    () => computeMcqRegionForFreeform(viewConfig, canvasFields, mcq.top_mm, mcq.left_mm),
    [viewConfig, canvasFields, mcq.top_mm, mcq.left_mm],
  );

  const p2Region = React.useMemo(() => computeMcqRegionSecondPage(viewConfig), [viewConfig]);

  const activeMcqRegion = useSecondPage ? p2Region : mcqRegion;

  const sectionTitleBlocks = mcqSectionsUseStacked(viewConfig)
    ? activeMcqRegion.blocks.filter(isSectionTitleBlock)
    : [];
  const hideSectionTitles = sectionTitleBlocks.length > 0 && !readOnly;

  const minMcqTopMm = React.useMemo(() => {
    const mcqMatch = mcqMatchInfoFromRegion(activeMcqRegion);
    const labelHeadroom = shouldShowMcqGridLabel(viewConfig) ? FIELD_HEADER_BAR_MM : 0;
    return minMcqGridTopAnchorMm(canvasFields, viewConfig, mcqMatch, labelHeadroom);
  }, [canvasFields, viewConfig, activeMcqRegion]);

  const wysiwygCfg = React.useMemo(
    () => applyIdentityMcqBubbleSync(viewConfig, mcqMatchInfoFromRegion(activeMcqRegion)),
    [viewConfig, activeMcqRegion],
  );

  const panelOpenBlocks = React.useMemo(() => {
    const all = sheetConfig.open_blocks ?? [];
    if (!foldMode) return all.map((b, index) => ({ b, index }));
    return all
      .map((b, index) => ({ b, index }))
      .filter(({ b }) => (b.panel ?? 1) === foldPanel);
  }, [foldMode, sheetConfig.open_blocks, foldPanel]);

  const otherPanelOpenCount = React.useMemo(() => {
    if (!foldMode) return 0;
    return (sheetConfig.open_blocks ?? []).filter((b) => (b.panel ?? 1) !== foldPanel).length;
  }, [foldMode, sheetConfig.open_blocks, foldPanel]);

  const panelRange = foldMode ? foldPanelRange(sheetConfig, foldPanel) : null;
  const panelMeta = foldMode ? PANEL_META[foldPanel] : null;

  const scale = zoom / 100;

  const onDragEnd = (e: DragEndEvent) => {
    const dx_mm = dragDeltaToMm(e.delta.x, scale);
    const dy_mm = dragDeltaToMm(e.delta.y, scale);
    const secIdx = parseMcqSectionDragIndex(String(e.active.id));
    if (secIdx !== null && onMcqSectionsChange) {
      const sections = [...resolveMcqSections(viewConfig)];
      const sec = sections[secIdx];
      if (!sec) return;
      const titleBlock = activeMcqRegion.blocks.find(
        (b): b is McqSectionTitleBlock =>
          isSectionTitleBlock(b) && b.section_index === secIdx,
      );
      const curTop = sec.top_mm ?? titleBlock?.y_mm ?? (secIdx === 0 ? mcq.top_mm : minMcqTopMm);
      const curLeft = sec.left_mm ?? titleBlock?.left_mm ?? mcq.left_mm;
      const newTop = clamp(curTop + dy_mm, minMcqTopMm, PAGE_H_MM - FOOTER_RESERVE_MM - 20);
      const newLeft = clamp(curLeft + dx_mm, contentLeftMm(), PAGE_W_MM - 40);
      sections[secIdx] = { ...sec, top_mm: newTop, left_mm: newLeft };
      onMcqSectionsChange(sections);
      if (secIdx === 0) {
        onMcqChange({ top_mm: newTop, left_mm: newLeft });
      }
      return;
    }
    if (e.active.id === MCQ_GRID_DRAG_ID) {
      onMcqChange({
        left_mm: clamp(mcq.left_mm + dx_mm, contentLeftMm(), PAGE_W_MM - 40),
        top_mm: clamp(mcq.top_mm + dy_mm, minMcqTopMm, PAGE_H_MM - FOOTER_RESERVE_MM - 40),
      });
      return;
    }
    const openIdx = parseOpenBlockDragIndex(String(e.active.id));
    if (openIdx != null && onOpenBlocksChange) {
      const blocks = [...(sheetConfig.open_blocks ?? [])];
      const b = blocks[openIdx];
      if (!b) return;
      const { w, h } = openBlockSizeMm(b);
      blocks[openIdx] = {
        ...b,
        x_mm: clamp(b.x_mm + dx_mm, contentLeftMm(), Math.max(contentLeftMm(), PAGE_W_MM - w - 4)),
        y_mm: clamp(
          b.y_mm + dy_mm,
          identityZoneTopMm() + 2,
          Math.max(identityZoneTopMm() + 2, PAGE_H_MM - FOOTER_RESERVE_MM - h),
        ),
        panel: foldMode ? foldPanel : (b.panel ?? 1),
      };
      onOpenBlocksChange(blocks);
      return;
    }
    const bid = String(e.active.id);
    const dragged = fields.find((f) => f.blockId === bid);
    if (!dragged) return;
    const mcqMatch = mcqMatchInfoFromRegion(activeMcqRegion);
    const rawX = clamp(
      dragged.x_mm + dx_mm,
      contentLeftMm(),
      Math.max(
        contentLeftMm(),
        contentRightMaxMm(PAGE_W_MM) - estimateBlockWidthMm(dragged, wysiwygCfg, mcqMatch),
      ),
    );
    const rawY = clamp(
      dragged.y_mm + dy_mm,
      identityZoneTopMm() + 2,
      PAGE_H_MM - FOOTER_RESERVE_MM - estimateBlockHeightMm(dragged, wysiwygCfg, mcqMatch),
    );
    const pos = clampFieldPositionAvoidingOverlap(
      dragged,
      rawX,
      rawY,
      fields.filter((f) => f.blockId !== bid),
      wysiwygCfg,
      mcqMatch,
    );
    onFieldsChange(
      fields.map((f) => (f.blockId === bid ? { ...f, x_mm: pos.x_mm, y_mm: pos.y_mm } : f)),
    );
  };

  const contentW = PAGE_W_MM * PX_MM;
  const pageHpx = PAGE_H_MM * PX_MM;
  const pageCount = useSecondPage ? 2 : 1;
  const PAGE_LABEL_CHROME_PX = 23;
  const CANVAS_TOP_PAD_PX = foldMode ? 8 : 20;
  const PAGE_GAP_PX = 24;
  const foldChromeH = foldMode ? 118 : 0;
  const contentH =
    foldChromeH +
    CANVAS_TOP_PAD_PX +
    pageCount * (pageHpx + PAGE_LABEL_CHROME_PX) +
    (pageCount > 1 ? PAGE_GAP_PX : 0);
  const scaledW = Math.max(contentW, foldMode ? 560 : contentW) * scale;
  const scaledH = contentH * scale;

  const pageLabel = foldMode
    ? `${panelMeta?.short ?? `P${foldPanel}`} · ${panelMeta?.hint ?? ""}`
    : "1-ci Səhifə";

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex w-full flex-col items-center">
        {foldMode ? (
          <div className="mb-3 w-full max-w-2xl space-y-2 px-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div className="flex rounded-lg bg-slate-200/80 p-0.5 text-[11px] font-semibold">
                {([1, 2] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`rounded-md px-3 py-1.5 ${
                      foldFace === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                    }`}
                    onClick={() => {
                      setFoldFace(f);
                      setFoldPanel(FACE_PANEL_MAP[f][1]);
                    }}
                  >
                    Üz {f}
                  </button>
                ))}
              </div>
              <div className="flex rounded-lg bg-slate-200/80 p-0.5 text-[11px] font-semibold">
                {[1, 2, 3, 4].map((p) => {
                  const rng = foldPanelRange(sheetConfig, p);
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`rounded-md px-2.5 py-1.5 ${
                        foldPanel === p ? "bg-[#c0176a] text-white shadow-sm" : "text-slate-600"
                      }`}
                      onClick={() => setFoldPanel(p)}
                      title={PANEL_META[p]?.hint}
                    >
                      P{p}
                      {rng ? <span className="ml-1 opacity-80">{rng.from_q}–{rng.to_q}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <FoldFaceSchematic face={foldFace} activePanel={foldPanel} onSelectPanel={setFoldPanel} />
            <p className="text-center text-[11px] text-slate-500">
              Hər panel A4-dür (qatlananda 4 səhifə). Üz sxemində sol/sağ paneli seçib məzmun yerləşdirin.
              {panelRange
                ? ` Bu paneldə suallar: ${panelRange.from_q}–${panelRange.to_q}.`
                : " Bu paneldə MCQ yoxdur."}
              {!showIdentity ? " Şəxsiyyət sahələri P1-dədir." : ""}
              {panelOpenBlocks.length > 0
                ? ` Açıq sual: ${panelOpenBlocks.length} (kanvasda sürükləyin).`
                : ""}
              {otherPanelOpenCount > 0
                ? ` Digər panellərdə ${otherPanelOpenCount} açıq sual — P1–P4 ilə keçin.`
                : ""}
            </p>
          </div>
        ) : null}

        <div className="relative overflow-hidden" style={{ width: contentW * scale, height: (contentH - foldChromeH) * scale }}>
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: contentW,
              height: contentH - foldChromeH,
            }}
          >
            <div className="space-y-6" style={{ paddingTop: CANVAS_TOP_PAD_PX }}>
              <PageArtboard
                pageLabel={pageLabel}
                pwMm={PAGE_W_MM}
                phMm={PAGE_H_MM}
                sheetConfig={viewConfig}
                sheetUuidPreview={sheetUuidPreview}
                onBackgroundClick={() => onSelectField(null)}
              >
                {!useSecondPage ? (
                  <>
                    <McqGridWysiwyg region={mcqRegion} hideSectionTitles={hideSectionTitles} />
                    {showMcqGridLabel ? (
                      <DraggableMcqGridHandle
                        mcq={mcq}
                        region={mcqRegion}
                        minTopMm={minMcqTopMm}
                        sheetConfig={viewConfig}
                        pwMm={PAGE_W_MM}
                        selected={selectedFieldId === MCQ_GRID_DRAG_ID}
                        readOnly={readOnly}
                        scale={scale}
                        onSelect={() => onSelectField(MCQ_GRID_DRAG_ID)}
                      />
                    ) : (
                      sectionTitleBlocks.map((block) => (
                        <DraggableMcqSectionHandle
                          key={mcqSectionDragId(block.section_index)}
                          block={block}
                          region={mcqRegion}
                          minTopMm={minMcqTopMm}
                          selected={selectedFieldId === mcqSectionDragId(block.section_index)}
                          readOnly={readOnly}
                          scale={scale}
                          onSelect={() => onSelectField(mcqSectionDragId(block.section_index))}
                        />
                      ))
                    )}
                  </>
                ) : (
                  <div
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center"
                    style={{
                      top: (identityZoneTopMm() + 12) * PX_MM,
                      fontSize: 11,
                      color: "#9b1257",
                      maxWidth: "80%",
                    }}
                  >
                    Sual cavablarını 2-ci səhifədə qeyd edin.
                  </div>
                )}
                {canvasFields.map((f) => (
                  <DraggableBlock
                    key={f.blockId}
                    field={f}
                    sheetConfig={wysiwygCfg}
                    selected={selectedFieldId === f.blockId}
                    readOnly={readOnly}
                    scale={scale}
                    onSelect={() => onSelectField(f.blockId)}
                  />
                ))}
                {panelOpenBlocks.map(({ b, index }) => (
                  <OpenBlockOverlay
                    key={openBlockDragId(b, index)}
                    block={b}
                    index={index}
                    selected={selectedFieldId === openBlockDragId(b, index)}
                    readOnly={readOnly}
                    scale={scale}
                    onSelect={() => onSelectField(openBlockDragId(b, index))}
                  />
                ))}
              </PageArtboard>

              {useSecondPage && (
                <PageArtboard
                  pageLabel="2-ci Səhifə — yalnız cavab şəbəkəsi"
                  pwMm={PAGE_W_MM}
                  phMm={PAGE_H_MM}
                  sheetConfig={viewConfig}
                  sheetUuidPreview={sheetUuidPreview}
                >
                  <McqGridWysiwyg region={p2Region} hideSectionTitles={hideSectionTitles} />
                  {showMcqGridLabel ? (
                    <DraggableMcqGridHandle
                      mcq={mcq}
                      region={p2Region}
                      minTopMm={identityZoneTopMm() + 8}
                      sheetConfig={viewConfig}
                      pwMm={PAGE_W_MM}
                      selected={selectedFieldId === MCQ_GRID_DRAG_ID}
                      readOnly={readOnly}
                      scale={scale}
                      onSelect={() => onSelectField(MCQ_GRID_DRAG_ID)}
                    />
                  ) : (
                    sectionTitleBlocks.map((block) => (
                      <DraggableMcqSectionHandle
                        key={`p2-${mcqSectionDragId(block.section_index)}`}
                        block={block}
                        region={p2Region}
                        minTopMm={identityZoneTopMm() + 8}
                        selected={selectedFieldId === mcqSectionDragId(block.section_index)}
                        readOnly={readOnly}
                        scale={scale}
                        onSelect={() => onSelectField(mcqSectionDragId(block.section_index))}
                      />
                    ))
                  )}
                  <div
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
                    style={{ fontSize: 11, color: "#94a3b8", maxWidth: "70%" }}
                  >
                    Şəxsiyyət məlumatları 1-ci səhifədə qalır.
                    <br />
                    Bu səhifə yalnız cavab şəbəkəsi üçündür.
                  </div>
                </PageArtboard>
              )}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}
