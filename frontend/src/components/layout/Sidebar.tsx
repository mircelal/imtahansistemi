import type { CSSProperties } from "react";
import { NavLink } from "react-router-dom";
import {
  IconChevronSidebar,
  IconLogout
} from "../icons";
import { getNavGroupsForRole } from "./navConfig";
import SidebarUserCard from "./SidebarUserCard";
import PoweredByMirTech from "../PoweredByMirTech";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavClick: () => void;
  systemName: string;
  hasLogo: boolean;
  logoVersion: number;
  user: { full_name: string; role: string } | null;
  onLogout: () => void;
  sidebarWidthPx: number;
  menuOpen: boolean;
};

function navLinkClass({ isActive }: { isActive: boolean }) {
  const base =
    "group/nav relative flex min-h-[2.75rem] items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium leading-tight tracking-tight transition-colors duration-200 ease-out";
  if (isActive) {
    return `${base} bg-white/[0.11] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]`;
  }
  return `${base} text-sidebar-text hover:bg-white/[0.05] hover:text-sidebar-active`;
}

function NavGroupLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="mx-2 my-3 h-px bg-white/[0.08]" aria-hidden />;
  }
  return (
    <p className="mb-1.5 mt-5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted first:mt-0">
      {label}
    </p>
  );
}

export default function Sidebar({
  collapsed,
  onToggleCollapsed,
  onNavClick,
  systemName,
  hasLogo,
  logoVersion,
  user,
  onLogout,
  sidebarWidthPx,
  menuOpen
}: SidebarProps) {
  const navGroups = getNavGroupsForRole(user?.role);

  return (
    <aside
      className={`app-sidebar fixed inset-y-0 left-0 z-50 flex h-full max-h-[100dvh] w-[min(85vw,288px)] flex-col border-r border-black/[0.08] bg-sidebar-bg shadow-[8px_0_32px_rgba(0,0,0,0.18)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] print:hidden md:static md:h-screen md:max-h-[100dvh] md:w-[var(--sidebar-w)] md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-[4px_0_24px_rgba(0,0,0,0.06)] ${
        menuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}
      style={{ ["--sidebar-w" as string]: `${sidebarWidthPx}px` } as CSSProperties}
    >
      <div className="flex h-full max-h-screen min-h-0 w-full flex-col md:max-h-screen md:shrink-0">
        <div className="flex min-h-0 flex-1 flex-col pt-5">
          {/* Brand */}
          <div className={`shrink-0 ${collapsed ? "px-2" : "px-3"}`}>
            <div className={`flex items-start ${collapsed ? "flex-col items-center gap-3" : "gap-2"}`}>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5">
                {hasLogo ? (
                  <img
                    src={`/api/settings/public/logo?v=${logoVersion}`}
                    alt=""
                    className={`object-contain ${collapsed ? "h-9 w-9" : "h-10 max-w-[148px]"}`}
                  />
                ) : (
                  <div
                    className={`flex items-center justify-center rounded-[14px] bg-gradient-to-b from-[#424245] to-[#2c2c2e] text-[11px] font-semibold tracking-tight text-white shadow-inner ring-1 ring-white/10 ${collapsed ? "h-9 w-9" : "h-10 w-10"}`}
                  >
                    OMR
                  </div>
                )}
                {!collapsed ? (
                  <div className="w-full min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">İmtahan</p>
                    <p className="mt-0.5 truncate text-[15px] font-semibold tracking-tight text-sidebar-active">{systemName}</p>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="hidden rounded-full bg-white/[0.06] p-2 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1] md:flex md:items-center md:justify-center"
                title={collapsed ? "Paneli aç" : "Paneli bağla"}
                aria-label={collapsed ? "Paneli aç" : "Paneli bağla"}
              >
                <IconChevronSidebar collapsed={collapsed} />
              </button>
            </div>
          </div>

          {/* User card */}
          {user ? <SidebarUserCard fullName={user.full_name} role={user.role} collapsed={collapsed} /> : null}

          {/* Navigation */}
          <nav className="sidebar-nav-scroll mt-5 min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2 pb-2 pt-1">
            {navGroups.map((group) => (
              <div key={group.id}>
                <NavGroupLabel label={group.label} collapsed={collapsed} />
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `${navLinkClass({ isActive })} ${collapsed ? "justify-center px-2" : ""}`}
                    title={collapsed ? item.label : undefined}
                    onClick={onNavClick}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`shrink-0 ${isActive ? "text-brand" : "text-[#86868b]"}`}>{item.icon}</span>
                        {!collapsed ? <span className="truncate">{item.label}</span> : null}
                        {collapsed ? (
                          <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-lg bg-[#2c2c2e] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover/nav:opacity-100 md:group-hover/nav:block">
                            {item.label}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>

        {/* Footer logout */}
        {user ? (
          <div className="shrink-0 border-t border-white/[0.08] bg-sidebar-bg/95 px-3 py-3 backdrop-blur-md">
            <button
              type="button"
              aria-label="Çıxış"
              className={`flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.07] py-2.5 text-[13px] font-medium text-sidebar-active ring-1 ring-white/[0.08] transition hover:bg-white/[0.11] active:scale-[0.99] ${collapsed ? "px-2" : "px-3"}`}
              onClick={onLogout}
            >
              <IconLogout className="shrink-0 text-sidebar-text" />
              {!collapsed ? <span>Çıxış</span> : null}
            </button>
            {!collapsed ? <PoweredByMirTech variant="sidebar" className="mt-3 px-1" /> : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
