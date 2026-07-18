/**
 * DİM tipli sual kitabçası layout spesifikasiyası — backend booklet_layout_spec.py ilə sinxron.
 */
export const BOOKLET_MARGIN_SIDE_MM = 12.0;
export const BOOKLET_TIMING_TRACK_MM = 7.0;
export const BOOKLET_CONTENT_LEFT_MM = 19.0;
export const BOOKLET_HEADER_BAR_MM = 9.8;
export const BOOKLET_FOOTER_ZONE_MM = 9.0;
export const BOOKLET_COVER_VARIANT_BOX_MM = 28.0;

export const DEFAULT_BOOKLET_VARIANTS = ["A", "B", "C", "D"] as const;

export const DIM_BOOKLET_FOOTER_NOTICE =
  "DİQQƏT: Sual kitabçasına yazı yazmaq qadağandır! Cavablar yalnız cavab kartında qeyd edilir.";

export type BookletConfig = {
  organiser?: string;
  sector?: string;
  exam_series?: string;
  variants?: string[];
};

export function defaultBookletConfig(): BookletConfig {
  return {
    organiser: "Dövlət İmtahan Mərkəzi",
    sector: "",
    exam_series: "",
    variants: [...DEFAULT_BOOKLET_VARIANTS],
  };
}

export function resolveBookletConfig(gradingConfig: Record<string, unknown> | undefined): BookletConfig {
  const raw = gradingConfig?.booklet_config;
  const base = defaultBookletConfig();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const bc = raw as BookletConfig;
  const variants =
    Array.isArray(bc.variants) && bc.variants.length > 0
      ? bc.variants.map((v) => String(v).trim().toUpperCase()).filter(Boolean)
      : base.variants;
  return {
    organiser: bc.organiser?.trim() || base.organiser,
    sector: bc.sector?.trim() || "",
    exam_series: bc.exam_series?.trim() || "",
    variants,
  };
}
