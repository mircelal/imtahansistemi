import type { ReactNode } from "react";
import ProtectedRoute from "./ProtectedRoute";

/** Administrator, menecer və operator — cavab kartı dizaynı kimi kurs əməliyyatları üçün */
export default function CourseStaffRoute({ children }: { children: ReactNode }) {
  return <ProtectedRoute roles={["admin", "manager", "operator"]}>{children}</ProtectedRoute>;
}
