import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { listOperators } from "../../api/auth";
import {
  attachCourseOperator,
  detachCourseOperator,
  inviteCourseOperator,
  listCourseOperators
} from "../../api/courses";
import CourseStudentsSection from "../../components/CourseStudentsSection";
import { listExams } from "../../api/exams";
import {
  cancelOrder,
  confirmOrder,
  createTicket,
  createTicketOrder,
  deleteTicket,
  listCourseTickets,
  listTicketOrders
} from "../../api/tickets";
import { useAuthStore } from "../../store/authStore";

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

type InviteOperatorForm = {
  email: string;
  full_name: string;
  password: string;
};

function formatTicketDt(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("az-AZ", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

export default function CoursePanelPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const cid = Number(courseId);
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManageOperators = user?.role === "admin" || user?.role === "manager";

  const ticketForm = useForm<TicketForm>({
    defaultValues: {
      title: "",
      description: "",
      price_amount: 0,
      quota: "",
      exam_id: "",
      starts_at: "",
      ends_at: ""
    }
  });
  const orderForm = useForm<OrderForm>({
    defaultValues: { buyer_name: "", buyer_email: "", buyer_phone: "", quantity: 1 }
  });
  const inviteForm = useForm<InviteOperatorForm>({
    defaultValues: { email: "", full_name: "", password: "" }
  });
  const [expandedTicket, setExpandedTicket] = useState<number | null>(null);
  const [attachUserId, setAttachUserId] = useState("");

  const examsQ = useQuery({
    queryKey: ["exams", cid],
    queryFn: () => listExams(cid),
    enabled: Number.isFinite(cid)
  });

  const ticketsQ = useQuery({
    queryKey: ["tickets", cid],
    queryFn: () => listCourseTickets(cid),
    enabled: Number.isFinite(cid)
  });

  const operatorsQ = useQuery({
    queryKey: ["course-operators", cid],
    queryFn: () => listCourseOperators(cid),
    enabled: Number.isFinite(cid) && canManageOperators === true
  });

  const poolQ = useQuery({
    queryKey: ["auth-operators-pool"],
    queryFn: listOperators,
    enabled: canManageOperators === true
  });

  const ordersQ = useQuery({
    queryKey: ["ticket-orders", expandedTicket],
    queryFn: () => listTicketOrders(expandedTicket!),
    enabled: expandedTicket != null
  });

  const assignedIds = new Set((operatorsQ.data ?? []).map((o) => o.user_id));
  const attachCandidates =
    (poolQ.data ?? []).filter((u) => u.role === "operator" && !assignedIds.has(u.id)) ?? [];

  const createT = useMutation({
    mutationFn: (v: TicketForm) => {
      const eid = v.exam_id.trim() === "" ? undefined : Number(v.exam_id);
      return createTicket(cid, {
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
    onSuccess: async (_, v) => {
      const eid = v.exam_id.trim() === "" ? null : Number(v.exam_id);
      ticketForm.reset({
        title: "",
        description: "",
        price_amount: 0,
        quota: "",
        exam_id: "",
        starts_at: "",
        ends_at: ""
      });
      await qc.invalidateQueries({ queryKey: ["tickets", cid] });
      if (eid != null && Number.isFinite(eid)) {
        await qc.invalidateQueries({ queryKey: ["exam-integrations", eid] });
      }
    }
  });

  const attachMut = useMutation({
    mutationFn: () => attachCourseOperator(cid, Number(attachUserId)),
    onSuccess: async () => {
      setAttachUserId("");
      await qc.invalidateQueries({ queryKey: ["course-operators", cid] });
    }
  });

  const inviteMut = useMutation({
    mutationFn: (payload: InviteOperatorForm) => inviteCourseOperator(cid, payload),
    onSuccess: async () => {
      inviteForm.reset();
      await qc.invalidateQueries({ queryKey: ["course-operators", cid] });
      await qc.invalidateQueries({ queryKey: ["auth-operators-pool"] });
    }
  });

  const detachMut = useMutation({
    mutationFn: (operatorUserId: number) => detachCourseOperator(cid, operatorUserId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["course-operators", cid] });
    }
  });

  const delT = useMutation({
    mutationFn: deleteTicket,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tickets", cid] });
    }
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
      await qc.invalidateQueries({ queryKey: ["ticket-orders", expandedTicket] });
    }
  });

  const conf = useMutation({
    mutationFn: confirmOrder,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ticket-orders", expandedTicket] });
    }
  });

  const canc = useMutation({
    mutationFn: cancelOrder,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ticket-orders", expandedTicket] });
    }
  });

  if (!Number.isFinite(cid)) {
    return <p className="text-red-600">Yanlış kurs identifikatoru.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/courses" className="text-sm font-medium text-indigo-600 hover:underline">
          ← Kurslara qayıt
        </Link>
        <h1 className="text-xl font-bold text-slate-900">Kurs paneli · №{cid}</h1>
      </div>

      {canManageOperators && (
        <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-violet-950">Kurs operatorları</h2>
          <p className="mt-1 text-sm text-violet-900/85">
            Operatorlar bu kurs üzrə imtahan, bilet, şagirdlər və skan ilə işləyə bilər; kursu və ya meneceri silə
            bilməzlər.
          </p>

          <div className="mt-4 flex flex-wrap gap-3 border-t border-violet-200/80 pt-4">
            <div className="min-w-[220px] flex-1">
              <label className="block text-xs font-medium text-violet-900">Mövcud operator təyin et</label>
              <div className="mt-1 flex gap-2">
                <select
                  className="flex-1 rounded-md border border-violet-200 bg-white px-3 py-2 text-sm"
                  value={attachUserId}
                  onChange={(e) => setAttachUserId(e.target.value)}
                >
                  <option value="">— seçin —</option>
                  {attachCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={attachUserId === "" || attachMut.isPending}
                  className="rounded-md bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => attachMut.mutate()}
                >
                  Əlavə et
                </button>
              </div>
              {attachCandidates.length === 0 && poolQ.isSuccess ? (
                <p className="mt-1 text-xs text-violet-800/80">Boş operator yoxdursa yeni hesab yaradın.</p>
              ) : null}
            </div>
          </div>

          <form
            className="mt-4 grid gap-3 border-t border-violet-200/80 pt-4 sm:grid-cols-3"
            onSubmit={inviteForm.handleSubmit((v) => inviteMut.mutate(v))}
          >
            <p className="sm:col-span-3 text-sm font-medium text-violet-950">Yeni operator hesabı + təyin</p>
            <input
              className="rounded-md border border-violet-200 px-3 py-2 text-sm"
              placeholder="Tam ad"
              {...inviteForm.register("full_name", { required: true })}
            />
            <input
              type="email"
              className="rounded-md border border-violet-200 px-3 py-2 text-sm"
              placeholder="E-poçt"
              {...inviteForm.register("email", { required: true })}
            />
            <input
              type="password"
              className="rounded-md border border-violet-200 px-3 py-2 text-sm"
              placeholder="Şifrə (min. 6)"
              autoComplete="new-password"
              {...inviteForm.register("password", { required: true, minLength: 6 })}
            />
            <button
              type="submit"
              disabled={inviteMut.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-3"
            >
              Operator yarat və kursa bağla
            </button>
          </form>
          {inviteMut.isError ? (
            <p className="mt-2 text-sm text-red-700">Bu e-poçt artıq mövcuddursa &quot;Mövcud operator təyin et&quot; istifadə edin.</p>
          ) : null}

          <div className="mt-4 border-t border-violet-200/80 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Təyin olunublar</p>
            {operatorsQ.isLoading ? (
              <p className="mt-2 text-sm text-violet-800">Yüklənir…</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(operatorsQ.data ?? []).length === 0 ? (
                  <li className="text-sm text-violet-800/90">Hələ operator yoxdur.</li>
                ) : (
                  (operatorsQ.data ?? []).map((op) => (
                    <li
                      key={op.user_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/90 px-3 py-2 text-sm ring-1 ring-violet-100"
                    >
                      <span>
                        <strong className="text-slate-900">{op.full_name}</strong>
                        <span className="text-slate-600"> · {op.email}</span>
                      </span>
                      <button
                        type="button"
                        className="text-red-600 hover:underline disabled:opacity-50"
                        disabled={detachMut.isPending}
                        onClick={() => {
                          if (window.confirm(`${op.full_name} bu kursdan çıxarılsın?`)) detachMut.mutate(op.user_id);
                        }}
                      >
                        Çıxar
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </section>
      )}

      <CourseStudentsSection courseId={cid} />

      {user && user.role !== "student" && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Yeni bilet</h2>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={ticketForm.handleSubmit((v) => createT.mutate(v))}
          >
            <input
              className="rounded-md border border-slate-300 px-3 py-2 sm:col-span-2"
              placeholder="Başlıq"
              {...ticketForm.register("title", { required: true })}
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2 sm:col-span-2"
              placeholder="Təsvir"
              {...ticketForm.register("description")}
            />
            <input
              type="number"
              step="0.01"
              className="rounded-md border border-slate-300 px-3 py-2"
              placeholder="Qiymət (AZN)"
              {...ticketForm.register("price_amount", { valueAsNumber: true })}
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              placeholder="Kontingent (boş = limitsiz)"
              {...ticketForm.register("quota")}
            />
            <label className="text-sm text-slate-700">
              Satış başlanğıcı (istəyə bağlı)
              <input type="datetime-local" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" {...ticketForm.register("starts_at")} />
            </label>
            <label className="text-sm text-slate-700">
              Satış bitməsi (istəyə bağlı)
              <input type="datetime-local" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" {...ticketForm.register("ends_at")} />
            </label>
            <label className="sm:col-span-2 text-sm text-slate-700">
              İmtahana bağla (isteğe bağlı)
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                {...ticketForm.register("exam_id")}
              >
                <option value="">— ümumi kurs bileti —</option>
                {(examsQ.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    №{e.id} · {e.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={createT.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:col-span-2"
            >
              Bilet yarat
            </button>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Biletlər və sifarişlər</h2>
        {ticketsQ.isLoading && <p className="text-slate-600">Yüklənir...</p>}
        <ul className="space-y-3">
          {ticketsQ.data?.map((t) => (
            <li key={t.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{t.title}</p>
                  <p className="text-sm text-slate-600">
                    {t.price_amount} {t.currency}
                    {t.quota != null ? ` · kontingent: ${t.quota}` : ""}
                    {t.exam_id != null ? ` · imtahan №${t.exam_id}` : ""}
                  </p>
                  {(t.starts_at || t.ends_at) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t.starts_at ? `Başlanğıc: ${formatTicketDt(t.starts_at)}` : ""}
                      {t.starts_at && t.ends_at ? " · " : ""}
                      {t.ends_at ? `Son: ${formatTicketDt(t.ends_at)}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-sm text-indigo-600 hover:underline"
                    onClick={() => setExpandedTicket(expandedTicket === t.id ? null : t.id)}
                  >
                    {expandedTicket === t.id ? "Sifarişləri gizlət" : "Sifarişlər"}
                  </button>
                  {user && user.role !== "student" && (
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:underline"
                      onClick={() => delT.mutate(t.id)}
                    >
                      Sil
                    </button>
                  )}
                </div>
              </div>

              {expandedTicket === t.id && (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <h3 className="mb-2 text-sm font-semibold">Yeni sifariş (ödənişsiz MVP)</h3>
                  <form
                    className="mb-4 grid gap-2 sm:grid-cols-2"
                    onSubmit={orderForm.handleSubmit((payload) => createO.mutate({ ticketId: t.id, payload }))}
                  >
                    <input
                      className="rounded-md border px-3 py-2"
                      placeholder="Alıcının adı"
                      {...orderForm.register("buyer_name", { required: true })}
                    />
                    <input
                      className="rounded-md border px-3 py-2"
                      placeholder="E-poçt"
                      {...orderForm.register("buyer_email", { required: true })}
                    />
                    <input
                      className="rounded-md border px-3 py-2"
                      placeholder="Telefon"
                      {...orderForm.register("buyer_phone")}
                    />
                    <input
                      type="number"
                      className="rounded-md border px-3 py-2"
                      {...orderForm.register("quantity", { valueAsNumber: true })}
                    />
                    <button
                      type="submit"
                      disabled={createO.isPending}
                      className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white sm:col-span-2"
                    >
                      Göndər (gözləmədə)
                    </button>
                  </form>

                  {ordersQ.isLoading && <p className="text-sm text-slate-500">Sifarişlər yüklənir...</p>}
                  <ul className="space-y-2">
                    {ordersQ.data?.map((o) => (
                      <li
                        key={o.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white bg-white px-3 py-2 text-sm"
                      >
                        <span>
                          {o.buyer_name} · {o.buyer_email} · miqdar {o.quantity}{" "}
                          <span className="font-medium text-slate-800">({o.status})</span>
                        </span>
                        {user && user.role !== "student" && o.status === "pending" && (
                          <span className="flex gap-2">
                            <button
                              type="button"
                              className="text-emerald-600 hover:underline"
                              onClick={() => conf.mutate(o.id)}
                            >
                              Təsdiq
                            </button>
                            <button
                              type="button"
                              className="text-amber-700 hover:underline"
                              onClick={() => canc.mutate(o.id)}
                            >
                              Ləğv
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
