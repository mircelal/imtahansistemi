import type { ExamReadiness } from "../../../api/exams";

export type SheetLinkStatus = "none" | "draft" | "confirmed";

export function sheetLinkStatus(
  presetId: number | null | undefined,
  confirmedCount: number,
  draftCount: number,
): SheetLinkStatus {
  if (confirmedCount > 0) return "confirmed";
  if (draftCount > 0) return "draft";
  if (presetId != null) return "draft";
  return "none";
}

export function sheetStatusLabel(status: SheetLinkStatus): string {
  switch (status) {
    case "confirmed":
      return "Təsdiqlənmiş kart ✓";
    case "draft":
      return "Qaralama";
    default:
      return "Dizayn şablonu bağlı deyil";
  }
}

export function sheetStatusFromReadiness(
  readiness: ExamReadiness | undefined,
  presetId: number | null | undefined,
  draftCount = 0,
  confirmedCount = 0,
): SheetLinkStatus {
  const sheetStep = readiness?.steps.find((s) => s.id === "sheet_template" || s.id === "sheet" || s.id === "answer_sheet");
  if (sheetStep?.complete || confirmedCount > 0) return "confirmed";
  if (draftCount > 0) return "draft";
  if (presetId != null) return "draft";
  return "none";
}

type Props = {
  status: SheetLinkStatus;
};

export default function SheetStatusBadge({ status }: Props) {
  const cls =
    status === "confirmed"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
      : status === "draft"
        ? "bg-amber-100 text-amber-900 ring-amber-200"
        : "bg-slate-100 text-slate-700 ring-slate-200";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ${cls}`}>
      {sheetStatusLabel(status)}
    </span>
  );
}
