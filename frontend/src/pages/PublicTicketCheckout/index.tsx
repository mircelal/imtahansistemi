import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchPublicTicket, publicTicketCheckout } from "../../api/payments";
import Button from "../../components/ui/Button";

function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: string } | undefined;
    if (typeof d?.detail === "string") return d.detail;
  }
  return "Xəta baş verdi.";
}

export default function PublicTicketCheckoutPage() {
  const { ticketId } = useParams();
  const id = Number(ticketId);
  const [sp] = useSearchParams();
  const paid = sp.get("paid");

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [quantity, setQuantity] = useState(1);

  const ticketQ = useQuery({
    queryKey: ["public-ticket", id],
    queryFn: () => fetchPublicTicket(id),
    enabled: Number.isFinite(id) && id > 0,
  });

  const checkoutMut = useMutation({
    mutationFn: () =>
      publicTicketCheckout(id, {
        buyer_name: buyerName.trim(),
        buyer_email: buyerEmail.trim(),
        buyer_phone: buyerPhone.trim() || undefined,
        quantity,
        return_url: `${window.location.origin}/biletle/${id}?paid=1`,
        cancel_url: `${window.location.origin}/biletle/${id}?paid=0`,
      }),
    onSuccess: (res) => {
      if (res.checkout_url.startsWith("http")) {
        window.location.href = res.checkout_url;
      } else {
        window.location.href = res.checkout_url;
      }
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    checkoutMut.mutate();
  };

  const ticket = ticketQ.data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      <div className="mx-auto max-w-lg">
        <p className="text-sm font-medium text-slate-500">Online bilet</p>
        {ticketQ.isLoading ? (
          <p className="mt-4 text-slate-600">Yüklənir…</p>
        ) : ticketQ.isError ? (
          <p className="mt-4 text-red-600">{errMsg(ticketQ.error)}</p>
        ) : ticket ? (
          <>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{ticket.title}</h1>
            <p className="mt-2 text-slate-600">
              {(ticket.price_amount * quantity).toFixed(2)} {ticket.currency}
              {ticket.exam_title ? ` · ${ticket.exam_title}` : ""}
            </p>
            {paid === "1" ? (
              <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Ödəniş uğurlu görünür. Təsdiq e-poçtunu yoxlayın.
              </p>
            ) : null}
            {paid === "0" ? (
              <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Ödəniş ləğv edildi və ya tamamlanmadı.
              </p>
            ) : null}
            <form className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={onSubmit}>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Ad, soyad</label>
                <input
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">E-poçt</label>
                <input
                  required
                  type="email"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Telefon</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Miqdar</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <Button type="submit" disabled={checkoutMut.isPending} className="w-full">
                {checkoutMut.isPending ? "Yönləndirilir…" : "Ödənişə keç"}
              </Button>
              {checkoutMut.isError ? <p className="text-sm text-red-600">{errMsg(checkoutMut.error)}</p> : null}
            </form>
          </>
        ) : null}
        <p className="mt-6 text-center text-xs text-slate-400">
          <Link to="/login" className="underline">
            Giriş
          </Link>
        </p>
      </div>
    </div>
  );
}
