import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { getCourseDashboard } from "../../api/courses";
import { useAuthStore } from "../../store/authStore";
import CoursePanelHeader from "./CoursePanelHeader";
import { COURSE_PANEL_TABS, type CoursePanelTabId } from "./coursePanelUtils";
import ExamsTab from "./tabs/ExamsTab";
import OperatorsTab from "./tabs/OperatorsTab";
import OverviewTab from "./tabs/OverviewTab";
import StudentsTab from "./tabs/StudentsTab";
import TicketsTab from "./tabs/TicketsTab";
import FinanceTab from "./tabs/FinanceTab";

export default function CoursePanelPage() {
  const { courseId: courseIdParam } = useParams<{ courseId: string }>();
  const courseId = Number(courseIdParam);
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const canManageOperators = user?.role === "admin" || user?.role === "manager";

  const tabParam = params.get("tab") as CoursePanelTabId | null;
  const activeTab: CoursePanelTabId =
    tabParam && COURSE_PANEL_TABS.some((t) => t.id === tabParam) ? tabParam : "overview";

  const dashboardQ = useQuery({
    queryKey: ["course-dashboard", courseId],
    queryFn: () => getCourseDashboard(courseId)
  });

  const setTab = (tab: CoursePanelTabId) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "overview") next.delete("tab");
      else next.set("tab", tab);
      return next;
    });
  };

  const dashboard = dashboardQ.data;

  if (!Number.isFinite(courseId)) {
    return <p className="text-red-600">Yanlış kurs identifikatoru.</p>;
  }

  return (
    <div className="page-container-wide space-y-6">
      <CoursePanelHeader courseId={courseId} dashboard={dashboard} isLoading={dashboardQ.isLoading} />

      <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-px">
        {COURSE_PANEL_TABS.map((t) => {
          if (t.id === "operators" && !canManageOperators) return null;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
                active
                  ? "border border-b-white border-slate-200 bg-white text-brand shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {dashboardQ.isError ? (
        <p className="text-red-600">Kurs məlumatı yüklənmədi.</p>
      ) : dashboardQ.isLoading ? (
        <p className="text-slate-600">Yüklənir…</p>
      ) : dashboard ? (
        <>
          {activeTab === "overview" && (
            <OverviewTab
              dashboard={dashboard}
              onGoTickets={() => setTab("tickets")}
              onGoFinance={() => setTab("finance")}
            />
          )}
          {activeTab === "exams" && (
            <ExamsTab
              courseId={courseId}
              ownExams={dashboard.exams_own}
              platformExams={dashboard.exams_platform_open}
              onGoTickets={() => setTab("tickets")}
            />
          )}
          {activeTab === "tickets" && (
            <TicketsTab
              courseId={courseId}
              ownExams={dashboard.exams_own}
              platformExams={dashboard.exams_platform_open}
            />
          )}
          {activeTab === "finance" && <FinanceTab courseId={courseId} dashboard={dashboard} />}
          {activeTab === "students" && <StudentsTab />}
          {activeTab === "operators" && <OperatorsTab courseId={courseId} canManage={canManageOperators} />}
        </>
      ) : null}
    </div>
  );
}
