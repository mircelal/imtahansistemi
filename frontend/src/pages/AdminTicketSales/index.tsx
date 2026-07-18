import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getAdminTicketOrdersSummary, listAdminTicketOrders } from "../../api/adminTicketOrders";
import { listCourses } from "../../api/courses";
import { listExams } from "../../api/exams";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { formatDateTime } from "../../utils/dateFormat";

function formatDt(iso: string) {
  return formatDateTime(iso);
}

function scopeLabel(scope: string | null) {
  if (scope === "platform") return "Ümumi";
  if (scope === "course") return "Kurs";
  return "—";
}

export default function AdminTicketSalesPage() {
  const [courseId, setCourseId] = useState<number | "">("");
  const [examId, setExamId] = useState<number | "">("");
  const [status, setStatus] = useState<string>("");

  const filterParams = useMemo(
    () => ({
      course_id: courseId === "" ? undefined : Number(courseId),
      exam_id: examId === "" ? undefined : Number(examId),
      status: status === "" ? undefined : status
    }),
    [courseId, examId, status]
  );

  const coursesQ = useQuery({ queryKey: ["courses"], queryFn: listCourses });
  const examsQ = useQuery({ queryKey: ["exams-admin-sales"], queryFn: () => listExams() });

  const ordersQ = useQuery({
    queryKey: ["admin-ticket-orders", filterParams],
    queryFn: () => listAdminTicketOrders(filterParams)
  });

  const summaryQ = useQuery({
    queryKey: ["admin-ticket-orders-summary", filterParams],
    queryFn: () => getAdminTicketOrdersSummary(filterParams)
  });

  const exportCsv = () => {
    const rows = ordersQ.data ?? [];
    const header = ["Tarix", "Kurs", "İmtahan", "Bilet", "Alıcı", "Say", "Status", "Məbləğ", "Valyuta"];
    const lines = rows.map((r) =>
      [
        r.created_at,
        r.course_name,
        r.exam_title ?? "",
        r.ticket_title,
        r.buyer_name,
        r.quantity,
        r.status,
        r.line_total,
        r.currency
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bilet-satislar.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-container-wide space-y-6">
      <PageHeader
        title="Bilet satışları"
        subtitle="Bütün kurslar üzrə bilet sifarişlərinin qlobal nəzarəti."
        action={
          <button
            type="button"
            onClick={exportCsv}
            disabled={!ordersQ.data?.length}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            CSV export
          </button>
        }
      />

      {summaryQ.data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Sifarişlər (filter)" value={summaryQ.data.total_orders} />
          <SummaryCard label="Təsdiqlənmiş bilet" value={summaryQ.data.total_tickets_sold} />
          <SummaryCard label="Gəlir (təsdiqlənmiş)" value={`${summaryQ.data.total_revenue.toFixed(2)} AZN`} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <option value="">Bütün kurslar</option>
          {(coursesQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={examId}
          onChange={(e) => setExamId(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <option value="">Bütün imtahanlar</option>
          {(examsQ.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Bütün statuslar</option>
          <option value="pending">Gözləyir</option>
          <option value="confirmed">Təsdiqlənib</option>
          <option value="cancelled">Ləğv</option>
        </select>
      </div>

      {ordersQ.isLoading ? (
        <p className="text-slate-600">Yüklənir…</p>
      ) : (ordersQ.data ?? []).length === 0 ? (
        <EmptyState title="Sifariş yoxdur" description="Filterləri dəyişin və ya kurslarda satış başladın." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Tarix</th>
                <th className="px-4 py-3 font-semibold">Kurs</th>
                <th className="px-4 py-3 font-semibold">İmtahan</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Bilet</th>
                <th className="px-4 py-3 font-semibold">Alıcı</th>
                <th className="px-4 py-3 font-semibold">Say</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Məbləğ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(ordersQ.data ?? []).map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-xs text-slate-600">{formatDt(r.created_at)}</td>
                  <td className="px-4 py-3 text-slate-800">{r.course_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {r.exam_scope ? (
                        <Badge variant={r.exam_scope === "platform" ? "info" : "neutral"}>{scopeLabel(r.exam_scope)}</Badge>
                      ) : null}
                      <span className="text-slate-700">{r.exam_title ?? "—"}</span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{r.ticket_title}</td>
                  <td className="px-4 py-3 text-slate-800">{r.buyer_name}</td>
                  <td className="px-4 py-3 tabular-nums">{r.quantity}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        r.status === "confirmed" ? "success" : r.status === "pending" ? "warning" : "neutral"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium text-slate-900">
                    {r.line_total.toFixed(2)} {r.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summaryQ.data && summaryQ.data.by_course.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Kurs üzrə breakdown</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {summaryQ.data.by_course.map((row) => (
              <li key={row.course_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-slate-800">{row.course_name}</span>
                <span className="text-slate-600">
                  {row.tickets} bilet · {row.revenue.toFixed(2)} AZN
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
