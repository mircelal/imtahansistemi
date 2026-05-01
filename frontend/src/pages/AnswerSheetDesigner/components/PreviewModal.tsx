import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Cavab açarı kimi geniş dialoq */
  wide?: boolean;
  title?: string;
};

export default function PreviewModal({ open, onClose, children, wide, title }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const shell = wide
    ? "relative flex max-h-[min(92vh,900px)] w-full max-w-[min(1200px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
    : "card relative max-h-[90vh] max-w-4xl overflow-auto shadow-2xl";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 sm:p-4"
      role="dialog"
      aria-modal
      aria-labelledby={title ? "modal-title" : undefined}
      onClick={onClose}
    >
      <div className={shell} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 pr-3 sm:px-5">
          {title ? (
            <h2 id="modal-title" className="text-[15px] font-semibold tracking-tight text-slate-900">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-[13px] font-medium text-slate-800 hover:bg-slate-200"
            onClick={onClose}
          >
            Bağla
          </button>
        </div>
        <div
          className={`min-h-0 flex-1 overflow-hidden ${wide ? "flex min-h-[min(78vh,760px)] flex-col" : "overflow-auto pt-2"}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
