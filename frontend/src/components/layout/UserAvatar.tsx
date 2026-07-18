import {
  getInitials,
  getRoleLabel,
  roleAvatarClasses,
  roleAvatarSidebarClasses,
  type UserRole
} from "../../design/tokens";

type UserAvatarProps = {
  fullName: string;
  role: string;
  size?: "sm" | "md" | "lg";
  variant?: "light" | "sidebar";
  className?: string;
};

const sizeClasses = {
  sm: "h-9 w-9 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm"
};

function resolveRole(role: string): UserRole {
  return (["admin", "manager", "operator", "student"].includes(role) ? role : "operator") as UserRole;
}

export default function UserAvatar({
  fullName,
  role,
  size = "md",
  variant = "light",
  className = ""
}: UserAvatarProps) {
  const roleKey = resolveRole(role);
  const initials = getInitials(fullName);
  const tone =
    variant === "sidebar" ? roleAvatarSidebarClasses[roleKey] : roleAvatarClasses[roleKey];

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide shadow-sm ${sizeClasses[size]} ${tone} ${className}`}
      title={`${fullName} · ${getRoleLabel(role)}`}
    >
      {initials}
    </div>
  );
}
