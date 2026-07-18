import { Link } from "react-router-dom";
import type { CourseDashboard } from "../../api/courses";
import Badge from "../../components/ui/Badge";

type Props = {
  courseId: number;
  dashboard: CourseDashboard | undefined;
  isLoading: boolean;
};

export default function CoursePanelHeader({ courseId, dashboard, isLoading }: Props) {
  const stats = dashboard?.stats;

  return (
    <header className="space-y-4">
      <Link to="/courses" className="inline-flex text-sm font-medium text-brand hover:underline">
        ← Kurslara qayıt
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {dashboard?.has_logo ? (
            <img
              src={`/api/courses/${courseId}/logo?t=${courseId}`}
              alt=""
              className="h-14 w-14 rounded-xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand/10 text-lg font-bold text-brand">
              {(dashboard?.course_name ?? "K").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {isLoading ? "Yüklənir…" : dashboard?.course_name ?? `Kurs №${courseId}`}
            </h1>
            {dashboard?.course_description ? (
              <p className="mt-1 max-w-2xl text-sm text-slate-600">{dashboard.course_description}</p>
            ) : null}
            {dashboard?.manager_name ? (
              <p className="mt-1 text-xs text-slate-500">Menecer: {dashboard.manager_name}</p>
            ) : null}
          </div>
        </div>
        {dashboard && !dashboard.is_active ? <Badge variant="warning">Qeyri-aktiv</Badge> : null}
      </div>

      {stats ? (
        <div className="flex flex-wrap gap-2">
          <StatPill label="Şagird" value={stats.students_count} />
          <StatPill label="Operator" value={stats.operators_count} />
          <StatPill label="İmtahan" value={stats.exams_own_count} />
          <StatPill label="Aktiv bilet" value={stats.tickets_active_count} />
          <StatPill label="Gözləyən sifariş" value={stats.orders_pending_count} />
          <StatPill label="Bu gün satılıb" value={stats.orders_confirmed_today} />
        </div>
      ) : null}
    </header>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums text-slate-900">{value}</span>
    </span>
  );
}
