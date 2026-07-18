/** az-AZ + month:"short" bəzi brauzerlərdə "M04" kimi xarab çıxır — sabit rəqəmli format. */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 30.04.2026 16:47 */
export function formatDateTime(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  try {
    const d = parseDate(iso);
    if (!d) return iso;
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

/** 30.04 16:47 */
export function formatDateTimeShort(iso: string | null | undefined, empty = ""): string {
  if (!iso) return empty;
  try {
    const d = parseDate(iso);
    if (!d) return iso;
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

/** 30.04.2026 */
export function formatDate(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  try {
    const d = parseDate(iso);
    if (!d) return iso;
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

/** 30.04 */
export function formatDayMonth(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  try {
    const d = parseDate(iso);
    if (!d) return iso;
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
  } catch {
    return iso;
  }
}
