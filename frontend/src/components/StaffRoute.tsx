import type { ReactNode } from "react";
import ProtectedRoute from "./ProtectedRoute";

/** Admin və ya menecer — sual bazası kimi məhdud endpointlər üçün */
export default function StaffRoute({ children }: { children: ReactNode }) {
  return <ProtectedRoute roles={["admin", "manager"]}>{children}</ProtectedRoute>;
}
