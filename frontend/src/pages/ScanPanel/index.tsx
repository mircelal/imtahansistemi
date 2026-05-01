import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getExamIntegrations } from "../../api/exams";
import { getScanSession } from "../../api/scans";
import ExportPanel from "./ExportPanel";
import ImageUploader from "./ImageUploader";
import ManualCorrection from "./ManualCorrection";
import ProcessingStatus from "./ProcessingStatus";
import ResultsTable from "./ResultsTable";
import ScanSessionControls from "./ScanSessionControls";

function parseExamFromSearch(search: string): number | null {
  const q = new URLSearchParams(search);
  const raw = q.get("exam") ?? q.get("examId") ?? "";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function ScanPanelPage() {
  const [searchParams] = useSearchParams();
  const examFilter = parseExamFromSearch(searchParams.toString());
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);

  const sessionQ = useQuery({
    queryKey: ["scan-session", sessionId],
    queryFn: () => getScanSession(sessionId!),
    enabled: sessionId != null
  });

  const examId = sessionQ.data?.exam_id ?? null;

  const integrationsQ = useQuery({
    queryKey: ["exam-integrations", examId],
    queryFn: () => getExamIntegrations(examId!),
    enabled: examId != null
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Skan və OMR</h1>
        <p className="mt-2 text-sm text-slate-600">
          Cavab kartlarının skanları və fotoları seçilmiş imtahanın şablonu ilə arxa planda OMR xidmətində
          oxunur, nəticələr verilənlər bazasına yazılır. Əvvəlcə oturum seçin və ya yaradın, sonra faylları
          yükləyin.
        </p>
      </div>

      <ScanSessionControls
        examFilter={examFilter}
        sessionId={sessionId}
        onSessionChange={(id) => {
          setSessionId(id);
          setSelectedResultId(null);
        }}
      />

      {examId != null && integrationsQ.data && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <strong className="text-slate-900">{integrationsQ.data.exam_title}</strong>
          {" · "}
          Cavab kartı şablonları: <strong>{integrationsQ.data.answer_sheet_templates_count}</strong>
          {" · "}
          Bu imtahan üçün skan oturumları (ümumi): <strong>{integrationsQ.data.scan_sessions_total}</strong>
        </div>
      )}

      <ImageUploader sessionId={sessionId} />
      <ProcessingStatus sessionId={sessionId} />
      <ResultsTable
        sessionId={sessionId}
        selectedResultId={selectedResultId}
        onSelectResult={setSelectedResultId}
      />
      <ManualCorrection
        examId={examId}
        sessionId={sessionId}
        resultId={selectedResultId}
        onSelectResult={setSelectedResultId}
      />
      <ExportPanel sessionId={sessionId} />
    </div>
  );
}
