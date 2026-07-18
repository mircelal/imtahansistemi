import { examWizardStepMeta } from "../examWizardSteps";

type Props = {
  step: number;
  examId: number | null;
  onStep: (i: number) => void;
  stepAllowed: (i: number) => boolean;
};

function CheckIcon() {
  return (
    <svg className="mr-1 inline h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function ExamWizardStepper({ step, examId, onStep, stepAllowed }: Props) {
  const activeMeta = examWizardStepMeta[step];

  return (
    <div className="space-y-2">
      <nav
        aria-label="Addımlar"
        className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100/80 p-1 ring-1 ring-slate-200/60"
      >
        {examWizardStepMeta.map((meta, i) => {
          const disabled = !stepAllowed(i);
          const active = step === i;
          const done = examId != null && step > i;
          return (
            <button
              key={meta.label}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (!disabled) onStep(i);
              }}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-center text-[12px] font-semibold transition sm:px-4 sm:text-[13px] ${
                disabled
                  ? "cursor-not-allowed text-slate-400"
                  : active
                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                    : done
                      ? "text-emerald-700 hover:bg-white/60"
                      : "text-slate-600 hover:bg-white/50"
              }`}
            >
              <span className="mr-1 hidden tabular-nums text-slate-400 sm:inline">{i + 1}.</span>
              {done && !active ? <CheckIcon /> : null}
              {meta.label}
            </button>
          );
        })}
      </nav>
      {activeMeta ? (
        <p className="text-[13px] leading-snug text-slate-600">
          <span className="font-medium text-slate-800">Addım {step + 1}:</span> {activeMeta.description}
        </p>
      ) : null}
    </div>
  );
}
