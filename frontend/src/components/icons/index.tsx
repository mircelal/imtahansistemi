/** Unified icon library — 20px, 1.5px stroke, Apple-inspired line style. */

import type { ReactNode } from "react";

type IconProps = { className?: string; size?: number };

function IconBase({
  className,
  size = 20,
  children,
  viewBox = "0 0 24 24"
}: IconProps & { children: ReactNode; viewBox?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox={viewBox} fill="none" aria-hidden>
      {children}
    </svg>
  );
}

export function IconHome({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

export function IconBook({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <path
        d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 16.5V5.5zM4 5.5A2.5 2.5 0 016.5 8H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </IconBase>
  );
}

export function IconDoc({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <path
        d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V7l-5-5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v5h5M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconLayout({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 9h18M9 9v12" stroke="currentColor" strokeWidth="1.5" />
    </IconBase>
  );
}

export function IconScan({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <path
        d="M7 3H5a2 2 0 00-2 2v2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M17 21h2a2 2 0 002-2v-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconChart({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <path d="M4 19V5M8 19v-6M12 19V9M16 19v-4M20 19v-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconUsers({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <path
        d="M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M13 7a4 4 0 11-8 0 4 4 0 018 0zM21 20v-1a3 3 0 00-3-3h-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </IconBase>
  );
}

export function IconStudent({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <path
        d="M22 10v1M2 10v1M12 2L2 7l10 5 10-5-10-5zM4 12v6a2 2 0 002 2h12a2 2 0 002-2v-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 22v-6h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconSliders({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <path d="M4 6h16M8 12h8M10 18h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="6" r="1.5" fill="currentColor" />
      <circle cx="17" cy="12" r="1.5" fill="currentColor" />
      <circle cx="13" cy="18" r="1.5" fill="currentColor" />
    </IconBase>
  );
}

export function IconBank({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </IconBase>
  );
}

export function IconProfile({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 20c0-4 4-6 6-6s6 2 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconChevronSidebar({ collapsed, className }: { collapsed: boolean; className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className={`text-sidebar-muted transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? "rotate-180" : ""} ${className ?? ""}`}
      aria-hidden
    >
      <path d="M14 7l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconLogout({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size ?? 18}>
      <path
        d="M10 17l5-5-5-5M15 12H3M14 7h5a2 2 0 012 2v6a2 2 0 01-2 2h-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

export function IconMenu({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function IconCourse({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size ?? 22}>
      <path
        d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 16.5V5.5zM4 5.5A2.5 2.5 0 016.5 8H20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </IconBase>
  );
}

export function IconExam({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size ?? 22}>
      <path
        d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V7l-5-5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

export function IconPulse({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size ?? 22}>
      <path d="M4 19V5M8 19v-6M12 19V9M16 19v-4M20 19v-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconMoreVertical({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size ?? 20}>
      <circle cx="12" cy="6" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
    </IconBase>
  );
}

export function IconEye({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size ?? 18}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </IconBase>
  );
}

export function IconPencil({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size ?? 18}>
      <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M13 7l4 4" stroke="currentColor" strokeWidth="1.5" />
    </IconBase>
  );
}

export function IconCopy({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size ?? 18}>
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5" />
    </IconBase>
  );
}

export function IconTrash({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size ?? 18}>
      <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M7 7l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconPlus({ className, size }: IconProps) {
  return (
    <IconBase className={className} size={size ?? 18}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </IconBase>
  );
}
