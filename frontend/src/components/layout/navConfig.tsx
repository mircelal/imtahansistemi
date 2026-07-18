import type { ReactNode } from "react";
import {
  IconBank,
  IconBook,
  IconChart,
  IconDoc,
  IconHome,
  IconLayout,
  IconProfile,
  IconScan,
  IconSliders,
  IconStudent,
  IconUsers
} from "../icons";

export type NavItem = {
  to: string;
  end?: boolean;
  label: string;
  icon: ReactNode;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export const studentNavGroups: NavGroup[] = [
  {
    id: "main",
    label: "Şagird kabineti",
    items: [
      { to: "/", end: true, label: "Kabinet", icon: <IconHome className="shrink-0" /> },
      { to: "/profil", label: "Profil və inkişaf", icon: <IconProfile className="shrink-0" /> }
    ]
  }
];

export const staffMainNavItems: NavItem[] = [
  { to: "/", end: true, label: "İdarə paneli", icon: <IconHome className="shrink-0" /> },
  { to: "/courses", label: "Kurslar", icon: <IconBook className="shrink-0" /> },
  { to: "/students", label: "Şagirdlər", icon: <IconStudent className="shrink-0" /> },
  { to: "/exams", label: "İmtahanlar", icon: <IconDoc className="shrink-0" /> }
];

export const staffToolsNavItems: NavItem[] = [
  { to: "/designer", label: "Cavab vərəqi", icon: <IconLayout className="shrink-0" /> },
  { to: "/scan", label: "Skan", icon: <IconScan className="shrink-0" /> },
  { to: "/reports", label: "Nəticələr", icon: <IconChart className="shrink-0" /> }
];

export const staffQuestionBankItem: NavItem = {
  to: "/question-bank",
  label: "Sual bazası",
  icon: <IconBank className="shrink-0" />
};

export const staffScoringProfilesItem: NavItem = {
  to: "/scoring-profiles",
  label: "Hesablama",
  icon: <IconSliders className="shrink-0" />,
};

export const adminNavItems: NavItem[] = [
  { to: "/admin/users", label: "İstifadəçilər", icon: <IconUsers className="shrink-0" /> },
  { to: "/admin/finance", label: "Maliyyə", icon: <IconChart className="shrink-0" /> },
  { to: "/admin/ticket-sales", label: "Bilet satışları", icon: <IconDoc className="shrink-0" /> },
  { to: "/admin/settings", label: "Sistem ayarları", icon: <IconSliders className="shrink-0" /> }
];

export function getStaffNavGroups(role: string | undefined): NavGroup[] {
  const groups: NavGroup[] = [
    { id: "main", label: "Ana Bölmələr", items: staffMainNavItems },
    { id: "tools", label: "Alətlər", items: [...staffToolsNavItems] }
  ];

  if (role === "admin" || role === "manager") {
    groups[1] = {
      ...groups[1]!,
      items: [...groups[1]!.items, staffQuestionBankItem, staffScoringProfilesItem]
    };
  }

  if (role === "admin") {
    groups.push({ id: "admin", label: "Admin Paneli", items: adminNavItems });
  }

  return groups;
}

export function getNavGroupsForRole(role: string | undefined): NavGroup[] {
  if (role === "student") return studentNavGroups;
  return getStaffNavGroups(role);
}
