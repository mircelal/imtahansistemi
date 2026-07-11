/** score_breakdown JSON-u istifadəçi üçün AZ xülasəyə çevirir (daxili açarları göstərmir). */

const INTERNAL_KEYS = new Set([
  "version",
  "wrong_policy",
  "by_question",
  "by_subject_raw",
  "by_subject_weighted",
  "totals_raw",
  "totals_weighted",
]);

export function formatScoreBreakdownSummary(
  breakdown: Record<string, unknown> | null | undefined,
  examNegativeMarking?: boolean,
): string {
  if (!breakdown || typeof breakdown !== "object") return "";

  const parts: string[] = [];

  if (examNegativeMarking) {
    parts.push("Mənfi işarələmə: aktiv");
  }

  const weighted = breakdown.by_subject_weighted;
  if (weighted && typeof weighted === "object" && !Array.isArray(weighted)) {
    const entries = Object.entries(weighted as Record<string, unknown>)
      .filter(([k]) => k !== "__default__")
      .map(([code, val]) => {
        if (!val || typeof val !== "object") return null;
        const o = val as { earned?: number; max?: number; weight?: number };
        const e = o.earned ?? 0;
        const m = o.max ?? 0;
        const w = o.weight != null && o.weight !== 1 ? `×${o.weight}` : "";
        return `${code}: ${e}/${m}${w}`;
      })
      .filter(Boolean);
    if (entries.length) parts.push(entries.join(" · "));
  }

  const totals = breakdown.totals_weighted;
  if (totals && typeof totals === "object" && !Array.isArray(totals) && parts.length === 0) {
    const t = totals as { earned?: number; max?: number };
    if (t.earned != null && t.max != null) {
      parts.push(`Cəmi: ${t.earned}/${t.max}`);
    }
  }

  return parts.join(" · ");
}

export function isInternalBreakdownKey(key: string): boolean {
  return key.startsWith("__") || INTERNAL_KEYS.has(key);
}
