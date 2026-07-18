import { formatDateTime, formatDayMonth } from "../../utils/dateFormat";

export function formatDt(iso: string | null | undefined): string {
  return formatDateTime(iso);
}

export function formatShortDate(iso: string): string {
  return formatDayMonth(iso);
}

export function alertToneClass(tone: string): string {
  switch (tone) {
    case "positive":
      return "border-emerald-200 bg-emerald-50/90 text-emerald-950";
    case "warning":
      return "border-amber-200 bg-amber-50/90 text-amber-950";
    case "negative":
      return "border-red-200 bg-red-50/90 text-red-950";
    default:
      return "border-slate-200 bg-slate-50/90 text-slate-900";
  }
}

export function sessionStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Gözləyir",
    processing: "Emal",
    done: "Bitib",
    error: "Xəta",
  };
  return map[status.toLowerCase()] ?? status;
}

export function sessionStatusClass(status: string): string {
  const k = status.toLowerCase();
  if (k === "done") return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/20";
  if (k === "error") return "bg-red-500/15 text-red-800 ring-red-500/20";
  if (k === "processing") return "bg-violet-500/15 text-violet-800 ring-violet-500/20";
  return "bg-slate-500/10 text-slate-700 ring-slate-500/15";
}

export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Administrator",
    manager: "Menecer",
    operator: "Operator",
  };
  return map[role] ?? role;
}
