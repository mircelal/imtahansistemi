import Badge from "../ui/Badge";
import { getRoleLabel, type UserRole } from "../../design/tokens";
import UserAvatar from "./UserAvatar";

type SidebarUserCardProps = {
  fullName: string;
  role: string;
  collapsed: boolean;
};

function toUserRole(role: string): UserRole {
  return (["admin", "manager", "operator", "student"].includes(role) ? role : "operator") as UserRole;
}

export default function SidebarUserCard({ fullName, role, collapsed }: SidebarUserCardProps) {
  const roleKey = toUserRole(role);

  if (collapsed) {
    return (
      <div className="mx-2 mt-5 flex justify-center">
        <UserAvatar fullName={fullName} role={role} size="sm" variant="sidebar" />
      </div>
    );
  }

  return (
    <div className="mx-3 mt-5 shrink-0">
      <div className="flex items-center gap-3 rounded-xl bg-[#2c2c2e]/90 px-3 py-3 ring-1 ring-white/[0.1]">
        <UserAvatar fullName={fullName} role={role} size="sm" variant="sidebar" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[#f5f5f7]">{fullName}</p>
          <div className="mt-1.5">
            <Badge role={roleKey} surface="dark">
              {getRoleLabel(role)}
            </Badge>
          </div>
        </div>
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
          title="Aktiv sessiya"
          aria-hidden
        />
      </div>
    </div>
  );
}
