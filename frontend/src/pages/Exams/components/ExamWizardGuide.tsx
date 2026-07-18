import type { ReactNode } from "react";
import type { ExamStep1SubSection } from "../examWizardSteps";
import { examPrimaryBtn, examSecondaryBtn } from "./examUiTokens";

type Props = {
  step: number;
  step1SubSection: ExamStep1SubSection;
  examId: number | null;
  plannedQuestionCount: number;
  registeredQuestionCount: number;
  gradingSaved: boolean;
  answerKeyComplete: boolean;
  sheetConfirmed: boolean;
  canGoToAnswerKey: boolean;
  onGoToSubSection?: (s: ExamStep1SubSection) => void;
  onGoToStep?: (s: number) => void;
};

function GuideShell({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm ring-1 ring-sky-100/80">
      <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">İndi nə etməlisiniz?</p>
      <h2 className="mt-1 text-[15px] font-semibold text-slate-900">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{body}</p>
      {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
    </section>
  );
}

export default function ExamWizardGuide({
  step,
  step1SubSection,
  examId,
  plannedQuestionCount,
  registeredQuestionCount,
  gradingSaved,
  answerKeyComplete,
  sheetConfirmed,
  canGoToAnswerKey,
  onGoToSubSection,
  onGoToStep,
}: Props) {
  if (examId == null && step === 0) {
    return (
      <GuideShell
        title="İmtahanı yaradın"
        body="Başlıq, planlı sual sayı və variant sayını daxil edin. «İmtahanı yarat» düyməsinə basın — sonra sualları əlavə edə bilərsiniz."
      />
    );
  }

  if (step === 0 && examId != null) {
    return (
      <GuideShell
        title="Parametrləri yoxlayın"
        body="İmtahan məlumatları düzgündürsə, «Suallara keç» ilə növbəti addıma keçin."
        action={
          onGoToStep ? (
            <button type="button" className={examPrimaryBtn} onClick={() => onGoToStep(1)}>
              Suallara keç →
            </button>
          ) : null
        }
      />
    );
  }

  if (step === 1 && step1SubSection === "kart") {
    return (
      <GuideShell
        title="Cavab kartı sahələrini seçin"
        body="İştirakçı məlumatı üçün lazım olan xanaları işarələyin. Fənn kodları istəyə bağlıdır. Dəyişiklikdən sonra mütləq «Saxla» basın."
        action={
          onGoToSubSection ? (
            <button type="button" className={examSecondaryBtn} onClick={() => onGoToSubSection("suallar")}>
              Suallara keç →
            </button>
          ) : null
        }
      />
    );
  }

  if (step === 1 && step1SubSection === "suallar") {
    const remaining = Math.max(0, plannedQuestionCount - registeredQuestionCount);
    if (remaining > 0) {
      return (
        <GuideShell
          title={`${remaining} sual qalıb (${registeredQuestionCount}/${plannedQuestionCount})`}
          body="Sual bazasından bir neçə sualı eyni anda seçib «Seçilənləri əlavə et» basın — və ya CSV/endir. Planlı say tam olmadan cavab açarına keçmək olmur."
        />
      );
    }
    if (!gradingSaved) {
      return (
        <GuideShell
          title="Suallar hazırdır — kart parametrlərini saxlayın"
          body="«Kart və fənnlər» bölməsində şəxsiyyət sahələrini seçib «Saxla» basın, sonra cavab açarına keçin."
          action={
            <>
              {onGoToSubSection ? (
                <button type="button" className={examSecondaryBtn} onClick={() => onGoToSubSection("kart")}>
                  Kart parametrləri →
                </button>
              ) : null}
              {canGoToAnswerKey && onGoToStep ? (
                <button type="button" className={examPrimaryBtn} onClick={() => onGoToStep(2)}>
                  Cavab açarına keç →
                </button>
              ) : null}
            </>
          }
        />
      );
    }
    return (
      <GuideShell
        title="Suallar tamamdır"
        body="Cavab açarı addımına keçib hər sual üçün düzgün variantı (A, B, C…) seçin."
        action={
          canGoToAnswerKey && onGoToStep ? (
            <button type="button" className={examPrimaryBtn} onClick={() => onGoToStep(2)}>
              Cavab açarına keç →
            </button>
          ) : null
        }
      />
    );
  }

  if (step === 1 && step1SubSection === "kitabca") {
    return (
      <GuideShell
        title="Sual kitabçası (istəyə bağlı)"
        body="DİM formatında sual kitabçası endirmək istəyirsinizsə parametrləri doldurun. Skan üçün mütləq deyil — əsas axın: suallar → cavab açarı → cavab kartı PDF."
        action={
          onGoToSubSection ? (
            <button type="button" className={examSecondaryBtn} onClick={() => onGoToSubSection("suallar")}>
              Suallara qayıt
            </button>
          ) : null
        }
      />
    );
  }

  if (step === 2) {
    return (
      <GuideShell
        title="Düzgün cavabları seçin"
        body={`Hər sual üçün bir variant (A–E) və xal təyin edin. «Saxla və PDF addımına keç» basın — cəmi ${plannedQuestionCount} sətir olmalıdır.`}
      />
    );
  }

  if (step === 3) {
    if (!sheetConfirmed) {
      return (
        <GuideShell
          title="Cavab kartı PDF yaradın"
          body="Önizləməyə baxın, sonra «PDF yarat və endir» basın. Kart təsdiqlənəndən sonra skan aktiv olur."
        />
      );
    }
    if (!answerKeyComplete) {
      return (
        <GuideShell
          title="Cavab açarı tam deyil"
          body="Geri qayıdıb cavab açarını tamamlayın."
          action={
            onGoToStep ? (
              <button type="button" className={examSecondaryBtn} onClick={() => onGoToStep(2)}>
                Cavab açarı →
              </button>
            ) : null
          }
        />
      );
    }
    return (
      <GuideShell
        title="İmtahan skana hazırdır"
        body="Cavab kartını çap edib skan panelinə keçə bilərsiniz."
      />
    );
  }

  return null;
}
