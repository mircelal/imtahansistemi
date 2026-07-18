/** Apple-inspired compact form tokens for exam flows */
export const examInput =
  "mt-1 w-full rounded-[10px] border-0 bg-slate-100/90 px-3 py-2 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10";

export const examInputCompact =
  "w-full rounded-[10px] border-0 bg-slate-100/90 px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition focus:bg-white focus:ring-2 focus:ring-slate-900/10";

export const examLabel = "block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500";

export const examSection =
  "overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70";

export const examSectionHeader =
  "border-b border-slate-100/80 px-4 py-3 sm:px-5";

export const examSectionBody = "px-4 py-4 sm:px-5 sm:py-4";

export const examSectionTitle = "text-[15px] font-semibold tracking-tight text-slate-900";

export const examSectionHint = "mt-0.5 text-[12px] leading-snug text-slate-500";

export const examDivider = "my-3 h-px bg-slate-100";

export const examPrimaryBtn =
  "inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50";

export const examSecondaryBtn =
  "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]";

export function examFieldGrid(cols = 2) {
  return cols === 3
    ? "grid gap-3 sm:grid-cols-3"
    : cols === 4
      ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      : "grid gap-3 sm:grid-cols-2";
}
