type PoweredByMirTechProps = {
  /** Sidebar (dark) or login screen */
  variant?: "sidebar" | "login";
  className?: string;
};

const MIRTECH_URL = "https://mirtech.az";

export default function PoweredByMirTech({ variant = "sidebar", className = "" }: PoweredByMirTechProps) {
  const isSidebar = variant === "sidebar";

  return (
    <p
      className={`text-center leading-snug ${
        isSidebar ? "text-[10px] text-sidebar-muted" : "text-xs text-slate-500"
      } ${className}`}
    >
      Powered by{" "}
      <a
        href={MIRTECH_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`font-medium transition ${
          isSidebar
            ? "text-[#86868b] hover:text-sidebar-active hover:underline"
            : "text-slate-400 hover:text-white hover:underline"
        }`}
      >
        MirTech
      </a>
    </p>
  );
}
