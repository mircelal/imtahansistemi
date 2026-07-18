import { formatDate as formatDateOnly, formatDateTime } from "../../utils/dateFormat";

export function formatDt(iso: string | null | undefined) {
  return formatDateTime(iso);
}

export function formatDate(iso: string | null | undefined) {
  return formatDateOnly(iso);
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null) return "—";
  return `${value.toFixed(digits)}%`;
}

export function statusAz(status: string) {
  const k = status.toLowerCase();
  const map: Record<string, string> = {
    ok: "Hesablanıb",
    manual_review: "Manual yoxlama",
    error: "Xəta",
    pending: "Gözləyir",
    confirmed: "Təsdiqlənib",
    cancelled: "Ləğv edilib"
  };
  return map[k] ?? status;
}

export function performanceBandLabel(band: string | null | undefined) {
  const map: Record<string, string> = {
    excellent: "Əla",
    good: "Yaxşı",
    developing: "Inkişaf edir",
    needs_support: "Dəstək lazımdır"
  };
  return band ? map[band] ?? band : "—";
}

export function performanceBandClass(band: string | null | undefined) {
  if (band === "excellent") return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (band === "good") return "bg-sky-100 text-sky-900 ring-sky-200";
  if (band === "developing") return "bg-amber-100 text-amber-900 ring-amber-200";
  if (band === "needs_support") return "bg-rose-100 text-rose-900 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function insightToneClass(tone: string) {
  if (tone === "positive") return "border-emerald-200 bg-emerald-50/80";
  if (tone === "attention") return "border-amber-200 bg-amber-50/80";
  return "border-slate-200 bg-slate-50/80";
}

export function registrationStatusClass(status: string) {
  const k = status.toLowerCase();
  if (k === "confirmed") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (k === "cancelled") return "bg-red-50 text-red-800 ring-red-200";
  return "bg-amber-50 text-amber-900 ring-amber-200";
}

export function deltaClass(delta: number | null | undefined) {
  if (delta == null) return "text-slate-500";
  if (delta > 0) return "text-emerald-700";
  if (delta < 0) return "text-rose-700";
  return "text-slate-600";
}

export function deltaLabel(delta: number | null | undefined) {
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}
