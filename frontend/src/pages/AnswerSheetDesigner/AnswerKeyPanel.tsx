import { useMemo, useRef, useState, type FormEvent } from "react";
import type { SheetConfig } from "./hooks/useSheetConfig";

type BaseProps = {
  config: SheetConfig;
  answers: Record<number, string>;
  onChange: (answers: Record<number, string>) => void;
};

export type AnswerKeyPanelProps =
  | (BaseProps & { variant?: "compact"; onOpenWorkspace: () => void })
  | (BaseProps & { variant: "workspace" });

function countFilled(answers: Record<number, string>, n: number): number {
  let c = 0;
  for (let i = 1; i <= n; i += 1) {
    const v = String(answers[i] ?? "").trim();
    if (v) c += 1;
  }
  return c;
}

/** Modal / tam panel üçün rahat seçim şəbəkəsi */
export function AnswerKeyWorkspace({ config, answers, onChange }: BaseProps) {
  const n = Math.min(200, Math.max(1, config.question_count));
  const letters = ["A", "B", "C", "D", "E"].slice(0, config.options_per_question);
  const [jump, setJump] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  const filled = useMemo(() => countFilled(answers, n), [answers, n]);
  const pct = n > 0 ? Math.round((filled / n) * 100) : 0;

  const setOne = (q: number, v: string) => {
    onChange({ ...answers, [q]: v });
  };

  const fillAll = (letter: string) => {
    const next: Record<number, string> = { ...answers };
    for (let i = 1; i <= n; i += 1) next[i] = letter;
    onChange(next);
  };

  const clearAll = () => onChange({});

  const scrollToQuestion = (q: number) => {
    const el = gridRef.current?.querySelector(`[data-aq-q="${q}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onJumpSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = parseInt(jump, 10);
    if (Number.isFinite(q) && q >= 1 && q <= n) {
      scrollToQuestion(q);
      setJump("");
    }
  };

  const questions = useMemo(() => Array.from({ length: n }, (_, i) => i + 1), [n]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50/80">
      <div className="shrink-0 space-y-3 border-b border-slate-200/90 bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-slate-600">
              <span className="font-semibold text-slate-900">{filled}</span> / {n} cavab ·{" "}
              <span className="text-slate-500">{pct}%</span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[#c0176a] transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-500">Hamısı:</span>
            {(["A", "B", "C", "D", "E"] as const)
              .slice(0, config.options_per_question)
              .map((L) => (
                <button
                  key={L}
                  type="button"
                  className="rounded-lg border border-[#c0176a]/40 bg-[#fdf0f6] px-3 py-2 text-[13px] font-semibold text-[#7d0d46] hover:bg-[#fce8f3]"
                  onClick={() => fillAll(L)}
                >
                  {L}
                </button>
              ))}
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50"
              onClick={clearAll}
            >
              Təmizlə
            </button>
          </div>
        </div>
        <form onSubmit={onJumpSubmit} className="flex flex-wrap items-center gap-2">
          <label htmlFor="aq-jump" className="text-[12px] font-medium text-slate-600">
            Suala keç:
          </label>
          <input
            id="aq-jump"
            type="number"
            min={1}
            max={n}
            placeholder={`1–${n}`}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus:border-[#c0176a]/50 focus:ring-2 focus:ring-[#c0176a]/15"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-slate-800"
          >
            Göstər
          </button>
        </form>
      </div>

      <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
        <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {questions.map((q) => {
            const cur = answers[q] ?? "";
            return (
              <div
                key={q}
                data-aq-q={q}
                className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm ring-1 ring-black/[0.03]"
              >
                <div className="mb-2.5 text-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sual</span>
                  <div className="text-[17px] font-bold tabular-nums text-slate-900">{q}</div>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {letters.map((L) => {
                    const on = cur === L;
                    return (
                      <button
                        key={L}
                        type="button"
                        aria-pressed={on}
                        aria-label={`Sual ${q}, variant ${L}`}
                        className={`flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border-2 text-[15px] font-bold transition active:scale-[0.97] ${
                          on
                            ? "border-[#9b1257] bg-[#c0176a] text-white shadow-md"
                            : "border-slate-300 bg-white text-slate-800 hover:border-[#c0176a]/50 hover:bg-[#fdf0f6]"
                        }`}
                        onClick={() => setOne(q, on ? "" : L)}
                      >
                        {L}
                      </button>
                    );
                  })}
                </div>
                {cur ? (
                  <button
                    type="button"
                    className="mx-auto mt-2 block text-[11px] text-slate-500 underline decoration-dotted hover:text-slate-800"
                    onClick={() => setOne(q, "")}
                  >
                    sıfırla
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Yan panel: xülasə; tam UI modalda */
export default function AnswerKeyPanel(props: AnswerKeyPanelProps) {
  if (props.variant === "workspace") {
    return <AnswerKeyWorkspace config={props.config} answers={props.answers} onChange={props.onChange} />;
  }

  const { config, answers, onChange, onOpenWorkspace } = props;
  const n = Math.min(200, Math.max(1, config.question_count));
  const filled = useMemo(() => countFilled(answers, n), [answers, n]);

  return (
    <div className="space-y-3 print:hidden">
      <div>
        <h3 className="text-[12px] font-semibold text-slate-900">Cavab açarı</h3>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          Dar paneldə siyahı sığmır. Rahat seçim üçün böyük panel açılır.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3">
        <p className="text-[20px] font-bold tabular-nums text-slate-900">
          {filled}
          <span className="text-[13px] font-normal text-slate-500"> / {n}</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-[#c0176a]"
            style={{ width: `${n ? (filled / n) * 100 : 0}%` }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenWorkspace}
        className="w-full rounded-xl px-4 py-3 text-[13px] font-semibold text-white shadow-md transition hover:opacity-95 active:scale-[0.99]"
        style={{ background: "#c0176a" }}
      >
        Cavabları seç…
      </button>
    </div>
  );
}
