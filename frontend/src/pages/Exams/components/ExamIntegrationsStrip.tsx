import { Link } from "react-router-dom";
import type { ExamIntegrations } from "../../../api/exams";
import { examSecondaryBtn, examSection, examSectionBody } from "./examUiTokens";

type Props = {
  examId: number;
  data: ExamIntegrations | undefined;
  isLoading: boolean;
  courseId: number | null | undefined;
};

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="truncate text-[13px] font-medium text-slate-900">{value}</p>
    </div>
  );
}

export default function ExamIntegrationsStrip({ examId, data, isLoading, courseId }: Props) {
  if (isLoading) {
    return (
      <div className={examSection}>
        <div className={examSectionBody}>
          <p className="text-[13px] text-slate-500">Yüklənir…</p>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const ticketLabel =
    data.linked_tickets.length === 0
      ? "Yoxdur"
      : data.linked_tickets.length === 1
        ? data.linked_tickets[0]!.title
        : `${data.linked_tickets.length} bilet`;

  return (
    <div className={examSection}>
      <div className={`${examSectionBody} space-y-3`}>
        <div className="flex gap-2 overflow-x-auto">
          <Chip label="Kurs" value={data.course_id == null ? "Ümumi" : `#${data.course_id}`} />
          <Chip label="Bilet" value={ticketLabel} />
          <Chip label="Kart şablonu" value={String(data.answer_sheet_templates_count)} />
          <Chip label="Skan" value={`${data.scan_sessions_active}/${data.scan_sessions_total}`} />
        </div>
        <div className="flex flex-wrap gap-2">
          {courseId != null ? (
            <Link to={`/courses/${courseId}`} className={examSecondaryBtn}>
              Kurs paneli
            </Link>
          ) : null}
          <Link to={`/scan?exam=${examId}`} className={examSecondaryBtn}>
            Skan
          </Link>
          {courseId != null ? (
            <Link to={`/students?course=${courseId}`} className={examSecondaryBtn}>
              Şagirdlər
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
