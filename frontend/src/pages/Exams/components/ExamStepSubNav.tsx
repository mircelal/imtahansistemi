import type { ExamStep1SubSection } from "../examWizardSteps";
import { examStep1SubSections } from "../examWizardSteps";

type SubStatus = Partial<Record<ExamStep1SubSection, boolean>>;

type Props = {
  active: ExamStep1SubSection;
  onChange: (id: ExamStep1SubSection) => void;
  status?: SubStatus;
};

export default function ExamStepSubNav({ active, onChange, status }: Props) {
  const activeMeta = examStep1SubSections.find((s) => s.id === active);

  return (
    <div className="space-y-2">
      <nav
        aria-label="Suallar və fənnlər alt-bölmələri"
        className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/60"
      >
        {examStep1SubSections.map((s) => {
          const isActive = active === s.id;
          const done = status?.[s.id];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-center text-[12px] font-semibold transition sm:text-[13px] ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                  : done
                    ? "text-emerald-700 hover:bg-white/60"
                    : "text-slate-600 hover:bg-white/60"
              }`}
            >
              {done && !isActive ? (
                <span className="mr-1 inline-block text-emerald-600" aria-hidden>
                  ✓
                </span>
              ) : null}
              {s.label}
            </button>
          );
        })}
      </nav>
      {activeMeta ? (
        <p className="text-[12px] leading-snug text-slate-500">{activeMeta.hint}</p>
      ) : null}
    </div>
  );
}
