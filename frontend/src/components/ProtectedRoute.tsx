import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { UserRole } from "../design/tokens";
import { useAuthStore } from "../store/authStore";
import AuthBootScreen from "./AuthBootScreen";

type ProtectedRouteProps = {
  children: ReactNode;
  roles: UserRole[];
  redirectTo?: string;
};

export default function ProtectedRoute({ children, roles, redirectTo = "/" }: ProtectedRouteProps) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  if (token && !user) {
    return <AuthBootScreen />;
  }

  if (!user || !roles.includes(user.role as UserRole)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
