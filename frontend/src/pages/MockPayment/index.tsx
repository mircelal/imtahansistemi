import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useParams, useSearchParams } from "react-router-dom";
import { fetchPaymentIntent, mockCompletePayment } from "../../api/payments";
import Button from "../../components/ui/Button";

function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: string } | undefined;
    if (typeof d?.detail === "string") return d.detail;
  }
  return "Xəta baş verdi.";
}

export default function MockPaymentPage() {
  const { publicId } = useParams();
  const [sp] = useSearchParams();
  const returnUrl = sp.get("return_url") || "/";
  const cancelUrl = sp.get("cancel_url") || "/";

  const intentQ = useQuery({
    queryKey: ["payment-intent", publicId],
    queryFn: () => fetchPaymentIntent(publicId!),
    enabled: Boolean(publicId),
  });

  const payMut = useMutation({
    mutationFn: () => mockCompletePayment(publicId!),
    onSuccess: () => {
      window.location.href = returnUrl;
    },
  });

  const intent = intentQ.data;
  const amount = intent ? (intent.amount_cents / 100).toFixed(2) : "—";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Mock ödəniş</p>
        <h1 className="mt-2 text-xl font-bold text-slate-900">Test kartı</h1>
        {intentQ.isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Yüklənir…</p>
        ) : intentQ.isError ? (
          <p className="mt-4 text-sm text-red-600">{errMsg(intentQ.error)}</p>
        ) : intent ? (
          <>
            <p className="mt-4 text-3xl font-bold tabular-nums text-slate-900">
              {amount} {intent.currency}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {intent.purpose === "wallet_topup" ? "Balans artırımı" : "Bilet sifarişi"} · {intent.status}
            </p>
            {intent.status === "paid" ? (
              <p className="mt-6 text-sm text-emerald-700">Artıq ödənilib.</p>
            ) : (
              <div className="mt-6 flex flex-col gap-2">
                <Button type="button" disabled={payMut.isPending} onClick={() => payMut.mutate()}>
                  {payMut.isPending ? "Ödənilir…" : "Ödə (mock)"}
                </Button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    window.location.href = cancelUrl;
                  }}
                >
                  Ləğv et
                </button>
              </div>
            )}
            {payMut.isError ? <p className="mt-3 text-sm text-red-600">{errMsg(payMut.error)}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
