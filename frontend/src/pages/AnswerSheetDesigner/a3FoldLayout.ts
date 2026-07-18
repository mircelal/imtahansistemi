import type { McqSection, SheetConfig } from "./hooks/useSheetConfig";

/** Üz → [sol panel, sağ panel] — backend FACE_PANEL_MAP ilə eyni */
export const FACE_PANEL_MAP: Record<1 | 2, readonly [number, number]> = {
  1: [4, 1],
  2: [2, 3],
};

export const PANEL_META: Record<
  number,
  { face: 1 | 2; side: "sol" | "sağ"; short: string; hint: string }
> = {
  1: { face: 1, side: "sağ", short: "P1", hint: "Üz 1 sağ — oxumaqda 1-ci səhifə" },
  2: { face: 2, side: "sol", short: "P2", hint: "Üz 2 sol — içəri 2-ci səhifə" },
  3: { face: 2, side: "sağ", short: "P3", hint: "Üz 2 sağ — içəri 3-cü səhifə" },
  4: { face: 1, side: "sol", short: "P4", hint: "Üz 1 sol — qatlananda arxa" },
};

export function isA3DuplexFold(cfg: Pick<SheetConfig, "sheet_format"> | null | undefined): boolean {
  const fmt = String(cfg?.sheet_format || "").toLowerCase();
  return fmt === "a3_duplex_fold" || fmt === "a3_fold" || fmt === "a3_duplex";
}

/** Sualları 4 panelə bərabər böl (1-based from/to). */
export function splitQuestionsAcrossPanels(
  qCount: number,
): Record<number, { from_q: number; to_q: number } | null> {
  const out: Record<number, { from_q: number; to_q: number } | null> = {
    1: null,
    2: null,
    3: null,
    4: null,
  };
  const n = Math.max(0, Math.floor(qCount));
  if (n < 1) return out;
  const base = Math.floor(n / 4);
  const rem = n % 4;
  let start = 1;
  for (let p = 1; p <= 4; p++) {
    const size = base + (p <= rem ? 1 : 0);
    if (size < 1) {
      out[p] = null;
      continue;
    }
    const end = start + size - 1;
    out[p] = { from_q: start, to_q: end };
    start = end + 1;
  }
  return out;
}

export type FoldPanelOverride = {
  question_from?: number;
  question_to?: number;
  mcq_sections?: McqSection[];
  identity_section?: boolean;
  title?: string;
};

export function foldPanelRange(
  cfg: SheetConfig,
  panel: number,
): { from_q: number; to_q: number } | null {
  const ov = cfg.fold_panels?.[String(panel)];
  if (ov?.question_from != null && ov?.question_to != null) {
    const fq = Number(ov.question_from);
    const tq = Number(ov.question_to);
    if (Number.isFinite(fq) && Number.isFinite(tq) && tq >= fq) return { from_q: fq, to_q: tq };
  }
  return splitQuestionsAcrossPanels(cfg.question_count)[panel] ?? null;
}

/** A3 qatlanan seçiləndə fold_panels + A3L kağızını hazırla. */
export function ensureFoldPanels(config: SheetConfig, forceRanges = false): SheetConfig {
  const ranges = splitQuestionsAcrossPanels(config.question_count);
  const fold_panels: Record<string, FoldPanelOverride> = { ...(config.fold_panels ?? {}) };
  for (let p = 1; p <= 4; p++) {
    const key = String(p);
    const rng = ranges[p];
    const prev = fold_panels[key] ?? {};
    const hasManual = prev.question_from != null && prev.question_to != null;
    if ((!hasManual || forceRanges) && rng) {
      fold_panels[key] = {
        ...prev,
        question_from: rng.from_q,
        question_to: rng.to_q,
        mcq_sections: [
          {
            title: PANEL_META[p]?.short ?? `P${p}`,
            from_q: rng.from_q,
            to_q: rng.to_q,
            columns_count: config.columns_count,
          },
        ],
        identity_section: p === 1,
      };
    } else if (!fold_panels[key]) {
      fold_panels[key] = {
        identity_section: p === 1,
        mcq_sections: [],
      };
    }
  }
  return {
    ...config,
    sheet_format: "a3_duplex_fold",
    paper_size: "A3L",
    fold_panels,
  };
}

/**
 * Dizayner kanvası üçün aktiv panel config-i (A4).
 * PDF panel_config ilə eyni məntiq.
 */
export function panelViewConfig(base: SheetConfig, panel: number): SheetConfig {
  const rng = foldPanelRange(base, panel);
  const ov = base.fold_panels?.[String(panel)] ?? {};
  const identityOn =
    ov.identity_section === true || (panel === 1 && ov.identity_section !== false);

  const sections: McqSection[] =
    ov.mcq_sections && ov.mcq_sections.length > 0
      ? ov.mcq_sections
      : rng
        ? [
            {
              title: PANEL_META[panel]?.short ?? `P${panel}`,
              from_q: rng.from_q,
              to_q: rng.to_q,
              columns_count: base.columns_count,
            },
          ]
        : [];

  return {
    ...base,
    paper_size: "A4",
    sheet_format: "standard",
    fold_panels: undefined,
    open_blocks: (base.open_blocks ?? []).filter((b) => (b.panel ?? 1) === panel),
    mcq_sections: sections,
    question_count: rng ? Math.max(base.question_count, rng.to_q) : 0,
    title: ov.title || base.title,
    // Şəxsiyyət yalnız P1 (və ya override)
    identity_ad_rows: identityOn ? base.identity_ad_rows : 0,
    identity_sn_rows: identityOn ? base.identity_sn_rows : 0,
    identity_fn_rows: identityOn ? base.identity_fn_rows : 0,
    identity_show_notice: identityOn ? base.identity_show_notice : false,
  };
}

export function panelHasIdentity(base: SheetConfig, panel: number): boolean {
  const ov = base.fold_panels?.[String(panel)];
  if (ov?.identity_section === true) return true;
  if (ov?.identity_section === false) return false;
  return panel === 1;
}
