import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { CourseDashboard } from "../../../api/courses";
import {
  adjustCourseWallet,
  fetchCourseWallet,
  fetchCourseWalletTransactions,
} from "../../../api/finance";
import { createWalletTopup } from "../../../api/payments";
import { useAuthStore } from "../../../store/authStore";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { formatExamDt } from "../coursePanelUtils";

type Props = {
  courseId: number;
  dashboard: CourseDashboard;
};

function formatMoney(v: number, currency = "AZN") {
  return `${v.toFixed(2)} ${currency}`;
}

function txTypeLabel(t: string) {
  const map: Record<string, string> = {
    deposit: "Mədaxil",
    refund: "Geri qaytarma",
    adjustment: "Düzəliş",
    ticket_debit: "Satış",
  };
  return map[t] ?? t;
}

export default function FinanceTab({ courseId, dashboard }: Props) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const canTopup = user?.role === "admin" || user?.role === "manager";
  const qc = useQueryClient();
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [topupAmount, setTopupAmount] = useState("");

  const walletQ = useQuery({
    queryKey: ["course-wallet", courseId],
    queryFn: () => fetchCourseWallet(courseId),
  });

  const txQ = useQuery({
    queryKey: ["course-wallet-tx", courseId],
    queryFn: () => fetchCourseWalletTransactions(courseId),
  });

  const adjustMut = useMutation({
    mutationFn: () =>
      adjustCourseWallet(courseId, {
        amount: Number(adjustAmount),
        note: adjustNote.trim(),
      }),
    onSuccess: async () => {
      setAdjustAmount("");
      setAdjustNote("");
      await qc.invalidateQueries({ queryKey: ["course-wallet", courseId] });
      await qc.invalidateQueries({ queryKey: ["course-wallet-tx", courseId] });
      await qc.invalidateQueries({ queryKey: ["course-dashboard", courseId] });
    },
  });

  const topupMut = useMutation({
    mutationFn: () =>
      createWalletTopup({
        course_id: courseId,
        amount: Number(topupAmount),
        return_url: `${window.location.origin}/courses/${courseId}?tab=finance&topup=ok`,
        cancel_url: `${window.location.origin}/courses/${courseId}?tab=finance&topup=cancel`,
      }),
    onSuccess: (res) => {
      window.location.href = res.checkout_url;
    },
  });

  const stats = dashboard.stats;
  const wallet = walletQ.data;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-950">
        <strong>Bilik əməkdaşlıq modeli:</strong> Bilik platform imtahanları təşkil edir; kurs öz biletlərini satır və
        gəlir kurs balansına köçür. Təsdiqlənmiş hər bilet satışı avtomatik balansa əlavə olunur.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Kurs balansı" value={formatMoney(wallet?.balance ?? stats.wallet_balance, stats.wallet_currency)} accent />
        <StatCard label="Ümumi gəlir" value={formatMoney(stats.revenue_total, stats.wallet_currency)} />
        <StatCard label="Bu gün" value={formatMoney(stats.revenue_today, stats.wallet_currency)} success />
        <StatCard label="Satılan bilet" value={String(stats.tickets_sold_total)} />
      </div>

      {canTopup ? (
        <Card>
          <h3 className="mb-3 font-semibold text-slate-900">Balansı artır (online)</h3>
          <p className="mb-3 text-xs text-slate-500">Aktiv ödəniş driveri ilə (mock / Payriff). Minimum 1 AZN.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[10rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Məbləğ (AZN)</label>
              <input
                type="number"
                step="0.01"
                min="1"
                placeholder="50.00"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={topupMut.isPending || !topupAmount || Number(topupAmount) < 1}
              onClick={() => topupMut.mutate()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {topupMut.isPending ? "…" : "Ödənişə keç"}
            </button>
          </div>
          {topupMut.isError ? (
            <p className="mt-2 text-sm text-red-600">
              {(topupMut.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
                "Xəta baş verdi"}
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-slate-900">Balans əməliyyatları</h3>
          {txQ.isLoading ? (
            <p className="text-sm text-slate-500">Yüklənir…</p>
          ) : (txQ.data ?? []).length === 0 ? (
            <EmptyState title="Əməliyyat yoxdur" description="Bilet satışı təsdiqlənəndə burada görünəcək." />
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {(txQ.data ?? []).map((tx) => (
                <li key={tx.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{txTypeLabel(tx.tx_type)}</p>
                    <p className="text-xs text-slate-500">{tx.note ?? "—"}</p>
                    <p className="text-[11px] text-slate-400">{formatExamDt(tx.created_at)}</p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${tx.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {tx.amount >= 0 ? "+" : ""}
                    {formatMoney(tx.amount, stats.wallet_currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isAdmin ? (
          <Card>
            <h3 className="mb-3 font-semibold text-slate-900">Admin: balans düzəlişi</h3>
            <p className="mb-3 text-xs text-slate-500">Manual düzəliş (müsbət və ya mənfi məbləğ).</p>
            <div className="space-y-3">
              <input
                type="number"
                step="0.01"
                placeholder="Məbləğ (AZN)"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Qeyd"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={adjustMut.isPending || !adjustNote.trim() || !adjustAmount}
                onClick={() => adjustMut.mutate()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Tətbiq et
              </button>
            </div>
          </Card>
        ) : (
          <Card>
            <h3 className="mb-3 font-semibold text-slate-900">Satış axını</h3>
            <ol className="list-inside list-decimal space-y-2 text-sm text-slate-700">
              <li>Biletlər tabından imtahana bilet yaradın (qiymət mütləq).</li>
              <li>Şagird sifarişi qəbul edin və təsdiqləyin.</li>
              <li>Məbləğ avtomatik kurs balansına köçür.</li>
              <li>Hesabatlar və skan nəticələri ayrıca izlənir.</li>
            </ol>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  success,
}: {
  label: string;
  value: string;
  accent?: boolean;
  success?: boolean;
}) {
  const tone = accent
    ? "border-emerald-200 bg-emerald-50/70"
    : success
      ? "border-sky-200 bg-sky-50/70"
      : "border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tone}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
