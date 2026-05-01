import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/** Administrator, menecer və operator — cavab kartı dizaynı kimi kurs əməliyyatları üçün */
export default function CourseStaffRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const r = user?.role;
  if (r !== "admin" && r !== "manager" && r !== "operator") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
