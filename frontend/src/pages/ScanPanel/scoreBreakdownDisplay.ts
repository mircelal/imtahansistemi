/** score_breakdown JSON-u istifadəçi üçün AZ xülasəyə çevirir (daxili açarları göstərmir). */

const INTERNAL_KEYS = new Set([
  "version",
  "wrong_policy",
  "by_question",
  "by_subject_raw",
  "by_subject_relative",
  "by_subject_weighted",
  "priority_order",
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

  const relative = breakdown.by_subject_relative;
  const order = Array.isArray(breakdown.priority_order)
    ? (breakdown.priority_order as string[])
    : null;

  if (relative && typeof relative === "object" && !Array.isArray(relative)) {
    const relMap = relative as Record<string, unknown>;
    const codes = order?.length
      ? order.filter((c) => c in relMap)
      : Object.keys(relMap).filter((k) => k !== "__default__");
    const entries = codes
      .map((code) => {
        const val = relMap[code];
        if (!val || typeof val !== "object") return null;
        const o = val as {
          earned?: number;
          max?: number;
          weight?: number;
          priority?: number;
          formula?: string;
        };
        const e = o.earned ?? 0;
        const m = o.max ?? 0;
        const w = o.weight != null && o.weight !== 1 ? `×${o.weight}` : "";
        const prio = o.priority != null && o.priority > 0 ? ` [#${o.priority}]` : "";
        const form = o.formula === "weighted_linear" ? " nisbi" : "";
        return `${code}${prio}${form}: ${e}/${m}${w}`;
      })
      .filter(Boolean);
    if (entries.length) parts.push(entries.join(" · "));
  } else {
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
  }

  const totals = breakdown.totals_weighted;
  if (totals && typeof totals === "object" && !Array.isArray(totals)) {
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
