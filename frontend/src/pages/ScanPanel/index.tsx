import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCourseStudentsSummary } from "../../api/courses";
import { getExam, getExamIntegrations, getExamReadiness } from "../../api/exams";
import { ensureScanSession, getScanSession, listScanResults, type ScanQuickUpload } from "../../api/scans";
import ExportPanel from "./ExportPanel";
import ImageUploader from "./ImageUploader";
import ManualCorrection from "./ManualCorrection";
import ProcessingStatus from "./ProcessingStatus";
import ResultsTable from "./ResultsTable";
import ScanSessionControls from "./ScanSessionControls";
import PageHeader from "../../components/ui/PageHeader";

/** İmtahan seçilibsə oturum avtomatikdir — yalnız 3 addım göstərilir. */
const SCAN_STEPS = ["Yükləmə", "Emal", "Yoxlama"] as const;

function parseExamFromSearch(search: string): number | null {
  const q = new URLSearchParams(search);
  const raw = q.get("exam") ?? q.get("examId") ?? "";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** URL step=1..3 (görünən addım). Köhnə step=2..4 uyğunluğu saxlanılır. */
function parseDisplayStep(raw: string | null): number {
  const n = Number(raw || "1");
  if (n >= 1 && n <= 3) return n;
  if (n === 4) return 3;
  return 1;
}

export default function ScanPanelPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const examFilter = parseExamFromSearch(searchParams.toString());
  const sessionFromUrl = Number(searchParams.get("session") || "0");
  const step = parseDisplayStep(searchParams.get("step"));
  const showManualSessions = searchParams.get("sessions") === "1" || searchParams.get("manual") === "1";

  const [sessionId, setSessionId] = useState<number | null>(
    sessionFromUrl > 0 ? sessionFromUrl : null,
  );
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const ensureAttemptedRef = useRef<number | null>(null);

  const syncUrl = useCallback(
    (patch: { step?: number; exam?: number | null; session?: number | null; sessions?: boolean }) => {
      const next = new URLSearchParams(searchParams);
      if (patch.step != null) next.set("step", String(patch.step));
      const exam = patch.exam !== undefined ? patch.exam : examFilter;
      if (exam != null) next.set("exam", String(exam));
      else next.delete("exam");
      const sid = patch.session !== undefined ? patch.session : sessionId;
      if (sid != null) next.set("session", String(sid));
      else next.delete("session");
      if (patch.sessions === true) next.set("sessions", "1");
      else if (patch.sessions === false) next.delete("sessions");
      setSearchParams(next, { replace: true });
    },
    [examFilter, searchParams, sessionId, setSearchParams],
  );

  const goStep = useCallback(
    (n: number, overrides?: { sessionId?: number | null; examId?: number | null }) => {
      syncUrl({
        step: n,
        exam: overrides?.examId !== undefined ? overrides.examId : examFilter,
        session: overrides?.sessionId !== undefined ? overrides.sessionId : sessionId,
      });
    },
    [examFilter, sessionId, syncUrl],
  );

  const handleQuickUpload = useCallback(
    (result: ScanQuickUpload) => {
      setSessionId(result.session.id);
      setSelectedResultId(null);
      syncUrl({
        step: 2,
        exam: result.session.exam_id,
        session: result.session.id,
      });
    },
    [syncUrl],
  );

  const ensureMut = useMutation({
    mutationFn: (examId: number) => ensureScanSession(examId),
    onSuccess: (session) => {
      setSessionId(session.id);
      setSelectedResultId(null);
      // Bitmiş partiyada nəticələr varsa birbaşa yoxlama addımına
      const openReview =
        session.status === "done" ||
        (session.processed_images > 0 && session.status !== "processing");
      goStep(openReview ? 3 : Math.max(step, 1), {
        sessionId: session.id,
        examId: session.exam_id,
      });
    },
  });

  const sessionQ = useQuery({
    queryKey: ["scan-session", sessionId],
    queryFn: () => getScanSession(sessionId!),
    enabled: sessionId != null,
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      return st === "pending" || st === "processing" ? 2000 : false;
    },
  });

  const examId = sessionQ.data?.exam_id ?? examFilter;

  const examQ = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => getExam(examId!),
    enabled: examId != null,
  });

  const integrationsQ = useQuery({
    queryKey: ["exam-integrations", examId],
    queryFn: () => getExamIntegrations(examId!),
    enabled: examId != null,
  });

  const readinessQ = useQuery({
    queryKey: ["exam-readiness", examId],
    queryFn: () => getExamReadiness(examId!),
    enabled: examId != null,
  });

  const resultsQ = useQuery({
    queryKey: ["scan-results", sessionId],
    queryFn: () => listScanResults(sessionId!),
    enabled: sessionId != null,
    refetchInterval: () => {
      const st = sessionQ.data?.status;
      return st === "pending" || st === "processing" ? 3000 : false;
    },
  });

  const studentsSummaryQ = useQuery({
    queryKey: ["course-students-summary", examQ.data?.course_id],
    queryFn: () => getCourseStudentsSummary(examQ.data!.course_id!),
    enabled: examQ.data?.course_id != null,
  });

  const scanReady = readinessQ.data?.ready_for_scan ?? false;
  const sessionStatus = sessionQ.data?.status;

  const coverage = useMemo(() => {
    const rows = resultsQ.data ?? [];
    const uniqueStudents = new Set(rows.map((r) => r.student_id).filter((id): id is number => id != null)).size;
    const totalScans = rows.length;
    const courseTotal = studentsSummaryQ.data?.total;
    return { uniqueStudents, totalScans, courseTotal };
  }, [resultsQ.data, studentsSummaryQ.data]);

  const prevStatusRef = useRef<string | null>(null);

  /** Reprocess köhnə ScanResult sətirlərini silir — seçilmiş ID-ni təmizlə. */
  useEffect(() => {
    if (sessionStatus === "pending" || sessionStatus === "processing") {
      setSelectedResultId(null);
    }
    // Emal bitəndə klassik yoxlama: ilk nəticəni aç
    if (
      prevStatusRef.current &&
      (prevStatusRef.current === "pending" || prevStatusRef.current === "processing") &&
      (sessionStatus === "done" || sessionStatus === "error")
    ) {
      goStep(3);
    }
    prevStatusRef.current = sessionStatus ?? null;
  }, [sessionStatus, goStep]);

  useEffect(() => {
    const rows = resultsQ.data;
    if (!rows?.length) return;
    if (selectedResultId != null && rows.some((r) => r.id === selectedResultId)) return;
    const pending = rows.find((r) => r.status === "manual_review" || r.status === "error");
    setSelectedResultId(pending?.id ?? rows[0]!.id);
  }, [resultsQ.data, selectedResultId]);

  useEffect(() => {
    if (sessionFromUrl > 0 && sessionId !== sessionFromUrl) {
      setSessionId(sessionFromUrl);
      setSelectedResultId(null);
    }
  }, [sessionFromUrl, sessionId]);

  useEffect(() => {
    if (examFilter == null || sessionId != null || sessionFromUrl > 0) return;
    if (ensureAttemptedRef.current === examFilter) return;
    if (ensureMut.isPending) return;
    ensureAttemptedRef.current = examFilter;
    ensureMut.mutate(examFilter);
  }, [examFilter, sessionId, sessionFromUrl, ensureMut]);

  const sessionReady = sessionId != null;
  const bootstrapping = examFilter != null && !sessionReady && (ensureMut.isPending || !ensureMut.isError);

  return (
    <div className="page-container-wide space-y-4">
      <PageHeader
        title="Skan və OMR"
        subtitle="Cavab kartı şəkillərini yükləyin — QR kod imtahanı avtomatik tanıyır, sistem oxuyub qiymətləndirir."
      />

      {bootstrapping && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm text-indigo-950">
          <strong className="font-semibold">Skan hazırlanır…</strong>
          <p className="mt-1 text-indigo-900/90">İmtahan üçün skan partiyası avtomatik açılır, bir neçə saniyə gözləyin.</p>
        </div>
      )}

      {ensureMut.isError && examFilter != null && sessionId == null && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-950">
          <strong className="font-semibold">Skan partiyası açıla bilmədi.</strong>
          <p className="mt-1">
            {(ensureMut.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
              "Şəbəkə və ya icazə xətası. Yenidən cəhd edin."}
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-900"
            onClick={() => {
              ensureAttemptedRef.current = null;
              ensureMut.mutate(examFilter);
            }}
          >
            Yenidən cəhd et
          </button>
        </div>
      )}

      {!examFilter && !sessionReady && !bootstrapping && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-700">
          <span>İmtahan seçməyə ehtiyac yoxdur — kartın QR kodu kifayətdir.</span>
          <button
            type="button"
            className="text-[13px] font-medium text-indigo-700 underline hover:text-indigo-900"
            onClick={() => syncUrl({ sessions: !showManualSessions })}
          >
            {showManualSessions ? "Əl ilə seçimi gizlət" : "Əl ilə imtahan seç"}
          </button>
        </div>
      )}

      {showManualSessions && !examFilter && (
        <ScanSessionControls
          examFilter={null}
          sessionId={sessionId}
          onSessionChange={(id) => {
            setSessionId(id);
            setSelectedResultId(null);
            if (id != null) goStep(1, { sessionId: id });
          }}
        />
      )}

      {(examFilter != null || sessionReady) && sessionReady && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
          <strong className="font-semibold">
            {examQ.data?.title ?? integrationsQ.data?.exam_title ?? sessionQ.data?.exam_title ?? `İmtahan #${examId}`}
          </strong>
          <span className="text-emerald-900/80">
            {" "}
            · Skan partiyası №{sessionId}
            {sessionQ.data?.status ? ` · ${sessionStatusAz(sessionQ.data.status)}` : ""}
          </span>
        </div>
      )}

      {/* İmtahan seçilibsə əvvəlki yoxlamalar (partiyalar) həmişə görünsün */}
      {examFilter != null && sessionReady && (
        <ScanSessionControls
          examFilter={examFilter}
          sessionId={sessionId}
          onSessionChange={(id, meta) => {
            setSessionId(id);
            setSelectedResultId(null);
            if (id == null) return;
            const st = meta?.status;
            const toReview = st === "done" || st === "error";
            goStep(toReview ? 3 : 1, { sessionId: id });
          }}
        />
      )}

      <nav
        aria-label="Skan addımları"
        className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100/80 p-1 ring-1 ring-slate-200/60"
      >
        {SCAN_STEPS.map((label, i) => {
          const n = i + 1;
          const disabled = n > 1 && !sessionReady;
          return (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && goStep(n)}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-center text-[12px] font-semibold sm:text-[13px] ${
                disabled
                  ? "cursor-not-allowed text-slate-400"
                  : step === n
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:bg-white/50"
              }`}
            >
              <span className="mr-1 tabular-nums text-slate-400">{n}.</span>
              {label}
            </button>
          );
        })}
      </nav>

      {examId != null && readinessQ.data && !scanReady && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong className="font-semibold">İmtahan skan üçün hazır deyil.</strong>
          <ul className="mt-2 list-inside list-disc text-amber-900/90">
            {readinessQ.data.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <Link
            to={`/exams/yarat?exam=${examId}`}
            className="mt-2 inline-block font-medium text-indigo-700 underline hover:text-indigo-900"
          >
            İmtahan quruluşuna keç →
          </Link>
        </div>
      )}

      {sessionId != null && coverage.totalScans > 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
          <strong className="font-semibold">Əhatə:</strong>{" "}
          {coverage.uniqueStudents} unikal şagird skan olunub
          {coverage.courseTotal != null ? ` / ${coverage.courseTotal} kurs şagirdi` : ""}
          {" · "}
          {coverage.totalScans} skan sətiri (fayl/ZIP)
        </div>
      )}

      {step >= 1 && (
        <>
          <ImageUploader
            sessionId={sessionId}
            autoDetect={!sessionReady && examFilter == null}
            uploadDisabled={
              (examId != null && !scanReady && sessionReady) ||
              sessionStatus === "done" ||
              sessionStatus === "error"
            }
            sessionClosed={sessionStatus === "done" || sessionStatus === "error"}
            onQuickUpload={handleQuickUpload}
          />
          {step === 1 && sessionReady && (
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                onClick={() => goStep(2)}
              >
                Emala keç →
              </button>
            </div>
          )}
        </>
      )}

      {step >= 2 && sessionReady && (
        <>
          <ProcessingStatus sessionId={sessionId} />
          <ResultsTable
            sessionId={sessionId}
            sessionStatus={sessionQ.data?.status ?? null}
            selectedResultId={selectedResultId}
            onSelectResult={(id) => {
              setSelectedResultId(id);
              if (id != null) goStep(3);
            }}
          />
          {step === 2 && (
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
                onClick={() => goStep(3)}
              >
                Yoxlamaya keç →
              </button>
            </div>
          )}
        </>
      )}

      {step >= 3 && sessionReady && (
        <>
          <ManualCorrection
            examId={examId}
            courseId={examQ.data?.course_id ?? null}
            sessionId={sessionId}
            resultId={selectedResultId}
            onSelectResult={setSelectedResultId}
          />
          <ExportPanel sessionId={sessionId} />
          {examId != null && scanReady && (
            <div className="flex justify-end">
              <Link
                to={`/reports?exam=${examId}`}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100"
              >
                Hesabata keç →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function sessionStatusAz(status: string): string {
  switch (status) {
    case "pending":
      return "yükləmə gözləyir";
    case "processing":
      return "emal olunur";
    case "done":
      return "bitib";
    case "error":
      return "xəta";
    default:
      return status;
  }
}
