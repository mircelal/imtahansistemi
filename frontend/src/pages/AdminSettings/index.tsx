import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import axios from "axios";
import { useEffect, useRef } from "react";
import {
  deleteLogo,
  getAdminSettings,
  publicLogoPath,
  updateAdminSettings,
  uploadLogo
} from "../../api/settings";

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

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sistem ayarları</h1>
        <p className="mt-1 text-slate-600">Brauzerdə görünən ad və loqo. Dəyişikliklər dərhal tətbiq olunur.</p>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
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
          <button
            type="submit"
            disabled={saveMut.isPending || settingsQuery.isLoading}
            className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-violet-700 disabled:opacity-50"
          >
            {saveMut.isPending ? "Saxlanılır…" : "Saxla"}
          </button>
        </form>
        {saveMut.isError ? <p className="mt-3 text-sm text-red-600">{errMsg(saveMut.error)}</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
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
      </section>
    </div>
  );
}
