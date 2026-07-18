import type { ReactNode } from "react";
import type { ReportOverview } from "../../../api/reports";
import { IconExam, IconPulse, IconScan, IconStudent } from "../../../components/icons";

type Props = {
  totals: ReportOverview["totals"];
};

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  gradient,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  gradient: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/60 bg-white/90 p-4 shadow-sm ring-1 ring-slate-200/60 ${gradient}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="rounded-xl bg-white/90 p-2 text-slate-600 ring-1 ring-slate-200/80">{icon}</div>
      </div>
    </div>
  );
}

export default function ReportsOverviewKpis({ totals }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="İmtahanlar"
        value={totals.exam_count}
        subtitle={`${totals.exams_with_results} nəticəli`}
        icon={<IconExam className="h-5 w-5" />}
        gradient="bg-gradient-to-br from-violet-50/90 to-white"
      />
      <KpiCard
        title="İştirakçılar"
        value={totals.total_participants}
        subtitle="Unikal şagird"
        icon={<IconStudent className="h-5 w-5" />}
        gradient="bg-gradient-to-br from-sky-50/90 to-white"
      />
      <KpiCard
        title="Skan sətirləri"
        value={totals.total_scan_rows}
        subtitle="Bütün imtahanlar"
        icon={<IconScan className="h-5 w-5" />}
        gradient="bg-gradient-to-br from-emerald-50/90 to-white"
      />
      <KpiCard
        title="Aktivlik"
        value={totals.exams_with_results > 0 ? "Var" : "Gözləyir"}
        subtitle={totals.exams_with_results > 0 ? "Skan məlumatı mövcuddur" : "İlk skanı başladın"}
        icon={<IconPulse className="h-5 w-5" />}
        gradient="bg-gradient-to-br from-rose-50/90 to-white"
      />
    </div>
  );
}
