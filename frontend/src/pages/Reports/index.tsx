import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { downloadReportExport, fetchExamReportDetail, fetchReportsOverview } from "../../api/reports";
import PageHeader from "../../components/ui/PageHeader";
import ReportsExamDetailPanel from "./components/ReportsExamDetailPanel";
import ReportsExamList from "./components/ReportsExamList";
import ReportsOverviewKpis from "./components/ReportsOverviewKpis";

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = Number(searchParams.get("exam") || "0");
  const [examId, setExamId] = useState<number | null>(fromUrl > 0 ? fromUrl : null);
  const autoPickedRef = useRef(false);

  const overviewQ = useQuery({
    queryKey: ["reports-overview"],
    queryFn: fetchReportsOverview,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (fromUrl > 0) {
      setExamId(fromUrl);
      return;
    }
    if (autoPickedRef.current || overviewQ.isLoading || !overviewQ.data) return;
    const suggested = overviewQ.data.totals.suggested_exam_id;
    if (suggested) {
      autoPickedRef.current = true;
      setExamId(suggested);
      const next = new URLSearchParams(searchParams);
      next.set("exam", String(suggested));
      setSearchParams(next, { replace: true });
    }
  }, [fromUrl, overviewQ.data, overviewQ.isLoading, searchParams, setSearchParams]);

  const selectExam = useCallback(
    (id: number) => {
      setExamId(id);
      const next = new URLSearchParams(searchParams);
      next.set("exam", String(id));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const detailQ = useQuery({
    queryKey: ["report-detail", examId],
    queryFn: () => fetchExamReportDetail(examId!),
    enabled: examId != null && examId > 0,
    staleTime: 20_000,
  });

  const exportMut = useMutation({
    mutationFn: (kind: "pdf" | "excel") => downloadReportExport(examId!, kind),
  });

  const overview = overviewQ.data;
  const exams = overview?.exams ?? [];

  return (
    <div className="page-container-wide space-y-5">
      <PageHeader
        title="Nəticələr və analitika"
        subtitle="İmtahan performansı, sual analizi, reyting və export — sektor standartı hesabat paneli."
      />

      {overviewQ.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : overview ? (
        <ReportsOverviewKpis totals={overview.totals} />
      ) : null}

      {overviewQ.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Hesabat xülasəsi yüklənmədi. Səhifəni yeniləyin.
        </div>
      )}

      {exams.length === 0 && !overviewQ.isLoading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-indigo-50/30 p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-900">Hələ imtahan yoxdur</h2>
          <p className="mt-2 text-sm text-slate-600">İlk imtahanı yaradın, cavab kartlarını skan edin — hesabatlar avtomatik dolacaq.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link to="/exams" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              İmtahan yarat
            </Link>
            <Link to="/scan" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
              Skana keç
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,280px)_1fr] lg:items-start">
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]">
            <ReportsExamList exams={exams} selectedId={examId} onSelect={selectExam} />
          </div>
          <ReportsExamDetailPanel
            detail={detailQ.data}
            loading={detailQ.isLoading && examId != null}
            examId={examId ?? 0}
            onExport={(kind) => exportMut.mutate(kind)}
            exporting={exportMut.isPending}
          />
        </div>
      )}
    </div>
  );
}
