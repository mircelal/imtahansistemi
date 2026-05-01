import React from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { SheetConfig } from "./hooks/useSheetConfig";
import type { LayoutField } from "./layoutBlockModel";
import {
  FIELD_HEADER_BAR_MM,
  MCQ_GRID_DRAG_ID,
  estimateBlockHeightMm,
  estimateBlockWidthMm,
  estimateFreeformIdentityHeightMm,
  verticalLettersHandwriteSquareSideMm,
  verticalLettersRowPitchMm,
  type McqGridPos,
} from "./layoutBlockModel";
import {
  type McqRegionBounds,
  computeMcqRegionForFreeform,
  computeMcqRegionSecondPage,
  contentLeftMm,
  towerNumLabelBoxWidthMm,
  fiducialCornerCenterFromEdgeMm,
  fiducialOuterBottomFromPageTopMm,
  headerMagentaHorizontalInsetMm,
  headerMagentaTopFromPageTopMm,
  identityZoneTopMm,
  isTowerRowBlock,
  paperDimensionsMm,
  sheetSepBelowIdentityMm,
} from "./mcqLayout";

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

function applyIdentityMcqBubbleSync(cfg: SheetConfig, region: McqRegionBounds): SheetConfig {
  if (region.mcqLayout !== "towers" || cfg.identity_match_mcq_bubbles === false) return cfg;
  const bdMcq = region.bubbleDMm;
  const ld0 = cfg.identity_letter_d_mm;
  const dd0 = cfg.identity_digit_d_mm;
  if (ld0 <= 0 || dd0 <= 0) return cfg;
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

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** DİM-stilli balaca bubble */
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
  const fs = fsPx ?? Math.max(4.5, s * 0.42);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: s,
        height: s,
        fontSize: fs,
        background: C_MAG_LT,
        border: `0.4px solid ${C_MAG_ST}`,
        boxSizing: "border-box",
      }}
    >
      {label ? (
        <span
          style={{
            color: C_MAG_ST,
            fontWeight: 600,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: s,
            height: s,
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
    const totalW = 2 + cnt * pitch + dd + 2;
    const barH = FIELD_HEADER_BAR_MM;

    return (
      <div style={{ width: px(totalW) }}>
        <HeaderBar label={String(field.label ?? "")} widthPx={px(totalW)} heightPx={px(barH)} dragHandle={dragHandle} />
        <div
          className="flex"
          style={{
            gap: px(dcol),
            paddingLeft: px(2),
            paddingTop: px(1.5),
            background: "white",
            border: `0.5px solid ${C_MAG_ST}33`,
          }}
        >
          {Array.from({ length: cnt }, (_, ci) => (
            <div
              key={ci}
              className="flex flex-col items-center"
              style={{
                gap: px(Math.max(0.12, dvg - dd)),
                borderLeft: ci > 0 ? `0.5px solid ${C_MAG_ST}22` : undefined,
                paddingLeft: ci > 0 ? px(0.5) : 0,
              }}
            >
              {Array.from({ length: 10 }, (_, di) => (
                <div
                  key={di}
                  style={{
                    borderBottom: di < 9 ? `0.35px solid ${C_MAG_ST}14` : undefined,
                    paddingBottom: px(0.2),
                  }}
                >
                  <Bubble dMm={dd} label={String(di)} fsPx={px(dd) * 0.38} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─── SEÇİM QRUPLARI (mcq_groups) ─── */
  if (field.kind === "mcq_groups") {
    const groups = (field.groups as Array<{ label?: string; options?: string[] }> | undefined) ?? [];
    const wMm = estimateBlockWidthMm(field, cfg);
    return (
      <div style={{ width: px(wMm) }}>
        <HeaderBar
          label={String(field.label ?? "Seçimlər")}
          widthPx={px(wMm)}
          heightPx={px(FIELD_HEADER_BAR_MM)}
          compactTitle
          dragHandle={dragHandle}
        />
        <div
          className="flex flex-wrap items-start"
          style={{
            gap: px(3),
            padding: `${px(1)} ${px(2)} ${px(1.5)}`,
            background: "white",
            border: `0.5px solid ${C_MAG_ST}33`,
            borderTop: "none",
          }}
        >
          {groups.map((g, i) => {
            const opts = (g.options ?? ["A", "B"]).map(String);
            return (
              <div key={i} className="flex flex-col items-start" style={{ gap: px(1) }}>
                <span
                  style={{
                    fontSize: px(2.5),
                    fontWeight: 600,
                    color: C_MAG,
                    letterSpacing: 0.24,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {String(g.label ?? "")}
                </span>
                <div className="flex items-center" style={{ gap: px(Math.max(0.08, cfg.identity_letter_hgap_mm - ld)) }}>
                  {opts.map((lab, j) => (
                    <Bubble key={j} dMm={ld} label={lab} fsPx={px(ld) * 0.38} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
    const totalW = hwMode
      ? 11 + hwW + 2 + (31 * lhg + ld) + 6
      : 11 + (31 * lhg + ld) + 6;
    const barH = FIELD_HEADER_BAR_MM;

    return (
      <div style={{ width: px(totalW) }}>
        <HeaderBar label={String(field.label ?? "")} widthPx={px(totalW)} heightPx={px(barH)} dragHandle={dragHandle} />
        <div
          className="flex flex-col"
          style={{
            gap: px(hwMode ? hwH + hwG + ld + 0.5 : Math.max(0.15, lvg - ld)),
            paddingLeft: px(1.5),
            paddingTop: px(1.5),
            background: "white",
            border: `0.5px solid ${C_MAG_ST}33`,
          }}
        >
          {Array.from({ length: nrows }, (_, ri) => (
            <div
              key={ri}
              className="flex items-center"
              style={{
                gap: px(1),
                background: ri % 2 === 0 ? "rgba(253,240,246,0.35)" : "#fff",
                borderBottom: ri < nrows - 1 ? `0.5px solid ${C_MAG_ST}20` : undefined,
                marginLeft: px(-1),
                marginRight: px(-1),
                paddingLeft: px(1),
                paddingRight: px(1),
                paddingTop: px(0.4),
                paddingBottom: px(0.4),
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
                {AZ_LATIN.split("").map((ch, li) => (
                  <Bubble key={li} dMm={ld} label={ch} fsPx={px(ld) * 0.38} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─── RƏQƏM QRUPLARI (digit_groups) ─── */
  if (field.kind === "digit_groups") {
    const groups = (field.groups as Array<{ id?: string; label?: string; count?: number }> | undefined) ?? [];
    const compact = Boolean(field.compact ?? cfg.identity_digit_compact);
    const labelW = compact ? 13 : 26;
    const wMm = estimateBlockWidthMm(field, cfg);
    return (
      <div style={{ width: px(wMm) }}>
        <HeaderBar
          label={String(field.label ?? "Rəqəm qrupları")}
          widthPx={px(wMm)}
          heightPx={px(FIELD_HEADER_BAR_MM)}
          compactTitle
          dragHandle={dragHandle}
        />
        <div
          className="flex flex-wrap items-end"
          style={{
            gap: px(4),
            padding: `${px(1)} ${px(2)} ${px(1.5)}`,
            background: "white",
            border: `0.5px solid ${C_MAG_ST}33`,
            borderTop: "none",
          }}
        >
          {groups.map((g) => {
            const cnt = Number(g.count ?? 1);
            return (
              <div key={String(g.id ?? g.label)} className="flex flex-col items-start" style={{ gap: px(1) }}>
                <span style={{ fontSize: px(2.5), fontWeight: 600, color: C_MAG, width: px(labelW), whiteSpace: "nowrap" }}>
                  {String(g.label ?? "")}:
                </span>
                <div className="flex" style={{ gap: px(dcol) }}>
                  {Array.from({ length: cnt }, (_, ci) => (
                    <div key={ci} className="flex flex-col items-center" style={{ gap: px(dvg - dd) }}>
                      {Array.from({ length: 10 }, (_, di) => (
                        <Bubble key={di} dMm={dd} label={String(di)} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ─── TƏK SEÇİM (mcq) ─── */
  if (field.kind === "mcq") {
    const opts = (field.options as string[] | undefined)?.map(String) ?? ["A", "B", "C", "D"];
    const wMm = estimateBlockWidthMm(field, cfg);
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
          className="flex flex-col items-start"
          style={{
            gap: px(1),
            padding: `${px(1)} ${px(2)} ${px(1.5)}`,
            background: "white",
            border: `0.5px solid ${C_MAG_ST}33`,
            borderTop: "none",
          }}
        >
          <div className="flex items-center" style={{ gap: px(Math.max(0.08, cfg.identity_letter_hgap_mm - ld)) }}>
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

  return <span style={{ fontSize: 10, color: "#94a3b8" }}>{field.kind}</span>;
}

function DraggableBlock({
  field,
  sheetConfig,
  selected,
  onSelect,
  readOnly,
}: {
  field: LayoutField;
  sheetConfig: SheetConfig;
  selected: boolean;
  onSelect: () => void;
  readOnly?: boolean;
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
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
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
function McqGridWysiwyg({ region }: { region: McqRegionBounds }) {
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
  const gt = region.gtMm;
  const gb = region.gbMm;
  const qnw = region.qNumWMm;
  const gtp = region.gridTopPadMm;
  const opts = "ABCDE".slice(0, region.optionsPerQuestion).split("");

  if (region.mcqLayout === "towers") {
    return (
      <>
        {region.blocks.map((b) => {
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
      {region.blocks.map((b) => {
        if (isTowerRowBlock(b)) return null;
        const colH = (gb - gt) * PX_MM;
        return (
          <div
            key={`mcq-${b.qs[0]}-${b.qs[b.qs.length - 1]}`}
            className="pointer-events-none absolute z-[6] overflow-hidden"
            style={{
              left: b.col_x * PX_MM,
              top: gt * PX_MM,
              width: b.col_w * PX_MM,
              height: colH,
              boxSizing: "border-box",
              border: `0.45px solid ${C_MAG_ST}55`,
              borderRadius: 2,
              background: "rgba(255,252,254,0.96)",
            }}
          >
            <div
              className="flex items-center justify-center font-bold uppercase"
              style={{
                height: px(5.5),
                background: C_MAG,
                color: "#fff",
                fontSize: Math.max(5, px(2.6)),
                letterSpacing: 0.3,
              }}
            >
              Sual {b.qs[0]}–{b.qs[b.qs.length - 1]}
            </div>
            <div
              className="flex items-end justify-start"
              style={{
                height: px(gtp + 2.5),
                paddingLeft: px(1),
                paddingRight: px(1),
                background: "#fff",
                borderBottom: `0.35px solid ${C_MAG_ST}18`,
              }}
            >
              <div style={{ width: px(qnw) }} />
              {opts.map((lab) => (
                <div key={lab} className="flex items-center justify-center" style={{ width: px(hg) }}>
                  <span style={{ fontSize: px(2.4), fontWeight: 700, color: C_MAG_ST }}>{lab}</span>
                </div>
              ))}
            </div>
            <div>
              {b.qs.map((qnum, i) => (
                <div
                  key={qnum}
                  className="flex items-center"
                  style={{
                    height: px(vg),
                    background: i % 2 === 0 ? "rgba(253,240,246,0.28)" : "#fff",
                    borderBottom: i < b.qs.length - 1 ? `0.45px solid #e8dfe4` : undefined,
                  }}
                >
                  <span
                    style={{
                      width: px(qnw),
                      paddingLeft: px(1.5),
                      fontSize: px(2.5),
                      fontWeight: 700,
                      color: "#1e293b",
                      flexShrink: 0,
                    }}
                  >
                    {String(qnum).padStart(3, "0")}.
                  </span>
                  <div className="flex items-center">
                    {opts.map((lab, j) => (
                      <div key={lab} className="flex items-center justify-center" style={{ width: px(hg) }}>
                        <Bubble dMm={bd} label={lab} fsPx={px(bd) * 0.4} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function DraggableMcqMarker({
  mcq,
  minTopMm,
  selected,
  onSelect,
  readOnly,
}: {
  mcq: McqGridPos;
  /** Şəxsiyyət zonası bitəndən sonra — PDF `gt_anchor` minimumu ilə eyni */
  minTopMm: number;
  selected: boolean;
  onSelect: () => void;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: MCQ_GRID_DRAG_ID,
    disabled: Boolean(readOnly),
  });
  const topMm = mcq.top_mm <= 0 ? minTopMm : Math.max(mcq.top_mm, minTopMm);
  const style: React.CSSProperties = {
    position: "absolute",
    left: mcq.left_mm * PX_MM,
    top: topMm * PX_MM,
    width: px(40),
    height: px(6),
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: selected ? 28 : 26,
    cursor: readOnly ? "default" : "grab",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="touch-none"
      {...(!readOnly ? listeners : {})}
      {...(!readOnly ? attributes : {})}
      onClick={(e) => {
        e.stopPropagation();
        if (!readOnly) onSelect();
      }}
    >
      <div
        className="flex h-full items-center justify-center rounded-lg text-[9px] font-semibold"
        style={{
          background: selected ? "#f59e0b" : "#fef3c7",
          border: `1.5px dashed ${selected ? "#d97706" : "#f59e0b"}`,
          color: "#92400e",
        }}
      >
        ↕ Cavab şəbəkəsi başlanğıcı
      </div>
    </div>
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
  onSelectField: (id: string | null) => void;
  /** Yalnız baxış — sürükləmə və MCQ işarəsini köçürmə söndürülür */
  readOnly?: boolean;
};

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
  onSelectField,
  readOnly = false,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [selMcq, setSelMcq] = React.useState(false);
  const [zoom, setZoom] = React.useState(75); // percent
  const clampZoom = React.useCallback((z: number) => Math.round(Math.min(300, Math.max(10, z))), []);

  const { w: PAGE_W_MM, h: PAGE_H_MM } = paperDimensionsMm(sheetConfig.paper_size);

  const mcqRegion = React.useMemo(
    () => computeMcqRegionForFreeform(sheetConfig, fields, mcq.top_mm, mcq.left_mm),
    [sheetConfig, fields, mcq.top_mm, mcq.left_mm],
  );

  const minMcqTopMm = React.useMemo(
    () =>
      identityZoneTopMm() +
      estimateFreeformIdentityHeightMm(fields, sheetConfig, 0, mcq.top_mm) +
      sheetSepBelowIdentityMm(),
    [fields, sheetConfig, mcq.top_mm],
  );

  const wysiwygCfg = React.useMemo(
    () => applyIdentityMcqBubbleSync(sheetConfig, mcqRegion),
    [sheetConfig, mcqRegion],
  );

  const p2Region = React.useMemo(() => computeMcqRegionSecondPage(sheetConfig), [sheetConfig]);

  const onDragEnd = (e: DragEndEvent) => {
    const dx_mm = e.delta.x / PX_MM;
    const dy_mm = e.delta.y / PX_MM;
    if (e.active.id === MCQ_GRID_DRAG_ID) {
      onMcqChange({
        left_mm: clamp(mcq.left_mm + dx_mm, 12, PAGE_W_MM - 40),
        top_mm: clamp(
          mcq.top_mm + dy_mm,
          minMcqTopMm,
          PAGE_H_MM - FOOTER_RESERVE_MM - 40,
        ),
      });
      return;
    }
    const bid = String(e.active.id);
    const next = fields.map((f) =>
      f.blockId === bid
        ? {
            ...f,
            x_mm: clamp(f.x_mm + dx_mm, 10, PAGE_W_MM - 20),
            y_mm: clamp(
              f.y_mm + dy_mm,
              identityZoneTopMm() + 2,
              PAGE_H_MM - FOOTER_RESERVE_MM - estimateBlockHeightMm(f, wysiwygCfg),
            ),
          }
        : f,
    );
    onFieldsChange(next);
  };

  const scale = zoom / 100;
  const scaledW = PAGE_W_MM * PX_MM * scale;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col items-center gap-3">
        {/* Canvas area */}
        <div style={{ width: scaledW }} className="relative">
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: PAGE_W_MM * PX_MM,
            }}
          >
            <div className="space-y-6 pt-5">
              <PageArtboard
                pageLabel="1-ci Səhifə"
                pwMm={PAGE_W_MM}
                phMm={PAGE_H_MM}
                sheetConfig={sheetConfig}
                sheetUuidPreview={sheetUuidPreview}
                onBackgroundClick={() => {
                  onSelectField(null);
                  setSelMcq(false);
                }}
              >
                <McqGridWysiwyg region={mcqRegion} />
                <DraggableMcqMarker
                  mcq={mcq}
                  minTopMm={minMcqTopMm}
                  selected={selMcq}
                  readOnly={readOnly}
                  onSelect={() => {
                    setSelMcq(true);
                    onSelectField(null);
                  }}
                />
                {fields.map((f) => (
                  <DraggableBlock
                    key={f.blockId}
                    field={f}
                    sheetConfig={wysiwygCfg}
                    selected={selectedFieldId === f.blockId}
                    readOnly={readOnly}
                    onSelect={() => {
                      onSelectField(f.blockId);
                      setSelMcq(false);
                    }}
                  />
                ))}
              </PageArtboard>

              {showSecondPage && (
                <PageArtboard
                  pageLabel="2-ci Səhifə — yalnız cavab şəbəkəsi"
                  pwMm={PAGE_W_MM}
                  phMm={PAGE_H_MM}
                  sheetConfig={sheetConfig}
                  sheetUuidPreview={sheetUuidPreview}
                >
                  <McqGridWysiwyg region={p2Region} />
                  <div
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
                    style={{ fontSize: 11, color: "#94a3b8", maxWidth: "70%" }}
                  >
                    Şəxsiyyət məlumatları 1-ci səhifədə qalır.
                    <br />Bu səhifə yalnız cavab şəbəkəsi üçündür.
                  </div>
                </PageArtboard>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-auto fixed bottom-4 right-4 z-50 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-sm"
        role="toolbar"
        aria-label="Canvas böyütmə"
      >
        <span className="text-[11px] font-medium text-slate-500">Zoom</span>
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            aria-label="Kiçilt"
            title="Kiçilt (10–300%)"
            disabled={zoom <= 10}
            onClick={() => setZoom((z) => clampZoom(z - 5))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] font-semibold text-slate-700 transition hover:bg-white hover:shadow-sm disabled:pointer-events-none disabled:opacity-35"
          >
            −
          </button>
          <span className="min-w-[2.75rem] select-none text-center text-[12px] font-semibold tabular-nums text-slate-800">
            {zoom}%
          </span>
          <button
            type="button"
            aria-label="Böyüt"
            title="Böyüt (10–300%)"
            disabled={zoom >= 300}
            onClick={() => setZoom((z) => clampZoom(z + 5))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] font-semibold text-slate-700 transition hover:bg-white hover:shadow-sm disabled:pointer-events-none disabled:opacity-35"
          >
            +
          </button>
        </div>
        <div className="hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />
        {[50, 75, 100, 150, 200].map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${
              zoom === z ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {z}%
          </button>
        ))}
      </div>
    </DndContext>
  );
}
