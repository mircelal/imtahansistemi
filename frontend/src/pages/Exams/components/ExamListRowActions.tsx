import { useState } from "react";
import { Link } from "react-router-dom";
import { downloadAnswerSheetPdf, getApiErrorMessage } from "../../../api/answerSheets";
import type { Exam } from "../../../api/exams";
import {
  downloadExamBookletCover,
  downloadExamQuestionBooklet,
  downloadExamQuestionBookletDocx,
} from "../../../api/exams";
import { DEFAULT_BOOKLET_VARIANTS, resolveBookletConfig } from "../../../constants/bookletLayoutSpec";
import { examPrimaryBtn, examSecondaryBtn } from "./examUiTokens";

type Props = {
  exam: Exam;
  scanReady: boolean;
};

export function examListVariants(exam: Exam): string[] {
  const v = resolveBookletConfig(exam.grading_config).variants;
  return v && v.length > 0 ? v : [...DEFAULT_BOOKLET_VARIANTS];
}

export default function ExamListRowActions({ exam, scanReady }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const variants = examListVariants(exam);
  const hasSheet = (exam.confirmed_sheet_templates ?? 0) > 0;
  const hasQuestions = (exam.questions_registered ?? 0) > 0;
  const canBooklet = hasQuestions;

  const run = async (key: string, fn: () => Promise<void>) => {
    setErr(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setErr(getApiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1" data-row-action onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap justify-end gap-1">
        <Link to={`/exams/${exam.id}/dashboard`} className={examPrimaryBtn} title="İmtahan dashboardu">
          Dashboard
        </Link>
        <Link to={`/exams/yarat?exam=${exam.id}`} className={examSecondaryBtn} title="İmtahana giriş">
          Giriş
        </Link>
        <Link
          to={`/exams/yarat?exam=${exam.id}&wizardStep=0`}
          className={examSecondaryBtn}
          title={exam.is_locked ? "Bitib — yalnız baxış" : "Parametrlər və quruluş"}
        >
          {exam.is_locked ? "Baxış" : "Redaktə"}
        </Link>
        <Link
          to={`/scan?exam=${exam.id}`}
          className={`${examSecondaryBtn}${scanReady ? " !border-emerald-300 !bg-emerald-50 !text-emerald-900" : ""}`}
          title={scanReady ? "Skan panelinə keç" : "Skan — imtahan tam hazır olmayıb"}
        >
          Skan
        </Link>

        <details className="relative inline-block">
          <summary
            className={`${examSecondaryBtn} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
            title="Cavab kartı və sual kitabçası"
          >
            Endir ▾
          </summary>
          <div className="absolute right-0 z-20 mt-1 min-w-[220px] max-h-[min(70vh,420px)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-left text-[12px] shadow-lg ring-1 ring-black/5">
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={!hasSheet || busy != null}
              onClick={() => run("sheet", () => downloadAnswerSheetPdf(exam.id))}
            >
              {busy === "sheet" ? "Endirilir…" : "Cavab kartı (PDF)"}
              {!hasSheet && <span className="block text-[10px] text-slate-400">Kart təsdiqlənməyib</span>}
            </button>

            {variants.length > 1 && (
              <p className="border-t border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Variantlar
              </p>
            )}

            {variants.map((variant) => (
              <div key={variant} className="border-t border-slate-50 first:border-t-0">
                {variants.length > 1 && (
                  <p className="bg-slate-50/80 px-3 py-1 text-[10px] font-bold text-slate-600">Variant {variant}</p>
                )}
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  disabled={!canBooklet || busy != null}
                  onClick={() =>
                    run(`booklet-${variant}`, () => downloadExamQuestionBooklet(exam.id, { variant }))
                  }
                >
                  {busy === `booklet-${variant}` ? "Endirilir…" : `Sual kitabçası${variants.length > 1 ? ` ${variant}` : ""} (PDF)`}
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  disabled={!canBooklet || busy != null}
                  onClick={() =>
                    run(`docx-${variant}`, () => downloadExamQuestionBookletDocx(exam.id, { variant }))
                  }
                >
                  {busy === `docx-${variant}` ? "Endirilir…" : `Sual kitabçası${variants.length > 1 ? ` ${variant}` : ""} (DOCX)`}
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  disabled={busy != null}
                  onClick={() => run(`cover-${variant}`, () => downloadExamBookletCover(exam.id, { variant }))}
                >
                  {busy === `cover-${variant}` ? "Endirilir…" : `Qapaq${variants.length > 1 ? ` ${variant}` : ""} (PDF)`}
                </button>
              </div>
            ))}

            {!canBooklet && (
              <p className="border-t border-slate-100 px-3 py-2 text-[10px] text-amber-700">Kitabça üçün sual əlavə edin</p>
            )}
          </div>
        </details>
      </div>
      {err && <p className="max-w-[240px] text-right text-[10px] text-red-600">{err}</p>}
    </div>
  );
}
