import { Link } from "react-router-dom";
import { IconMenu } from "../icons";
import UserAvatar from "./UserAvatar";

type MobileHeaderProps = {
  systemName: string;
  hasLogo: boolean;
  logoVersion: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  user: { full_name: string; role: string } | null;
};

export default function MobileHeader({
  systemName,
  hasLogo,
  logoVersion,
  menuOpen,
  onToggleMenu,
  user
}: MobileHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-black/[0.06] bg-white/80 px-4 py-3 backdrop-blur-xl print:hidden md:hidden">
      <Link to="/" className="flex min-w-0 items-center gap-2.5 font-semibold tracking-tight text-slate-900">
        {hasLogo ? (
          <img
            src={`/api/settings/public/logo?v=${logoVersion}`}
            alt=""
            className="h-8 w-auto object-contain"
          />
        ) : null}
        <span className="truncate">{systemName}</span>
      </Link>
      <div className="flex items-center gap-2">
        {user ? <UserAvatar fullName={user.full_name} role={user.role} size="sm" /> : null}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-slate-900 ring-1 ring-black/[0.06] transition hover:bg-[#e8e8ed]"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Menyunu bağla" : "Menyunu aç"}
          onClick={onToggleMenu}
        >
          <IconMenu open={menuOpen} />
        </button>
      </div>
    </header>
  );
}
