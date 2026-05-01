import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { getPublicSettings } from "./api/settings";
import { me } from "./api/auth";
import AdminRoute from "./components/AdminRoute";
import LoginPage from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import CoursesPage from "./pages/Courses";
import CoursePanelPage from "./pages/CoursePanel";
import ExamsPage from "./pages/Exams";
import StudentsPage from "./pages/Students";
import AnswerSheetDesignerPage from "./pages/AnswerSheetDesigner";
import ScanPanelPage from "./pages/ScanPanel";
import ReportsPage from "./pages/Reports";
import QuestionBankPage from "./pages/QuestionBank";
import AdminUsersPage from "./pages/AdminUsers";
import AdminSettingsPage from "./pages/AdminSettings";
import CourseStaffRoute from "./components/CourseStaffRoute";
import StaffRoute from "./components/StaffRoute";
import StudentRoute from "./components/StudentRoute";
import StudentProfilePage from "./pages/StudentProfile";
import { useAuthStore } from "./store/authStore";

const SIDEBAR_KEY = "omr_sidebar_collapsed";

/** Apple-əsaslı incə ikonlar (1.5px kontur) */
function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBook({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 16.5V5.5zM4 5.5A2.5 2.5 0 016.5 8H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDoc({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V7l-5-5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v5h5M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconLayout({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 9h18M9 9v12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconScan({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3H5a2 2 0 00-2 2v2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M17 21h2a2 2 0 002-2v-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconChart({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19V5M8 19v-6M12 19V9M16 19v-4M20 19v-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M13 7a4 4 0 11-8 0 4 4 0 018 0zM21 20v-1a3 3 0 00-3-3h-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconStudent({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 10v1M2 10v1M12 2L2 7l10 5 10-5-10-5zM4 12v6a2 2 0 002 2h12a2 2 0 002-2v-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 22v-6h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSliders({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16M8 12h8M10 18h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="6" r="1.5" fill="currentColor" />
      <circle cx="17" cy="12" r="1.5" fill="currentColor" />
      <circle cx="13" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconBank({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconProfile({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 20c0-4 4-6 6-6s6 2 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconChevronSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className={`text-[#86868b] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M14 7l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 17l5-5-5-5M15 12H3M14 7h5a2 2 0 012 2v6a2 2 0 01-2 2h-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type NavItem = {
  to: string;
  end?: boolean;
  label: string;
  icon: ReactNode;
};

const staffMainNav: NavItem[] = [
  { to: "/", end: true, label: "İdarə paneli", icon: <IconHome className="shrink-0" /> },
  { to: "/courses", label: "Kurslar", icon: <IconBook className="shrink-0" /> },
  { to: "/students", label: "Şagirdlər", icon: <IconStudent className="shrink-0" /> },
  { to: "/exams", label: "İmtahanlar", icon: <IconDoc className="shrink-0" /> },
  { to: "/designer", label: "Cavab vərəqi", icon: <IconLayout className="shrink-0" /> },
  { to: "/scan", label: "Skan", icon: <IconScan className="shrink-0" /> },
  { to: "/reports", label: "Nəticələr", icon: <IconChart className="shrink-0" /> }
];

const studentMainNav: NavItem[] = [
  { to: "/", end: true, label: "İdarə paneli", icon: <IconHome className="shrink-0" /> },
  { to: "/profil", label: "Profilim", icon: <IconProfile className="shrink-0" /> }
];

const adminNav: NavItem[] = [
  { to: "/admin/users", label: "İstifadəçilər", icon: <IconUsers className="shrink-0" /> },
  { to: "/admin/settings", label: "Sistem ayarları", icon: <IconSliders className="shrink-0" /> }
];

function App() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "1");

  const brandingQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: getPublicSettings,
    staleTime: 60_000
  });
  const systemName = brandingQuery.data?.system_name ?? "OMR imtahan sistemi";
  const hasLogo = brandingQuery.data?.has_logo ?? false;

  useEffect(() => {
    if (!token || user) return;
    me()
      .then((u) => setUser(u))
      .catch(() => logout());
  }, [token, user, setUser, logout]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  };

  const sidebarWidthPx = collapsed ? 80 : 264;
  const primaryNavItems = user?.role === "student" ? studentMainNav : staffMainNav;

  const navLinkClass = ({ isActive }: { isActive: boolean }) => {
    const base =
      "flex min-h-[2.75rem] items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium leading-tight tracking-tight transition-colors duration-200 ease-out";
    if (isActive) {
      return `${base} bg-white/[0.11] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]`;
    }
    return `${base} text-[#a1a1a6] hover:bg-white/[0.05] hover:text-[#f5f5f7]`;
  };

  const sidebarChrome = (
    <>
      {/* Brend + yığma */}
      <div className={`shrink-0 ${collapsed ? "px-2" : "px-3"}`}>
        <div className={`flex items-start ${collapsed ? "flex-col items-center gap-3" : "gap-2"}`}>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5">
            {hasLogo ? (
              <img
                src={`/api/settings/public/logo?v=${brandingQuery.dataUpdatedAt ?? 0}`}
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#636366]">İmtahan</p>
                <p className="mt-0.5 truncate text-[15px] font-semibold tracking-tight text-[#f5f5f7]">{systemName}</p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden rounded-full bg-white/[0.06] p-2 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1] md:flex md:items-center md:justify-center"
            title={collapsed ? "Paneli aç" : "Paneli bağla"}
            aria-label={collapsed ? "Paneli aç" : "Paneli bağla"}
          >
            <IconChevronSidebar collapsed={collapsed} />
          </button>
        </div>
      </div>

      {user ? (
        <div
          className={`sidebar-user-card mt-5 shrink-0 rounded-2xl bg-white/[0.05] ring-1 ring-white/[0.06] ${collapsed ? "mx-2 px-2 py-3" : "mx-3 px-3 py-3"}`}
        >
          {!collapsed ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[#636366]">Daxil olmusunuz</p>
              <p className="mt-1 truncate text-[13px] font-semibold text-[#f5f5f7]">{user.full_name}</p>
              <p className="mt-0.5 text-[11px] capitalize text-[#86868b]">
                {user.role === "student" ? "Şagird" : user.role}
              </p>
            </>
          ) : (
            <p
              className="text-center text-[11px] font-semibold tracking-wide text-[#f5f5f7]"
              title={user.full_name}
            >
              {user.full_name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </p>
          )}
        </div>
      ) : null}

      <nav className="sidebar-nav-scroll mt-5 min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2 pb-2 pt-1">
        {primaryNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `${navLinkClass({ isActive })} ${collapsed ? "justify-center px-2" : ""}`}
            title={collapsed ? item.label : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {({ isActive }) => (
              <>
                <span className={`shrink-0 ${isActive ? "text-[#0a84ff]" : "text-[#86868b]"}`}>{item.icon}</span>
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </>
            )}
          </NavLink>
        ))}
        {user?.role === "admin" || user?.role === "manager" ? (
          <NavLink
            to="/question-bank"
            className={({ isActive }) => `${navLinkClass({ isActive })} ${collapsed ? "justify-center px-2" : ""}`}
            title={collapsed ? "Sual bazası" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {({ isActive }) => (
              <>
                <span className={`shrink-0 ${isActive ? "text-[#0a84ff]" : "text-[#86868b]"}`}>
                  <IconBank className="shrink-0" />
                </span>
                {!collapsed ? <span className="truncate">Sual bazası</span> : null}
              </>
            )}
          </NavLink>
        ) : null}
        {user?.role === "admin" ? (
          <>
            {!collapsed ? (
              <p className="mb-1.5 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#636366]">
                Admin
              </p>
            ) : (
              <div className="mx-2 my-3 h-px bg-white/[0.08]" />
            )}
            {adminNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `${navLinkClass({ isActive })} ${collapsed ? "justify-center px-2" : ""}`}
                title={collapsed ? item.label : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <span className={`shrink-0 ${isActive ? "text-[#0a84ff]" : "text-[#86868b]"}`}>{item.icon}</span>
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </>
                )}
              </NavLink>
            ))}
          </>
        ) : null}
      </nav>
    </>
  );

  const sidebarFooter = user ? (
    <div className="shrink-0 border-t border-white/[0.08] bg-[#1d1d1f]/95 px-3 py-3 backdrop-blur-md">
      <button
        type="button"
        aria-label="Çıxış"
        className={`flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.07] py-2.5 text-[13px] font-medium text-[#f5f5f7] ring-1 ring-white/[0.08] transition hover:bg-white/[0.11] active:scale-[0.99] ${collapsed ? "px-2" : "px-3"}`}
        onClick={() => {
          logout();
          setMenuOpen(false);
        }}
      >
        <IconLogout className="shrink-0 text-[#a1a1a6]" />
        {!collapsed ? <span>Çıxış</span> : null}
      </button>
    </div>
  ) : null;

  if (!token) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f7] md:h-screen md:max-h-screen md:flex-row md:overflow-hidden print:h-auto print:max-h-none print:overflow-visible">
      <header className="flex shrink-0 items-center justify-between border-b border-black/[0.06] bg-white/80 px-4 py-3 backdrop-blur-xl print:hidden md:hidden">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 font-semibold tracking-tight text-[#1d1d1f]">
          {hasLogo ? (
            <img
              src={`/api/settings/public/logo?v=${brandingQuery.dataUpdatedAt ?? 0}`}
              alt=""
              className="h-8 w-auto object-contain"
            />
          ) : null}
          <span className="truncate">{systemName}</span>
        </Link>
        <button
          type="button"
          className="rounded-full bg-[#f5f5f7] px-3.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] ring-1 ring-black/[0.06] transition hover:bg-[#e8e8ed]"
          aria-expanded={menuOpen}
          aria-label="Menyu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          Menyu
        </button>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] md:hidden"
          aria-hidden
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Sidebar: mobildə tam hündürlük; masaüstündə viewport hündürlüyü, məzmundan asılı deyil */}
      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-50 flex h-full max-h-[100dvh] w-[min(85vw,288px)] flex-col border-r border-black/[0.08] bg-[#1d1d1f] shadow-[8px_0_32px_rgba(0,0,0,0.18)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] print:hidden md:static md:h-screen md:max-h-[100dvh] md:w-[var(--sidebar-w)] md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-[4px_0_24px_rgba(0,0,0,0.06)] ${
          menuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={
          {
            ["--sidebar-w" as string]: `${sidebarWidthPx}px`
          } as CSSProperties
        }
      >
        <div className="flex h-full max-h-screen min-h-0 w-full flex-col md:max-h-screen md:shrink-0">
          <div className="flex min-h-0 flex-1 flex-col pt-5">{sidebarChrome}</div>
          {sidebarFooter}
        </div>
      </aside>

      <main className="app-main min-h-0 flex-1 overflow-y-auto p-4 md:p-8 print:overflow-visible print:bg-white print:p-4">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route
            path="/profil"
            element={
              <StudentRoute>
                <StudentProfilePage />
              </StudentRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:courseId" element={<CoursePanelPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/yarat" element={<ExamsPage />} />
          <Route
            path="/question-bank"
            element={
              <StaffRoute>
                <QuestionBankPage />
              </StaffRoute>
            }
          />
          <Route
            path="/designer"
            element={
              <CourseStaffRoute>
                <AnswerSheetDesignerPage />
              </CourseStaffRoute>
            }
          />
          <Route path="/answer-sheet-presets" element={<Navigate to="/designer" replace />} />
          <Route path="/scan" element={<ScanPanelPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsersPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminRoute>
                <AdminSettingsPage />
              </AdminRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
