import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/** Admin və ya menecer — sual bazası kimi məhdud endpointlər üçün */
export default function StaffRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== "admin" && user?.role !== "manager") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
