import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchDashboardOverview } from "../../api/dashboard";
import { getPublicSettings } from "../../api/settings";
import { fetchStudentProfile } from "../../api/studentPortal";
import { useAuthStore } from "../../store/authStore";
import StudentDashboardSection from "../Student/StudentDashboardSection";
import StaffDashboard from "./components/StaffDashboard";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const enabled = Boolean(token);
  const isStudent = user?.role === "student";

  const brandingQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: getPublicSettings,
    staleTime: 60_000,
  });
  const systemName = brandingQuery.data?.system_name ?? "OMR imtahan sistemi";

  const studentProfileQuery = useQuery({
    queryKey: ["me-student-profile"],
    queryFn: fetchStudentProfile,
    enabled: enabled && isStudent,
  });

  const dashboardQuery = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: fetchDashboardOverview,
    enabled: enabled && !isStudent,
    staleTime: 30_000,
  });

  if (isStudent) {
    const spLoading = studentProfileQuery.isLoading;
    const spErr = studentProfileQuery.isError;
    const sp = studentProfileQuery.data;

    if (spLoading) {
      return (
        <div className="page-container space-y-10 pb-8">
          <div className="h-40 animate-pulse rounded-3xl bg-slate-200/80" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200/80" />
            ))}
          </div>
        </div>
      );
    }

    if (spErr || !sp) {
      return (
        <div className="page-container pb-8">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
            Profil məlumatı yüklənmədi. Administrator şagird hesabınızı düzgün qeydiyyata bağlayıb-bağlamadığını yoxlayın.
          </div>
        </div>
      );
    }

    return (
      <StudentDashboardSection
        profile={sp}
        systemName={systemName}
        userName={user?.full_name ?? sp.student.full_name}
      />
    );
  }

  if (!token) {
    return (
      <div className="page-container pb-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-950 shadow-sm">
          <Link className="font-semibold text-indigo-700 underline-offset-2 hover:underline" to="/login">
            Giriş
          </Link>{" "}
          — idarə paneli üçün autentifikasiya lazımdır.
        </div>
      </div>
    );
  }

  if (dashboardQuery.isLoading) {
    return (
      <div className="page-container space-y-6 pb-8">
        <div className="h-44 animate-pulse rounded-3xl bg-slate-200/80" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/80" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200/80 lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200/80" />
        </div>
      </div>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <div className="page-container pb-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
          İdarə paneli yüklənmədi. Səhifəni yeniləyin və ya bir az sonra təkrar cəhd edin.
        </div>
      </div>
    );
  }

  return (
    <StaffDashboard
      data={dashboardQuery.data}
      systemName={systemName}
      userName={user?.full_name ?? "İstifadəçi"}
      userRole={user?.role ?? "operator"}
    />
  );
}
