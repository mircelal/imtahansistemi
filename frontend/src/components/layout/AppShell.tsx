import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { me } from "../../api/auth";
import { getPublicSettings } from "../../api/settings";
import AdminRoute from "../AdminRoute";
import CourseStaffRoute from "../CourseStaffRoute";
import StaffRoute from "../StaffRoute";
import StudentRoute from "../StudentRoute";
import { SIDEBAR_STORAGE_KEY } from "../../design/tokens";
import { useAuthStore } from "../../store/authStore";
import LoginPage from "../../pages/Login";
import DashboardPage from "../../pages/Dashboard";
import CoursesPage from "../../pages/Courses";
import CoursePanelPage from "../../pages/CoursePanel";
import ExamsPage from "../../pages/Exams";
import ExamDashboardPage from "../../pages/ExamDashboard";
import StudentsPage from "../../pages/Students";
import AnswerSheetDesignerPage from "../../pages/AnswerSheetDesigner";
import ScanPanelPage from "../../pages/ScanPanel";
import ReportsPage from "../../pages/Reports";
import QuestionBankPage from "../../pages/QuestionBank";
import ExamScoringProfilesPage from "../../pages/ExamScoringProfiles";
import AdminUsersPage from "../../pages/AdminUsers";
import AdminSettingsPage from "../../pages/AdminSettings";
import AdminTicketSalesPage from "../../pages/AdminTicketSales";
import AdminFinancePage from "../../pages/AdminFinance";
import StudentProfilePage from "../../pages/StudentProfile";
import StudentExamDetailPage from "../../pages/Student/StudentExamDetailPage";
import PublicTicketCheckoutPage from "../../pages/PublicTicketCheckout";
import MockPaymentPage from "../../pages/MockPayment";
import AuthBootScreen from "../AuthBootScreen";
import MobileHeader from "./MobileHeader";
import Sidebar from "./Sidebar";

function isPublicPath(pathname: string): boolean {
  return pathname.startsWith("/biletle/") || pathname.startsWith("/payments/mock/");
}

export default function AppShell() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");

  const brandingQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: getPublicSettings,
    staleTime: 60_000
  });
  const systemName = brandingQuery.data?.system_name ?? "OMR imtahan sistemi";
  const hasLogo = brandingQuery.data?.has_logo ?? false;
  const logoVersion = brandingQuery.dataUpdatedAt ?? 0;

  useEffect(() => {
    if (!token || user) return;
    me()
      .then((u) => setUser(u))
      .catch(() => logout());
  }, [token, user, setUser, logout]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const sidebarWidthPx = collapsed ? 80 : 264;
  const authBooting = Boolean(token && !user);
  const location = useLocation();
  const isDesignerRoute = location.pathname.startsWith("/designer");
  const publicCheckout = isPublicPath(location.pathname);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
  };

  if (publicCheckout) {
    return (
      <Routes>
        <Route path="/biletle/:ticketId" element={<PublicTicketCheckoutPage />} />
        <Route path="/payments/mock/:publicId" element={<MockPaymentPage />} />
      </Routes>
    );
  }

  if (!token) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface md:h-screen md:max-h-screen md:flex-row md:overflow-hidden print:h-auto print:max-h-none print:overflow-visible">
      <MobileHeader
        systemName={systemName}
        hasLogo={hasLogo}
        logoVersion={logoVersion}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((o) => !o)}
        user={user}
      />

      {menuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] md:hidden"
          aria-hidden
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onNavClick={() => setMenuOpen(false)}
        systemName={systemName}
        hasLogo={hasLogo}
        logoVersion={logoVersion}
        user={user}
        onLogout={handleLogout}
        sidebarWidthPx={sidebarWidthPx}
        menuOpen={menuOpen}
      />

      <main
        className={`app-main flex min-h-0 flex-1 flex-col ${
          isDesignerRoute
            ? "overflow-hidden p-0"
            : "overflow-y-auto p-4 sm:p-6 lg:p-8 xl:px-10 print:overflow-visible print:bg-white print:p-4"
        }`}
      >
        {authBooting ? (
          <AuthBootScreen />
        ) : (
        <div className={isDesignerRoute ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "contents"}>
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
          <Route
            path="/profil/imtahan/:examId"
            element={
              <StudentRoute>
                <StudentExamDetailPage />
              </StudentRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/courses"
            element={
              <CourseStaffRoute>
                <CoursesPage />
              </CourseStaffRoute>
            }
          />
          <Route
            path="/courses/:courseId"
            element={
              <CourseStaffRoute>
                <CoursePanelPage />
              </CourseStaffRoute>
            }
          />
          <Route
            path="/students"
            element={
              <CourseStaffRoute>
                <StudentsPage />
              </CourseStaffRoute>
            }
          />
          <Route
            path="/exams"
            element={
              <StaffRoute>
                <ExamsPage />
              </StaffRoute>
            }
          />
          <Route
            path="/exams/yarat"
            element={
              <StaffRoute>
                <ExamsPage />
              </StaffRoute>
            }
          />
          <Route
            path="/exams/:examId/dashboard"
            element={
              <StaffRoute>
                <ExamDashboardPage />
              </StaffRoute>
            }
          />
          <Route
            path="/question-bank"
            element={
              <StaffRoute>
                <QuestionBankPage />
              </StaffRoute>
            }
          />
          <Route
            path="/scoring-profiles"
            element={
              <StaffRoute>
                <ExamScoringProfilesPage />
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
            <Route
            path="/scan"
            element={
              <CourseStaffRoute>
                <ScanPanelPage />
              </CourseStaffRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <StaffRoute>
                <ReportsPage />
              </StaffRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsersPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/finance"
            element={
              <AdminRoute>
                <AdminFinancePage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/ticket-sales"
            element={
              <AdminRoute>
                <AdminTicketSalesPage />
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
        </div>
        )}
      </main>
    </div>
  );
}
