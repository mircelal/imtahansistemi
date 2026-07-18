import type { ReactNode } from "react";
import ProtectedRoute from "./ProtectedRoute";

export default function AdminRoute({ children }: { children: ReactNode }) {
  return <ProtectedRoute roles={["admin"]}>{children}</ProtectedRoute>;
}
