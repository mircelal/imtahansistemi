import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchAdminFinanceOverview } from "../../api/finance";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function AdminFinancePage() {
  const overviewQ = useQuery({
    queryKey: ["admin-finance-overview"],
    queryFn: fetchAdminFinanceOverview,
  });

  const data = overviewQ.data;

  return (
    <div className="page-container-wide space-y-6">
      <PageHeader
        title="Maliyyə paneli"
        subtitle="Bilik platforması — kurs balansları, bilet gəlirləri və əməkdaşlıq satışları."
      />

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3 text-sm text-indigo-950">
        <strong>Model:</strong> Bilik imtahanları təşkil edir; kurslar öz qiymətləri ilə bilet satır. Təsdiqlənmiş
        satış məbləği kursun balansına köçür. Rəsmi imtahan qiyməti imtahan parametrlərində təyin olunur.
      </div>

      {overviewQ.isLoading ? (
        <p className="text-slate-600">Yüklənir…</p>
      ) : overviewQ.isError ? (
        <p className="text-red-600">Maliyyə məlumatı yüklənmədi.</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard label="Ümumi kurs balansı" value={`${data.total_wallet_balance.toFixed(2)} AZN`} />
            <SummaryCard label="Ümumi gəlir" value={`${data.total_revenue.toFixed(2)} AZN`} hint="təsdiqlənmiş" />
            <SummaryCard label="Bu gün" value={`${data.revenue_today.toFixed(2)} AZN`} />
            <SummaryCard label="Satılan bilet" value={String(data.tickets_sold_total)} />
            <SummaryCard
              label="Gözləyən sifariş"
              value={String(data.pending_orders)}
              hint={
                data.pending_orders > 0 ? (
                  <Link to="/admin/ticket-sales" className="text-brand hover:underline">
                    Sifarişlərə bax →
                  </Link>
                ) : (
                  undefined
                )
              }
            />
          </div>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-900">Kurslar üzrə</h2>
              <p className="text-xs text-slate-500">Balans və təsdiqlənmiş bilet gəlirləri</p>
            </div>
            {data.courses.length === 0 ? (
              <div className="p-6">
                <EmptyState title="Kurs yoxdur" description="Kurs yaradıldıqda avtomatik balans açılır." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Kurs</th>
                      <th className="px-4 py-3 font-semibold">Balans</th>
                      <th className="px-4 py-3 font-semibold">Gəlir</th>
                      <th className="px-4 py-3 font-semibold">Bilet</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.courses.map((c) => (
                      <tr key={c.course_id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-900">{c.course_name}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {c.wallet_balance.toFixed(2)} {c.currency}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-emerald-700">
                          {c.revenue_total.toFixed(2)} {c.currency}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{c.tickets_sold}</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/courses/${c.course_id}?tab=finance`}
                            className="font-medium text-brand hover:underline"
                          >
                            Panel
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
