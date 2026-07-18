/** Brand and layout design tokens — single source of truth for UI theming. */

export const colors = {
  sidebar: {
    bg: "#1d1d1f",
    text: "#a1a1a6",
    textActive: "#f5f5f7",
    muted: "#636366",
    subtle: "#3a3a3c",
    accent: "#0a84ff"
  },
  surface: {
    bg: "#f5f5f7",
    card: "#ffffff",
    border: "#e5e7eb",
    text: "#1d1d1f"
  },
  brand: {
    DEFAULT: "#0a84ff",
    dark: "#0071e3"
  }
} as const;

export type UserRole = "admin" | "manager" | "operator" | "student";

export const roleLabels: Record<UserRole, string> = {
  admin: "Administrator",
  manager: "Menecer",
  operator: "Operator",
  student: "Şagird"
};

export const roleBadgeClasses: Record<UserRole, string> = {
  admin: "bg-violet-500/15 text-violet-800 ring-violet-500/25",
  manager: "bg-sky-500/15 text-sky-800 ring-sky-500/25",
  operator: "bg-amber-500/15 text-amber-800 ring-amber-500/25",
  student: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/25"
};

/** Rol badge — qaranlıq sidebar / header üçün */
export const roleBadgeSidebarClasses: Record<UserRole, string> = {
  admin: "bg-violet-500/25 text-violet-100 ring-violet-400/35",
  manager: "bg-sky-500/25 text-sky-100 ring-sky-400/35",
  operator: "bg-amber-500/25 text-amber-100 ring-amber-400/35",
  student: "bg-emerald-500/25 text-emerald-100 ring-emerald-400/35"
};

export const roleAvatarClasses: Record<UserRole, string> = {
  admin: "bg-violet-600 text-white",
  manager: "bg-sky-600 text-white",
  operator: "bg-amber-600 text-white",
  student: "bg-emerald-600 text-white"
};

/** Avatar — qaranlıq sidebar konteksti */
export const roleAvatarSidebarClasses: Record<UserRole, string> = {
  admin: "bg-gradient-to-br from-violet-500 to-violet-700 text-white ring-2 ring-violet-400/30",
  manager: "bg-gradient-to-br from-sky-500 to-sky-700 text-white ring-2 ring-sky-400/30",
  operator: "bg-gradient-to-br from-amber-500 to-amber-700 text-white ring-2 ring-amber-400/30",
  student: "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white ring-2 ring-emerald-400/30"
};

export function getRoleLabel(role: string): string {
  return roleLabels[role as UserRole] ?? role;
}

export function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const SIDEBAR_STORAGE_KEY = "omr_sidebar_collapsed";

/** Main content area max widths — tuned for large admin / exam workflows. */
export const layout = {
  contentMax: "1600px",
  contentWideMax: "1920px",
  sidebarExpanded: 264,
  sidebarCollapsed: 80
} as const;
