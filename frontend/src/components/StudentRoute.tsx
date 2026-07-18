import type { ReactNode } from "react";
import ProtectedRoute from "./ProtectedRoute";

export default function StudentRoute({ children }: { children: ReactNode }) {
  return <ProtectedRoute roles={["student"]}>{children}</ProtectedRoute>;
}
