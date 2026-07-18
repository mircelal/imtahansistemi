import { useState, type ReactNode } from "react";
import { examSecondaryBtn } from "./examUiTokens";

export type QuestionAddMode = "bank" | "csv" | "docx" | "manual";

type Props = {
  mode: QuestionAddMode;
  onModeChange: (m: QuestionAddMode) => void;
  canUseBank: boolean;
  plannedQuestionCount: number;
  registeredQuestionCount: number;
  bankPanel: ReactNode;
  csvPanel: ReactNode;
  docxPanel: ReactNode;
  manualPanel: ReactNode;
  listPanel: ReactNode;
};

const modes: { id: QuestionAddMode; label: string; desc: string }[] = [
  { id: "bank", label: "Sual bazası", desc: "Toplu seçib əlavə et" },
  { id: "docx", label: "Word", desc: ".docx fayldan idxal" },
  { id: "csv", label: "CSV", desc: "Excel-dən idxal" },
  { id: "manual", label: "Tək sual", desc: "Əl ilə yaz" },
];

export default function ExamQuestionsPanel({
  mode,
  onModeChange,
  canUseBank,
  plannedQuestionCount,
  registeredQuestionCount,
  bankPanel,
  csvPanel,
  docxPanel,
  manualPanel,
  listPanel,
}: Props) {
  const pct =
    plannedQuestionCount > 0
      ? Math.min(100, Math.round((registeredQuestionCount / plannedQuestionCount) * 100))
      : 0;
  const complete = registeredQuestionCount >= plannedQuestionCount && plannedQuestionCount > 0;

  const visibleModes = canUseBank ? modes : modes.filter((m) => m.id !== "bank");

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sual irəliləyişi</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
              {registeredQuestionCount}
              <span className="text-base font-semibold text-slate-500"> / {plannedQuestionCount}</span>
            </p>
          </div>
          {complete ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              Tamamdır
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
              {plannedQuestionCount - registeredQuestionCount} sual qalıb
            </span>
          )}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${complete ? "bg-emerald-500" : "bg-sky-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <nav
        aria-label="Sual əlavə üsulu"
        className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/60"
      >
        {visibleModes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onModeChange(m.id)}
            className={`min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left transition ${
              mode === m.id ? "bg-white shadow-sm ring-1 ring-slate-200/80" : "hover:bg-white/60"
            }`}
          >
            <span className="block text-[13px] font-semibold text-slate-900">{m.label}</span>
            <span className="block text-[11px] text-slate-500">{m.desc}</span>
          </button>
        ))}
      </nav>

      {mode === "bank" && canUseBank ? bankPanel : null}
      {mode === "docx" ? docxPanel : null}
      {mode === "csv" ? csvPanel : null}
      {mode === "manual" ? manualPanel : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">İmtahandakı suallar</h3>
        {listPanel}
      </div>
    </div>
  );
}

function FileImportZone({
  accept,
  title,
  hint,
  dragActive,
  importMsg,
  onDragActive,
  onFile,
  formatHelp,
}: {
  accept: string;
  title: string;
  hint: string;
  dragActive: boolean;
  importMsg: string | null;
  onDragActive: (v: boolean) => void;
  onFile: (f: File | undefined) => void;
  formatHelp: ReactNode;
}) {
  const [showFormat, setShowFormat] = useState(false);
  const ext = accept.replace(".", "").toLowerCase();
  return (
    <div className="space-y-3">
      <div
        className={[
          "rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
          dragActive ? "border-sky-400 bg-sky-50/60" : "border-slate-200 bg-slate-50/50 hover:border-slate-300",
        ].join(" ")}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragActive(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragActive(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !f.name.toLowerCase().endsWith(`.${ext}`)) return;
          await onFile(f);
        }}
      >
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
        <label className="mt-4 inline-block cursor-pointer">
          <span className={examSecondaryBtn}>Fayl seç</span>
          <input
            type="file"
            accept={accept}
            className="sr-only"
            onChange={async (e) => {
              await onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {importMsg ? (
          <p
            className={
              importMsg.includes("Yalnız") ||
              importMsg.includes("keçildi") ||
              importMsg.includes("tapılmadı") ||
              importMsg.includes("oxunmadı")
                ? "mt-3 text-sm text-amber-800"
                : "mt-3 text-sm font-medium text-emerald-700"
            }
          >
            {importMsg}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="text-xs font-medium text-slate-600 underline decoration-slate-300"
        onClick={() => setShowFormat((x) => !x)}
      >
        {showFormat ? "Formatı gizlət" : "Fayl formatı (kömək)"}
      </button>
      {showFormat ? (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{formatHelp}</div>
      ) : null}
    </div>
  );
}

export function ExamCsvImportZone({
  csvDragActive,
  importMsg,
  onDragActive,
  onFile,
}: {
  csvDragActive: boolean;
  importMsg: string | null;
  onDragActive: (v: boolean) => void;
  onFile: (f: File | undefined) => void;
}) {
  return (
    <FileImportZone
      accept=".csv"
      title="CSV faylını buraya buraxın"
      hint="Excel-dən ixrac olunmuş .csv"
      dragActive={csvDragActive}
      importMsg={importMsg}
      onDragActive={onDragActive}
      onFile={onFile}
      formatHelp={
        <p>
          Mütləq sütunlar: <code>order_index</code>, <code>stem</code>. İstəyə bağlı:{" "}
          <code>qtype</code> (mcq/grid_in/essay), <code>points</code>, <code>options_json</code>,{" "}
          <code>subject_short_code</code>.
        </p>
      }
    />
  );
}

export function ExamDocxImportZone({
  dragActive,
  importMsg,
  onDragActive,
  onFile,
}: {
  dragActive: boolean;
  importMsg: string | null;
  onDragActive: (v: boolean) => void;
  onFile: (f: File | undefined) => void;
}) {
  return (
    <FileImportZone
      accept=".docx"
      title="Word (.docx) faylını buraya buraxın"
      hint="Nömrələnmiş suallar + A/B/C/D variantları"
      dragActive={dragActive}
      importMsg={importMsg}
      onDragActive={onDragActive}
      onFile={onFile}
      formatHelp={
        <div className="space-y-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
          <p className="font-sans font-medium text-slate-700">Nümunə struktur:</p>
          {`1. Sualın mətni buradadır?
A) Birinci variant
B) İkinci variant
C) Üçüncü variant
D) Dördüncü variant

2. Növbəti sual
A. ...
B. ...`}
          <p className="font-sans text-slate-600">
            Variant olmayanda sual açıq (essay) kimi saxlanır. Eyni nömrə artıq varsa keçilir.
          </p>
        </div>
      }
    />
  );
}
