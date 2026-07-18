import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import {
  deleteLogo,
  getAdminSettings,
  publicLogoPath,
  updateAdminSettings,
  uploadLogo
} from "../../api/settings";
import { getPaymentSettings, updatePaymentSettings } from "../../api/payments";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";

type FormValues = { system_name: string };

function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: string } | undefined;
    if (typeof d?.detail === "string") return d.detail;
  }
  return "Xəta baş verdi.";
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const settingsQuery = useQuery({ queryKey: ["settings", "admin"], queryFn: getAdminSettings });
  const { register, handleSubmit, reset } = useForm<FormValues>({ defaultValues: { system_name: "" } });

  useEffect(() => {
    if (settingsQuery.data) {
      reset({ system_name: settingsQuery.data.system_name });
    }
  }, [settingsQuery.data, reset]);

  const saveMut = useMutation({
    mutationFn: updateAdminSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "admin"] });
      await queryClient.invalidateQueries({ queryKey: ["settings", "public"] });
    }
  });

  const logoUploadMut = useMutation({
    mutationFn: uploadLogo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "admin"] });
      await queryClient.invalidateQueries({ queryKey: ["settings", "public"] });
      if (fileRef.current) fileRef.current.value = "";
    }
  });

  const logoDeleteMut = useMutation({
    mutationFn: deleteLogo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "admin"] });
      await queryClient.invalidateQueries({ queryKey: ["settings", "public"] });
    }
  });

  const hasLogo = settingsQuery.data?.has_logo ?? false;

  const payQ = useQuery({ queryKey: ["settings", "payments"], queryFn: getPaymentSettings });
  const [payDriver, setPayDriver] = useState("mock");
  const [walletOn, setWalletOn] = useState(true);
  const [merchantHint, setMerchantHint] = useState("");

  useEffect(() => {
    if (payQ.data) {
      setPayDriver(payQ.data.active_driver);
      setWalletOn(payQ.data.wallet_enabled);
      const mid = payQ.data.config?.merchant_display;
      setMerchantHint(typeof mid === "string" ? mid : "");
    }
  }, [payQ.data]);

  const payMut = useMutation({
    mutationFn: () =>
      updatePaymentSettings({
        active_driver: payDriver,
        wallet_enabled: walletOn,
        config: merchantHint.trim() ? { merchant_display: merchantHint.trim() } : {},
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "payments"] });
    },
  });

  return (
    <div className="page-container">
      <PageHeader
        title="Sistem ayarları"
        subtitle="Brauzerdə görünən ad, loqo və ödəniş. Dəyişikliklər dərhal tətbiq olunur."
      />

      <div className="grid gap-8 lg:grid-cols-2">
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Ümumi</h2>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit((v) => saveMut.mutate({ system_name: v.system_name }))}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Sistem adı</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-violet-500 focus:ring-2"
              placeholder="Məs. Təhsil Mərkəzi OMR"
              {...register("system_name", { required: true })}
            />
          </div>
          <Button type="submit" disabled={saveMut.isPending || settingsQuery.isLoading}>
            {saveMut.isPending ? "Saxlanılır…" : "Saxla"}
          </Button>
        </form>
        {saveMut.isError ? <p className="mt-3 text-sm text-red-600">{errMsg(saveMut.error)}</p> : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Logo</h2>
        <p className="mt-1 text-sm text-slate-600">PNG, JPEG və ya WEBP, ən çox 2 MB. Tövsiyə: şəffaf fon, təxminən 200–400 px hündürlük.</p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
            {hasLogo ? (
              <img
                src={`${publicLogoPath()}?v=${settingsQuery.dataUpdatedAt ?? 0}`}
                alt=""
                className="max-h-20 max-w-[9rem] object-contain"
              />
            ) : (
              <span className="text-xs text-slate-400">Logo yoxdur</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-violet-800 hover:file:bg-violet-200"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) logoUploadMut.mutate(f);
              }}
            />
            {hasLogo ? (
              <button
                type="button"
                className="text-left text-sm font-medium text-red-600 hover:text-red-800"
                disabled={logoDeleteMut.isPending}
                onClick={() => logoDeleteMut.mutate()}
              >
                Logonu sil
              </button>
            ) : null}
          </div>
        </div>
        {logoUploadMut.isError ? <p className="mt-3 text-sm text-red-600">{errMsg(logoUploadMut.error)}</p> : null}
        {logoDeleteMut.isError ? <p className="mt-3 text-sm text-red-600">{errMsg(logoDeleteMut.error)}</p> : null}
      </Card>

      <Card className="lg:col-span-2">
        <h2 className="text-lg font-semibold text-slate-900">Ödəniş</h2>
        <p className="mt-1 text-sm text-slate-600">
          Aktiv driver seçin. Secret açarlar yalnız server .env-dədir (Payriff). Mock — test/E2E; Offline — yalnız kassa.
        </p>
        {payQ.isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Yüklənir…</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Aktiv driver</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={payDriver}
                onChange={(e) => setPayDriver(e.target.value)}
              >
                {(payQ.data?.drivers ?? ["offline", "mock", "payriff"]).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Merchant (görünən)</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="İstəyə bağlı etiket"
                value={merchantHint}
                onChange={(e) => setMerchantHint(e.target.value)}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={walletOn} onChange={(e) => setWalletOn(e.target.checked)} />
              Online balans artımı (UI)
            </label>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" disabled={payMut.isPending || payQ.isLoading} onClick={() => payMut.mutate()}>
            {payMut.isPending ? "Saxlanılır…" : "Ödəniş ayarlarını saxla"}
          </Button>
          {payQ.data ? (
            <p className="text-xs text-slate-500">
              Test: Payriff {payQ.data.payriff_configured ? "hazır" : "credential yox"} · Mock{" "}
              {payQ.data.mock_available ? "aktiv ola bilər" : "—"}
            </p>
          ) : null}
        </div>
        {payMut.isError ? <p className="mt-3 text-sm text-red-600">{errMsg(payMut.error)}</p> : null}
        {payMut.isSuccess ? <p className="mt-3 text-sm text-emerald-700">Saxlanıldı.</p> : null}
      </Card>
      </div>
    </div>
  );
}
