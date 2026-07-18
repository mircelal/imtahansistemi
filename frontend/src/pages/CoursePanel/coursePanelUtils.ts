import { formatDateTime, formatDateTimeShort } from "../../utils/dateFormat";

export function formatTicketDt(iso: string | null | undefined) {
  return formatDateTimeShort(iso, "");
}

export function formatExamDt(iso: string | null | undefined) {
  return formatDateTime(iso);
}

export const COURSE_PANEL_TABS = [
  { id: "overview", label: "Xülasə" },
  { id: "exams", label: "İmtahanlar" },
  { id: "tickets", label: "Biletlər" },
  { id: "finance", label: "Qazanc" },
  { id: "students", label: "Şagirdlər" },
  { id: "operators", label: "Operatorlar" }
] as const;

export type CoursePanelTabId = (typeof COURSE_PANEL_TABS)[number]["id"];

export function saleStatusLabel(status: string | undefined) {
  switch (status) {
    case "active":
      return "Aktiv";
    case "upcoming":
      return "Gözləyir";
    case "ended":
      return "Bitib";
    case "sold_out":
      return "Satılıb";
    default:
      return status ?? "—";
  }
}

export function saleStatusVariant(status: string | undefined): "success" | "warning" | "error" | "info" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "upcoming":
      return "info";
    case "sold_out":
      return "warning";
    case "ended":
      return "neutral";
    default:
      return "neutral";
  }
}

export function scopeLabel(scope: string | null | undefined) {
  if (scope === "platform") return "Ümumi";
  if (scope === "course") return "Kurs";
  return "—";
}
