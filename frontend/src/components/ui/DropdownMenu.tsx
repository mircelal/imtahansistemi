import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

export type DropdownMenuItem =
  | {
      type?: "action";
      label: string;
      icon?: ReactNode;
      onClick: () => void;
      variant?: "default" | "danger";
      disabled?: boolean;
    }
  | {
      type: "link";
      label: string;
      icon?: ReactNode;
      to: string;
      variant?: "default" | "danger";
    }
  | { type: "divider" };

type DropdownMenuProps = {
  items: DropdownMenuItem[];
  ariaLabel?: string;
  align?: "left" | "right";
};

export default function DropdownMenu({ items, ariaLabel = "Əməliyyatlar", align = "right" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass = (variant: "default" | "danger" = "default") =>
    variant === "danger"
      ? "text-red-600 hover:bg-red-50"
      : "text-slate-700 hover:bg-slate-100";

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 active:scale-95"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute z-50 mt-1 min-w-[196px] overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 py-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.04] backdrop-blur-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item, i) => {
            if (item.type === "divider") {
              return <div key={`d-${i}`} className="my-1 h-px bg-slate-100" role="separator" />;
            }

            const variant = item.variant ?? "default";
            const base = `flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium transition ${itemClass(variant)}`;

            if (item.type === "link") {
              return (
                <Link
                  key={item.label}
                  role="menuitem"
                  to={item.to}
                  className={base}
                  onClick={() => setOpen(false)}
                >
                  {item.icon ? <span className="text-slate-400">{item.icon}</span> : null}
                  {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`${base} disabled:cursor-not-allowed disabled:opacity-40`}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
              >
                {item.icon ? <span className={variant === "danger" ? "text-red-400" : "text-slate-400"}>{item.icon}</span> : null}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
