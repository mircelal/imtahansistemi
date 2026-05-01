import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { bootstrapAdmin, bootstrapStatus, login, me } from "../../api/auth";
import { getPublicSettings, publicLogoPath } from "../../api/settings";
import { useAuthStore } from "../../store/authStore";

type LoginForm = { email: string; password: string; full_name?: string };

function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data as { detail?: string | { msg: string }[] } | undefined;
    if (typeof detail?.detail === "string") return detail.detail;
    if (Array.isArray(detail?.detail) && detail.detail[0]?.msg) return detail.detail[0].msg;
  }
  return "Xəta baş verdi.";
}

export default function LoginPage() {
  const { register, handleSubmit } = useForm<LoginForm>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);

  const bootstrapStatusQuery = useQuery({
    queryKey: ["bootstrap-status"],
    queryFn: bootstrapStatus
  });

  const brandingQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: getPublicSettings,
    staleTime: 60_000
  });
  const systemName = brandingQuery.data?.system_name ?? "OMR imtahan sistemi";
  const hasLogo = brandingQuery.data?.has_logo ?? false;

  const loginMutation = useMutation({
    mutationFn: async (values: LoginForm) => {
      const result = await login({ email: values.email, password: values.password });
      setToken(result.access_token);
      const user = await me();
      setUser(user);
    },
    onSuccess: () => navigate("/")
  });

  const bootstrapMutation = useMutation({
    mutationFn: async (values: LoginForm) => {
      await bootstrapAdmin({
        email: values.email,
        full_name: values.full_name || "Admin",
        password: values.password
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap-status"] });
    }
  });

  const needsBootstrap = bootstrapStatusQuery.data?.needs_bootstrap === true;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-600/20 via-transparent to-transparent" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-[120%] -translate-x-1/2 bg-[radial-gradient(circle,_rgba(56,189,248,0.12)_0%,_transparent_55%)]" />

      <div className="relative mb-8 text-center text-white">
        {hasLogo ? (
          <img
            src={`${publicLogoPath()}?v=${brandingQuery.dataUpdatedAt ?? 0}`}
            alt=""
            className="mx-auto h-16 w-auto max-w-[200px] object-contain drop-shadow-lg sm:h-20"
          />
        ) : (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-lg font-bold shadow-lg shadow-indigo-900/40 sm:h-20 sm:w-20 sm:text-xl">
            OMR
          </div>
        )}
        <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">{systemName}</h1>
        <p className="mt-2 text-sm text-slate-300">Daxil olun və ya ilk administrator yaradın</p>
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/95 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
        {bootstrapStatusQuery.isSuccess && !needsBootstrap && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Sistem hazırdır — hesabınızla daxil olun.
          </p>
        )}

        <form className="space-y-4" onSubmit={handleSubmit((v) => loginMutation.mutate(v))}>
          {needsBootstrap && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tam ad (ilk quraşdırma)</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-indigo-500 focus:ring-2"
                placeholder="Məs. Admin"
                {...register("full_name")}
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">E-poçt</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-indigo-500 focus:ring-2"
              type="email"
              autoComplete="email"
              {...register("email", { required: true })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Şifrə</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-indigo-500 focus:ring-2"
              type="password"
              autoComplete="current-password"
              {...register("password", { required: true })}
            />
          </div>
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
          >
            {loginMutation.isPending ? "Gözləyin…" : "Daxil ol"}
          </button>
          {needsBootstrap && (
            <button
              type="button"
              className="w-full rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={handleSubmit((v) => bootstrapMutation.mutate(v))}
              disabled={bootstrapMutation.isPending || bootstrapStatusQuery.isFetching}
            >
              İlk administrator yarat
            </button>
          )}
        </form>

        {loginMutation.isError && (
          <p className="mt-4 text-sm text-red-600">{apiErrorMessage(loginMutation.error)}</p>
        )}
        {bootstrapMutation.isError && (
          <p className="mt-4 text-sm text-red-600">
            {apiErrorMessage(bootstrapMutation.error) === "System already initialized"
              ? "Sistem artıq qurulub — birbaşa daxil olun və ya şifrəni administrator ilə dəyişdirin."
              : apiErrorMessage(bootstrapMutation.error)}
          </p>
        )}
        {bootstrapMutation.isSuccess && (
          <p className="mt-4 text-sm text-emerald-700">Administrator yaradıldı. İndi daxil ola bilərsiniz.</p>
        )}
      </div>

      <p className="relative mt-8 text-center text-xs text-slate-500">Giriş məlumatlarınızı təhlükəsiz saxlayın</p>
    </div>
  );
}
