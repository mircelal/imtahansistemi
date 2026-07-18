import { useMemo, useState } from "react";
import type { BankQuestion } from "../../../api/questionBank";
import { plainTextFromHtml } from "../../../utils/html";
import { examInput, examLabel, examPrimaryBtn, examSecondaryBtn } from "./examUiTokens";

type Props = {
  questions: BankQuestion[];
  isLoading: boolean;
  isError: boolean;
  subjects: { id: number; name: string; short_code: string | null }[];
  subjectsLoading: boolean;
  plannedQuestionCount: number;
  registeredQuestionCount: number;
  nextOrderIndex: number;
  isAdding: boolean;
  bulkResult: string | null;
  onSearchChange: (v: string) => void;
  onSubjectFilterChange: (v: string) => void;
  onBulkAdd: (bankIds: number[]) => void;
  search: string;
  subjectFilterId: string;
};

export default function ExamQuestionBankPicker({
  questions,
  isLoading,
  isError,
  subjects,
  subjectsLoading,
  plannedQuestionCount,
  registeredQuestionCount,
  nextOrderIndex,
  isAdding,
  bulkResult,
  onSearchChange,
  onSubjectFilterChange,
  onBulkAdd,
  search,
  subjectFilterId,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const remaining = Math.max(0, plannedQuestionCount - registeredQuestionCount);

  const visibleIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedCount = selected.size;

  function toggle(id: number) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const n = new Set(prev);
      for (const id of visibleIds) n.add(id);
      return n;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleBulkAdd() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    onBulkAdd(ids);
    setSelected(new Set());
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-emerald-950">Sual bazası</h3>
            <p className="mt-1 text-xs text-emerald-900/85">
              Bir neçə sualı checkbox ilə seçin, sonra «Seçilənləri əlavə et» basın. Sıra nömrəsi avtomatik
              {nextOrderIndex}-dən başlayacaq.
            </p>
          </div>
          <div className="rounded-lg bg-white px-3 py-2 text-center ring-1 ring-emerald-200/80">
            <p className="text-[10px] font-semibold uppercase text-emerald-800">Qalan</p>
            <p className="text-lg font-bold tabular-nums text-emerald-950">
              {remaining}
              <span className="text-xs font-normal text-emerald-800"> / {plannedQuestionCount}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-12">
          <label className={`${examLabel} sm:col-span-6`}>
            Axtarış
            <input
              className={examInput}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Sual mətninə görə"
            />
          </label>
          <label className={`${examLabel} sm:col-span-6`}>
            Fənn
            <select
              className={examInput}
              value={subjectFilterId}
              onChange={(e) => onSubjectFilterChange(e.target.value)}
              disabled={subjectsLoading}
            >
              <option value="">Hamısı</option>
              {subjects.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                  {s.short_code ? ` (${s.short_code})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={examSecondaryBtn} onClick={selectAllVisible} disabled={!visibleIds.length}>
            Siyahıdakı hamısını seç
          </button>
          <button
            type="button"
            className={examSecondaryBtn}
            onClick={clearSelection}
            disabled={selectedCount === 0}
          >
            Seçimi təmizlə
          </button>
          <span className="text-xs text-emerald-900/80">
            Seçilmiş: <strong>{selectedCount}</strong>
          </span>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Sual bazası yüklənir…</p>}
      {isError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Sual bazası yüklənmədi.
        </p>
      )}
      {!isLoading && questions.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          Uyğun sual tapılmadı. Axtarışı dəyişin və ya admin panelindən sual bazasına sual əlavə edin.
        </p>
      )}

      <div className="grid max-h-[min(480px,55vh)] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {questions.map((b) => {
          const plain = plainTextFromHtml(b.stem || "");
          const preview = plain.trim()
            ? plain.slice(0, 180) + (plain.length > 180 ? "…" : "")
            : "(mətn yoxdur)";
          const checked = selected.has(b.id);
          return (
            <label
              key={b.id}
              className={[
                "flex cursor-pointer gap-3 rounded-xl border p-3 text-left text-sm transition",
                checked
                  ? "border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-300"
                  : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30",
              ].join(" ")}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                checked={checked}
                onChange={() => toggle(b.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-slate-900">#{b.id}</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-700">
                    {b.qtype === "tf" ? "D/Y" : "MT"}
                  </span>
                </span>
                {b.subject ? (
                  <span className="mt-0.5 block text-xs font-medium text-emerald-800">
                    {b.subject.short_code || b.subject.name}
                  </span>
                ) : null}
                <span className="mt-1.5 block line-clamp-3 text-slate-700">{preview}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 border-t border-slate-200 bg-white/95 px-1 py-3 backdrop-blur-sm">
        <button
          type="button"
          disabled={selectedCount === 0 || isAdding || remaining <= 0}
          className={`${examPrimaryBtn} w-full sm:w-auto`}
          onClick={handleBulkAdd}
        >
          {isAdding
            ? "Əlavə olunur…"
            : selectedCount > 0
              ? `Seçilən ${Math.min(selectedCount, remaining)} sualı əlavə et`
              : "Sual seçin"}
        </button>
        {remaining <= 0 && registeredQuestionCount >= plannedQuestionCount ? (
          <p className="mt-2 text-xs text-emerald-700">Planlı sual sayına çatdınız.</p>
        ) : null}
        {bulkResult ? (
          <p className="mt-2 text-sm text-slate-700">{bulkResult}</p>
        ) : null}
      </div>
    </div>
  );
}
