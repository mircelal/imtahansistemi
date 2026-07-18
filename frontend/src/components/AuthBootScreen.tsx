/** Shown while JWT exists but /api/auth/me has not returned yet (e.g. F5 refresh). */
export default function AuthBootScreen() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand" aria-hidden />
      <p className="text-sm text-slate-500">Hesab məlumatı yüklənir…</p>
    </div>
  );
}
