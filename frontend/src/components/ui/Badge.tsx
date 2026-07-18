import type { ReactNode } from "react";
import { roleBadgeClasses, roleBadgeSidebarClasses, type UserRole } from "../../design/tokens";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";
type BadgeSurface = "light" | "dark";

type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
  role?: UserRole;
  surface?: BadgeSurface;
  className?: string;
};

const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-800 ring-amber-500/20",
  error: "bg-red-500/15 text-red-800 ring-red-500/20",
  info: "bg-sky-500/15 text-sky-800 ring-sky-500/20",
  neutral: "bg-slate-500/10 text-slate-700 ring-slate-500/15"
};

export default function Badge({ children, variant = "neutral", role, surface = "light", className = "" }: BadgeProps) {
  const tone = role
    ? surface === "dark"
      ? roleBadgeSidebarClasses[role]
      : roleBadgeClasses[role]
    : variantClasses[variant];

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ${tone} ${className}`}
    >
      {children}
    </span>
  );
}
