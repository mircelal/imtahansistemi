import { formatDateTime } from "../../utils/dateFormat";

export function formatDt(iso: string | null | undefined): string {
  return formatDateTime(iso);
}

export function formatScore(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

export function formatPercent(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

export function insightToneClass(tone: string): string {
  switch (tone) {
    case "positive":
      return "border-emerald-200 bg-emerald-50/80 text-emerald-950";
    case "warning":
      return "border-amber-200 bg-amber-50/80 text-amber-950";
    case "negative":
      return "border-red-200 bg-red-50/80 text-red-950";
    default:
      return "border-slate-200 bg-slate-50/80 text-slate-900";
  }
}

export function difficultyLabel(p: number): { label: string; className: string } {
  if (p >= 0.75) return { label: "Asan", className: "bg-emerald-100 text-emerald-800" };
  if (p >= 0.45) return { label: "Orta", className: "bg-sky-100 text-sky-800" };
  if (p > 0) return { label: "Çətin", className: "bg-amber-100 text-amber-900" };
  return { label: "—", className: "bg-slate-100 text-slate-600" };
}

export function statusLabelAz(status: string): string {
  const map: Record<string, string> = {
    ok: "Uğurlu",
    manual_review: "Manual yoxlama",
    error: "Xəta",
    pending: "Gözləyir",
    processing: "Emal",
    done: "Bitib",
  };
  return map[status] ?? status;
}

export function statusBadgeClass(status: string): string {
  if (status === "ok") return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/20";
  if (status === "manual_review") return "bg-amber-500/15 text-amber-900 ring-amber-500/20";
  if (status === "error") return "bg-red-500/15 text-red-800 ring-red-500/20";
  return "bg-slate-500/10 text-slate-700 ring-slate-500/15";
}
