import { Link } from "react-router-dom";
import type { CourseDashboard } from "../../../api/courses";
import Badge from "../../../components/ui/Badge";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { formatExamDt } from "../coursePanelUtils";

type Props = {
  dashboard: CourseDashboard;
  onGoTickets: () => void;
  onGoFinance: () => void;
};

export default function OverviewTab({ dashboard, onGoTickets, onGoFinance }: Props) {
  const { stats, exams_own, exams_platform_open, tickets } = dashboard;
  const currency = stats.wallet_currency || "AZN";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
        <StatCard label="Şagirdlər" value={stats.students_count} />
        <StatCard label="Operatorlar" value={stats.operators_count} />
        <StatCard label="Kurs imtahanları" value={stats.exams_own_count} />
        <StatCard label="Aktiv biletlər" value={stats.tickets_active_count} />
        <StatCard label="Gözləyən sifariş" value={stats.orders_pending_count} accent="warning" />
        <StatCard label="Bu gün təsdiqlənib" value={stats.orders_confirmed_today} accent="success" />
        <StatCard
          label="Kurs balansı"
          value={`${(stats.wallet_balance ?? 0).toFixed(2)} ${currency}`}
          accent="money"
          onClick={onGoFinance}
        />
        <StatCard
          label="Ümumi gəlir"
          value={`${(stats.revenue_total ?? 0).toFixed(2)} ${currency}`}
          accent="money"
          onClick={onGoFinance}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Son biletlər</h3>
            <button type="button" className="text-sm text-brand hover:underline" onClick={onGoTickets}>
              Hamısı
            </button>
          </div>
          {tickets.length === 0 ? (
            <EmptyState title="Bilet yoxdur" description="Biletlər tabından yeni satış yaradın." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {tickets.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-500">
                      {t.exam_title ?? "Ümumi bilet"} · {t.price_amount} {t.currency}
                    </p>
                  </div>
                  <Badge variant={t.sale_status === "active" ? "success" : "neutral"}>{t.sale_status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold text-slate-900">Açıq platform imtahanları</h3>
          {exams_platform_open.length === 0 ? (
            <EmptyState title="Açıq imtahan yoxdur" description="Admin platform imtahanında bilet satışını aktiv edəndə burada görünəcək." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {exams_platform_open.slice(0, 5).map((e) => (
                <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-medium text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {formatExamDt(e.scheduled_at)}
                    {e.city ? ` · ${e.city}` : ""}
                    {e.seat_remaining != null ? ` · qalan: ${e.seat_remaining}` : ""}
                    {e.list_price_amount > 0 ? ` · rəsmi: ${e.list_price_amount} ${e.list_price_currency}` : ""}
                  </p>
                  {e.has_course_ticket ? (
                    <span className="mt-1 inline-block text-xs text-emerald-700">Bilet yaradılıb</span>
                  ) : (
                    <span className="mt-1 inline-block text-xs text-amber-700">Bilet yoxdur</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {exams_own.length > 0 ? (
        <Card>
          <h3 className="mb-4 font-semibold text-slate-900">Kurs imtahanları</h3>
          <ul className="divide-y divide-slate-100">
            {exams_own.slice(0, 5).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">{formatExamDt(e.scheduled_at)} · {e.question_count} sual</p>
                </div>
                <Link to={`/exams?exam=${e.id}`} className="text-sm text-brand hover:underline">
                  Aç
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  onClick
}: {
  label: string;
  value: number | string;
  accent?: "success" | "warning" | "money";
  onClick?: () => void;
}) {
  const tone =
    accent === "success"
      ? "border-emerald-100 bg-emerald-50/50"
      : accent === "warning"
        ? "border-amber-100 bg-amber-50/50"
        : accent === "money"
          ? "border-emerald-200 bg-emerald-50/60 cursor-pointer hover:shadow-md"
          : "border-slate-200 bg-white";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-xl border p-4 shadow-sm text-left w-full ${tone}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </Tag>
  );
}

