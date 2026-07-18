import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { CourseDashboardExamBrief, CourseDashboardPlatformExam } from "../../../api/courses";
import { listExams } from "../../../api/exams";
import {
  cancelOrder,
  confirmOrder,
  createTicket,
  createTicketOrder,
  deleteTicket,
  listCourseTickets,
  listTicketOrders,
  updateTicket,
  type ExamTicket,
  type TicketOrder
} from "../../../api/tickets";
import Badge from "../../../components/ui/Badge";
import Card from "../../../components/ui/Card";
import DropdownMenu from "../../../components/ui/DropdownMenu";
import EmptyState from "../../../components/ui/EmptyState";
import { useAuthStore } from "../../../store/authStore";
import {
  formatTicketDt,
  saleStatusLabel,
  saleStatusVariant,
  scopeLabel
} from "../coursePanelUtils";

type Props = {
  courseId: number;
  ownExams: CourseDashboardExamBrief[];
  platformExams: CourseDashboardPlatformExam[];
};

type TicketForm = {
  title: string;
  description: string;
  price_amount: number;
  quota: string;
  exam_id: string;
  starts_at: string;
  ends_at: string;
};

type OrderForm = {
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  quantity: number;
};

type EditForm = {
  title: string;
  price_amount: number;
  quota: string;
  is_active: boolean;
};

export default function TicketsTab({ courseId, ownExams, platformExams }: Props) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canWrite = user && user.role !== "student";

  const [showCreate, setShowCreate] = useState(false);
  const [orderModalTicket, setOrderModalTicket] = useState<ExamTicket | null>(null);
  const [ordersModalTicket, setOrdersModalTicket] = useState<ExamTicket | null>(null);
  const [editTicket, setEditTicket] = useState<ExamTicket | null>(null);

  const ticketsQ = useQuery({
    queryKey: ["tickets", courseId],
    queryFn: () => listCourseTickets(courseId)
  });

  const examsQ = useQuery({
    queryKey: ["exams", courseId],
    queryFn: () => listExams(courseId)
  });

  const ordersQ = useQuery({
    queryKey: ["ticket-orders", ordersModalTicket?.id],
    queryFn: () => listTicketOrders(ordersModalTicket!.id),
    enabled: ordersModalTicket != null
  });

  const ticketForm = useForm<TicketForm>({
    defaultValues: { title: "", description: "", price_amount: 0, quota: "", exam_id: "", starts_at: "", ends_at: "" }
  });
  const orderForm = useForm<OrderForm>({
    defaultValues: { buyer_name: "", buyer_email: "", buyer_phone: "", quantity: 1 }
  });
  const editForm = useForm<EditForm>({
    defaultValues: { title: "", price_amount: 0, quota: "", is_active: true }
  });

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ["tickets", courseId] });
    await qc.invalidateQueries({ queryKey: ["course-dashboard", courseId] });
  };

  const createT = useMutation({
    mutationFn: (v: TicketForm) => {
      const eid = v.exam_id.trim() === "" ? undefined : Number(v.exam_id);
      return createTicket(courseId, {
        title: v.title,
        description: v.description || undefined,
        price_amount: Number(v.price_amount),
        quota: v.quota ? Number(v.quota) : null,
        currency: "AZN",
        is_active: true,
        exam_id: eid != null && Number.isFinite(eid) ? eid : undefined,
        starts_at: v.starts_at.trim() ? new Date(v.starts_at).toISOString() : undefined,
        ends_at: v.ends_at.trim() ? new Date(v.ends_at).toISOString() : undefined
      });
    },
    onSuccess: async () => {
      ticketForm.reset();
      setShowCreate(false);
      await invalidateAll();
    }
  });

  const updateT = useMutation({
    mutationFn: ({ id, v }: { id: number; v: EditForm }) =>
      updateTicket(id, {
        title: v.title,
        price_amount: Number(v.price_amount),
        quota: v.quota.trim() === "" ? null : Number(v.quota),
        is_active: v.is_active
      }),
    onSuccess: async () => {
      setEditTicket(null);
      await invalidateAll();
    }
  });

  const delT = useMutation({
    mutationFn: deleteTicket,
    onSuccess: invalidateAll
  });

  const createO = useMutation({
    mutationFn: ({ ticketId, payload }: { ticketId: number; payload: OrderForm }) =>
      createTicketOrder(ticketId, {
        buyer_name: payload.buyer_name,
        buyer_email: payload.buyer_email,
        buyer_phone: payload.buyer_phone || undefined,
        quantity: payload.quantity
      }),
    onSuccess: async () => {
      orderForm.reset({ buyer_name: "", buyer_email: "", buyer_phone: "", quantity: 1 });
      setOrderModalTicket(null);
      await qc.invalidateQueries({ queryKey: ["ticket-orders"] });
      await invalidateAll();
    }
  });

  const conf = useMutation({
    mutationFn: confirmOrder,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ticket-orders"] });
      await invalidateAll();
    }
  });

  const canc = useMutation({
    mutationFn: cancelOrder,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ticket-orders"] });
      await invalidateAll();
    }
  });

  const tickets = ticketsQ.data ?? [];
  const activeCount = tickets.filter((t) => t.is_active && t.sale_status === "active").length;
  const soldTotal = tickets.reduce((s, t) => s + (t.confirmed_count ?? 0), 0);

  const examOptions = [
    ...(examsQ.data ?? ownExams.map((e) => ({ id: e.id, title: e.title, course_id: courseId }))),
    ...platformExams.filter((p) => !p.has_course_ticket).map((p) => ({ id: p.id, title: p.title, course_id: null as number | null }))
  ];

  const openEdit = (t: ExamTicket) => {
    setEditTicket(t);
    editForm.reset({
      title: t.title,
      price_amount: t.price_amount,
      quota: t.quota != null ? String(t.quota) : "",
      is_active: t.is_active
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatMini label="Aktiv biletlər" value={activeCount} />
        <StatMini label="Təsdiqlənmiş (cəmi)" value={soldTotal} />
        <StatMini label="Cəmi bilet" value={tickets.length} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Biletlər və satış</h2>
        {canWrite ? (
          <button
            type="button"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? "Bağla" : "Yeni bilet"}
          </button>
        ) : null}
      </div>

      {showCreate && canWrite ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">Yeni bilet</h3>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={ticketForm.handleSubmit((v) => createT.mutate(v))}>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 sm:col-span-2" placeholder="Başlıq" {...ticketForm.register("title", { required: true })} />
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 sm:col-span-2" placeholder="Təsvir" {...ticketForm.register("description")} />
            <input type="number" step="0.01" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Qiymət" {...ticketForm.register("price_amount", { valueAsNumber: true })} />
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" placeholder="Kontingent (boş = limitsiz)" {...ticketForm.register("quota")} />
            <label className="text-sm text-slate-700">
              Satış başlanğıcı
              <input type="datetime-local" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" {...ticketForm.register("starts_at")} />
            </label>
            <label className="text-sm text-slate-700">
              Satış bitməsi
              <input type="datetime-local" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" {...ticketForm.register("ends_at")} />
            </label>
            <label className="sm:col-span-2 text-sm text-slate-700">
              İmtahana bağla
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" {...ticketForm.register("exam_id")}>
                <option value="">— ümumi kurs bileti —</option>
                {examOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.course_id == null ? "Ümumi · " : ""}
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={createT.isPending} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:col-span-2">
              Yarat
            </button>
          </form>
        </div>
      ) : null}

      {ticketsQ.isLoading ? (
        <p className="text-slate-600">Yüklənir…</p>
      ) : tickets.length === 0 ? (
        <EmptyState title="Bilet yoxdur" description="Yeni bilet yaradın və ya platform imtahanından bilet əlavə edin." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Bilet</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">İmtahan</th>
                <th className="px-4 py-3 font-semibold">Qiymət</th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">Kontingent</th>
                <th className="hidden px-4 py-3 font-semibold xl:table-cell">Satış pəncərəsi</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => {
                const quotaPct =
                  t.quota != null && t.quota > 0
                    ? Math.min(100, Math.round(((t.confirmed_count ?? 0) / t.quota) * 100))
                    : null;
                return (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{t.title}</p>
                      {!t.is_active ? <span className="text-xs text-slate-500">Deaktiv</span> : null}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {t.exam_scope ? (
                          <Badge variant={t.exam_scope === "platform" ? "info" : "neutral"} className="!bg-violet-500/15 !text-violet-800 !ring-violet-500/20">
                            {scopeLabel(t.exam_scope)}
                          </Badge>
                        ) : null}
                        <span className="text-slate-700">{t.exam_title ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {t.price_amount} {t.currency}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {t.quota != null ? (
                        <div className="min-w-[120px]">
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>{t.confirmed_count ?? 0}/{t.quota}</span>
                            {t.remaining_quota != null ? <span>qalan {t.remaining_quota}</span> : null}
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${quotaPct ?? 0}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">Limitsiz</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-500 xl:table-cell">
                      {t.starts_at ? formatTicketDt(t.starts_at) : "—"}
                      {t.ends_at ? ` → ${formatTicketDt(t.ends_at)}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={saleStatusVariant(t.sale_status)}>{saleStatusLabel(t.sale_status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canWrite ? (
                        <DropdownMenu
                          items={[
                            { label: "Redaktə", onClick: () => openEdit(t) },
                            { label: "Sifariş yarat", onClick: () => setOrderModalTicket(t) },
                            { label: "Sifarişlər", onClick: () => setOrdersModalTicket(t) },
                            { type: "divider" },
                            {
                              label: t.is_active ? "Deaktiv et" : "Aktiv et",
                              onClick: () => updateT.mutate({ id: t.id, v: { ...editForm.getValues(), title: t.title, price_amount: t.price_amount, quota: t.quota != null ? String(t.quota) : "", is_active: !t.is_active } })
                            },
                            {
                              label: "Sil",
                              variant: "danger",
                              onClick: () => {
                                if (window.confirm("Bilet silinsin?")) delT.mutate(t.id);
                              }
                            }
                          ]}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {orderModalTicket ? (
        <Modal title={`Sifariş — ${orderModalTicket.title}`} onClose={() => setOrderModalTicket(null)}>
          <form
            className="grid gap-3"
            onSubmit={orderForm.handleSubmit((payload) =>
              createO.mutate({ ticketId: orderModalTicket.id, payload })
            )}
          >
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Alıcının adı" {...orderForm.register("buyer_name", { required: true })} />
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="E-poçt" {...orderForm.register("buyer_email", { required: true })} />
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Telefon / şagird kodu" {...orderForm.register("buyer_phone")} />
            <input type="number" min={1} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" {...orderForm.register("quantity", { valueAsNumber: true })} />
            <button type="submit" disabled={createO.isPending} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
              Göndər (gözləmədə)
            </button>
          </form>
        </Modal>
      ) : null}

      {ordersModalTicket ? (
        <Modal title={`Sifarişlər — ${ordersModalTicket.title}`} onClose={() => setOrdersModalTicket(null)}>
          {ordersQ.isLoading ? <p className="text-sm text-slate-500">Yüklənir…</p> : null}
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {(ordersQ.data ?? []).map((o) => (
              <OrderRow key={o.id} order={o} canWrite={!!canWrite} onConfirm={() => conf.mutate(o.id)} onCancel={() => canc.mutate(o.id)} />
            ))}
            {(ordersQ.data ?? []).length === 0 && !ordersQ.isLoading ? (
              <li className="text-sm text-slate-500">Sifariş yoxdur.</li>
            ) : null}
          </ul>
          {canWrite ? (
            <button type="button" className="mt-4 text-sm text-brand hover:underline" onClick={() => { setOrdersModalTicket(null); setOrderModalTicket(ordersModalTicket); }}>
              + Yeni sifariş
            </button>
          ) : null}
        </Modal>
      ) : null}

      {editTicket ? (
        <Modal title="Bilet redaktəsi" onClose={() => setEditTicket(null)}>
          <form className="grid gap-3" onSubmit={editForm.handleSubmit((v) => updateT.mutate({ id: editTicket.id, v }))}>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" {...editForm.register("title", { required: true })} />
            <input type="number" step="0.01" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" {...editForm.register("price_amount", { valueAsNumber: true })} />
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Kontingent" {...editForm.register("quota")} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...editForm.register("is_active")} />
              Aktiv
            </label>
            <button type="submit" disabled={updateT.isPending} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
              Saxla
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OrderRow({
  order,
  canWrite,
  onConfirm,
  onCancel
}: {
  order: TicketOrder;
  canWrite: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
      <span>
        {order.buyer_name} · {order.quantity} əd · <Badge variant={order.status === "confirmed" ? "success" : order.status === "pending" ? "warning" : "neutral"}>{order.status}</Badge>
      </span>
      {canWrite && order.status === "pending" ? (
        <span className="flex gap-2">
          <button type="button" className="text-emerald-600 hover:underline" onClick={onConfirm}>Təsdiq</button>
          <button type="button" className="text-amber-700 hover:underline" onClick={onCancel}>Ləğv</button>
        </span>
      ) : null}
    </li>
  );
}
