import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  BankQuestion,
  BankSubject,
  createBankQuestion,
  createBankSubject,
  deleteBankQuestion,
  deleteBankSubject,
  listBankSubjects,
  listQuestionBank,
  updateBankQuestion,
  updateBankSubject
} from "../../api/questionBank";
import { RichHtmlEditor } from "../../components/RichHtmlEditor";
import { SafeHtml } from "../../components/SafeHtml";
import { plainTextFromHtml } from "../../utils/html";
import { useAuthStore } from "../../store/authStore";

type McqState = { choices: { key: string; html: string }[]; correct_key: string };

function defaultMcq(): McqState {
  return {
    choices: ["A", "B", "C", "D"].map((k) => ({ key: k, html: "<p></p>" })),
    correct_key: "A"
  };
}

function parseMcqFromApi(raw: unknown): McqState {
  const d = defaultMcq();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const choicesRaw = o.choices;
  if (!Array.isArray(choicesRaw) || choicesRaw.length < 2) return d;
  const choices: { key: string; html: string }[] = [];
  for (const c of choicesRaw) {
    if (!c || typeof c !== "object") continue;
    const row = c as Record<string, unknown>;
    const key = String(row.key ?? "").trim().toUpperCase().slice(0, 8);
    const html = String(row.html ?? "<p></p>");
    if (key) choices.push({ key, html });
  }
  if (choices.length < 2) return d;
  let correct_key = String(o.correct_key ?? "").trim().toUpperCase().slice(0, 8);
  if (!choices.some((c) => c.key === correct_key)) correct_key = choices[0]!.key;
  return { choices, correct_key };
}

function parseTfFromApi(raw: unknown): "T" | "F" {
  if (!raw || typeof raw !== "object") return "T";
  const ck = String((raw as Record<string, unknown>).correct_key ?? "T").toUpperCase();
  return ck === "F" ? "F" : "T";
}

const diffLabels: Record<string, string> = {
  easy: "Asan",
  medium: "Orta",
  hard: "Çətin"
};

type SubjectForm = { name: string; short_code: string; sort_order: number };

export default function QuestionBankPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === "admin" || user?.role === "manager";

  const [filterSubjectId, setFilterSubjectId] = useState<number | "">("");
  const [filterDiff, setFilterDiff] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [panelQ, setPanelQ] = useState<BankQuestion | null>(null);
  const [panelEdit, setPanelEdit] = useState(false);

  const subjectsQuery = useQuery({
    queryKey: ["bank-subjects"],
    queryFn: () => listBankSubjects(false),
    enabled: canEdit
  });

  const params = useMemo(
    () => ({
      subject_id: filterSubjectId === "" ? undefined : filterSubjectId,
      difficulty: filterDiff || undefined,
      search: filterSearch.trim() || undefined
    }),
    [filterSubjectId, filterDiff, filterSearch]
  );

  const listQuery = useQuery({
    queryKey: ["question-bank", params],
    queryFn: () => listQuestionBank(params),
    enabled: canEdit
  });

  const subjectForm = useForm<SubjectForm>({
    defaultValues: { name: "", short_code: "", sort_order: 0 }
  });

  const createSubjectMut = useMutation({
    mutationFn: (v: SubjectForm) =>
      createBankSubject({
        name: v.name.trim(),
        short_code: v.short_code.trim() || null,
        sort_order: Number(v.sort_order) || 0,
        is_active: true
      }),
    onSuccess: async () => {
      subjectForm.reset({ name: "", short_code: "", sort_order: 0 });
      await qc.invalidateQueries({ queryKey: ["bank-subjects"] });
    }
  });

  const delSubjectMut = useMutation({
    mutationFn: deleteBankSubject,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bank-subjects"] });
      await qc.invalidateQueries({ queryKey: ["question-bank"] });
    }
  });

  const delQMut = useMutation({
    mutationFn: deleteBankQuestion,
    onSuccess: async () => {
      setPanelQ(null);
      setPanelEdit(false);
      await qc.invalidateQueries({ queryKey: ["question-bank"] });
    }
  });

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Sual bazası</h1>
        <p className="mt-2 text-sm text-slate-600">
          Bu bölməyə yalnız menecer və administrator daxil ola bilər.
        </p>
      </div>
    );
  }

  const subjects = subjectsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6">
      <header className="border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sual bazası</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Əvvəl <strong className="font-medium text-slate-800">fənlər</strong> yaradın, sonra hər sualı uyğun fənə
          bağlayın. Çoxtan seçimli suallarda variantların hamısı redaktə oluna bilər; düzgün cavab bir variant seçilir.
          Word və oxşar proqramlardan məzmunu birbaşa yapışdıra bilərsiniz.
        </p>
      </header>

      <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
        <aside className="shrink-0 space-y-4 xl:sticky xl:top-4 xl:w-80">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fənlər</h2>
            <form
              className="mt-3 grid gap-2"
              onSubmit={subjectForm.handleSubmit((v) => createSubjectMut.mutate(v))}
            >
              <input
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Fənn adı (məs. Riyaziyyat)"
                {...subjectForm.register("name", { required: true })}
              />
              <input
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Qısa kod (istəyə bağlı, məs. RIZ)"
                {...subjectForm.register("short_code")}
              />
              <input
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                type="number"
                title="Sıralama"
                {...subjectForm.register("sort_order", { valueAsNumber: true })}
              />
              <button
                type="submit"
                disabled={createSubjectMut.isPending}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Fənn əlavə et
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-0 shadow-inner">
            <div className="border-b border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase text-slate-500">
              Qeydiyyatda olan fənlər
            </div>
            {subjectsQuery.isLoading ? (
              <p className="p-4 text-sm text-slate-500">Yüklənir…</p>
            ) : subjects.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Hələ fənn yoxdur.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto bg-white">
                {subjects.map((s) => (
                  <SubjectRow key={s.id} subject={s} onChanged={() => qc.invalidateQueries({ queryKey: ["bank-subjects"] })} />
                ))}
              </ul>
            )}
          </section>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Yeni sual</h2>
            <p className="mt-1 text-xs text-slate-600">
              ÇS üçün ən azı iki variant; düzgün cavab üçün variantın yanındakı düyməni seçin.
            </p>
            <QuestionComposer subjects={subjects} onCreated={() => qc.invalidateQueries({ queryKey: ["question-bank"] })} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Süzgəc</h2>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <select
                className="min-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filterSubjectId === "" ? "" : String(filterSubjectId)}
                onChange={(e) => setFilterSubjectId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Bütün fənlər</option>
                {subjects.filter((s) => s.is_active).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.short_code ? ` (${s.short_code})` : ""}
                  </option>
                ))}
              </select>
              <select
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filterDiff}
                onChange={(e) => setFilterDiff(e.target.value)}
              >
                <option value="">Bütün çətinliklər</option>
                <option value="easy">Asan</option>
                <option value="medium">Orta</option>
                <option value="hard">Çətin</option>
              </select>
              <input
                className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Mətndə axtar (HTML içindən də)"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-900">Suallar</h2>
              <span className="text-xs text-slate-500">{(listQuery.data ?? []).length} nəticə</span>
            </div>
            {listQuery.isLoading && <p className="p-4 text-sm text-slate-500">Yüklənir…</p>}
            {!listQuery.isLoading && (listQuery.data ?? []).length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">Uyğun sual yoxdur.</p>
            )}
            {(listQuery.data ?? []).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Fənn</th>
                      <th className="px-4 py-3">Çətinlik</th>
                      <th className="px-4 py-3">Növ</th>
                      <th className="px-4 py-3">Mətn</th>
                      <th className="px-4 py-3">Xal</th>
                      <th className="px-4 py-3 text-right">Əməl</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(listQuery.data ?? []).map((q) => (
                      <tr key={q.id} className="cursor-pointer hover:bg-indigo-50/40" onClick={() => {
                        setPanelQ(q);
                        setPanelEdit(false);
                      }}>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{q.id}</td>
                        <td className="px-4 py-3 text-slate-800">
                          {q.subject?.name ?? "—"}
                          {q.subject?.short_code ? (
                            <span className="ml-1 text-xs text-slate-500">({q.subject.short_code})</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{diffLabels[q.difficulty] ?? q.difficulty}</td>
                        <td className="px-4 py-3">{q.qtype === "mcq" ? "ÇS" : "D/Y"}</td>
                        <td className="max-w-md px-4 py-3 text-slate-700">
                          {plainTextFromHtml(q.stem).slice(0, 120)}
                          {plainTextFromHtml(q.stem).length > 120 ? "…" : ""}
                        </td>
                        <td className="px-4 py-3">{q.points}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <button
                            type="button"
                            className="text-indigo-600 hover:text-indigo-900"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPanelQ(q);
                              setPanelEdit(false);
                            }}
                          >
                            Bax
                          </button>
                          <button
                            type="button"
                            className="ml-3 text-red-600 hover:text-red-900"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Sual #${q.id} silinsin?`)) delQMut.mutate(q.id);
                            }}
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>

      {panelQ && (
        <QuestionDetailPanel
          q={panelQ}
          subjects={subjects}
          editing={panelEdit}
          onClose={() => {
            setPanelQ(null);
            setPanelEdit(false);
          }}
          onToggleEdit={() => setPanelEdit((v) => !v)}
          onSaved={async () => {
            setPanelEdit(false);
            await qc.invalidateQueries({ queryKey: ["question-bank"] });
            const fresh = (await listQuestionBank(params)).find((x) => x.id === panelQ.id);
            if (fresh) setPanelQ(fresh);
          }}
          onDelete={() => {
            if (window.confirm(`Sual #${panelQ.id} silinsin?`)) delQMut.mutate(panelQ.id);
          }}
        />
      )}
    </div>
  );
}

function SubjectRow({
  subject,
  onChanged
}: {
  subject: BankSubject;
  onChanged: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const qc = useQueryClient();
  const [name, setName] = useState(subject.name);
  const [code, setCode] = useState(subject.short_code ?? "");
  const [active, setActive] = useState(subject.is_active);

  const saveMut = useMutation({
    mutationFn: () =>
      updateBankSubject(subject.id, {
        name: name.trim(),
        short_code: code.trim() || null,
        is_active: active
      }),
    onSuccess: async () => {
      setEdit(false);
      await qc.invalidateQueries({ queryKey: ["bank-subjects"] });
      onChanged();
    }
  });

  const delMut = useMutation({
    mutationFn: () => deleteBankSubject(subject.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bank-subjects"] });
      onChanged();
    }
  });

  if (!edit) {
    return (
      <li className="flex items-start justify-between gap-2 px-4 py-3">
        <div>
          <div className="font-medium text-slate-900">{subject.name}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {subject.short_code ? `Kod: ${subject.short_code}` : "Kodsuz"}
            {!subject.is_active ? " · qeyri-aktiv" : ""}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => setEdit(true)}>
            Redaktə
          </button>
          <button
            type="button"
            className="text-xs font-medium text-red-600 hover:underline"
            onClick={() => {
              if (window.confirm(`"${subject.name}" silinsin?`)) delMut.mutate();
            }}
          >
            Sil
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <input className="w-full rounded border border-slate-200 px-2 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="w-full rounded border border-slate-200 px-2 py-1 text-sm" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Qısa kod" />
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Aktiv
      </label>
      <div className="flex gap-2">
        <button type="button" className="rounded bg-indigo-600 px-2 py-1 text-xs text-white disabled:opacity-50" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
          Saxla
        </button>
        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setEdit(false)}>
          Ləğv
        </button>
      </div>
    </li>
  );
}

function QuestionComposer({
  subjects,
  onCreated
}: {
  subjects: BankSubject[];
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [difficulty, setDifficulty] = useState("medium");
  const [qtype, setQtype] = useState<"mcq" | "tf">("mcq");
  const [stem, setStem] = useState("<p></p>");
  const [points, setPoints] = useState(1);
  const [mcq, setMcq] = useState<McqState>(() => defaultMcq());
  const [tfCorrect, setTfCorrect] = useState<"T" | "F">("T");

  const createMut = useMutation({
    mutationFn: async () => {
      const opts =
        qtype === "mcq"
          ? { choices: mcq.choices, correct_key: mcq.correct_key }
          : { correct_key: tfCorrect };
      return createBankQuestion({
        subject_id: subjectId === "" ? undefined : subjectId,
        difficulty,
        qtype,
        stem,
        points,
        options: opts
      });
    },
    onSuccess: async () => {
      setStem("<p></p>");
      setMcq(defaultMcq());
      setTfCorrect("T");
      await qc.invalidateQueries({ queryKey: ["question-bank"] });
      onCreated();
    }
  });

  const addChoice = () => {
    setMcq((m) => {
      const used = new Set(m.choices.map((c) => c.key));
      let key = "";
      for (let i = 0; i < 26; i++) {
        const cand = String.fromCharCode(65 + i);
        if (!used.has(cand)) {
          key = cand;
          break;
        }
      }
      if (!key) key = `V${m.choices.length + 1}`;
      return { ...m, choices: [...m.choices, { key, html: "<p></p>" }] };
    });
  };

  const removeChoice = (idx: number) => {
    setMcq((m) => {
      const choices = m.choices.filter((_, i) => i !== idx);
      if (choices.length < 2) return m;
      let correct_key = m.correct_key;
      if (!choices.some((c) => c.key === correct_key)) correct_key = choices[0]!.key;
      return { choices, correct_key };
    });
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-12">
        <label className={`sm:col-span-4 block text-xs font-medium text-slate-600`}>
          Fənn
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={subjectId === "" ? "" : String(subjectId)}
            onChange={(e) => setSubjectId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">— seçilməyə bilər —</option>
            {subjects.filter((s) => s.is_active).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.short_code ? ` (${s.short_code})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-3 block text-xs font-medium text-slate-600">
          Çətinlik
          <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="easy">Asan</option>
            <option value="medium">Orta</option>
            <option value="hard">Çətin</option>
          </select>
        </label>
        <label className="sm:col-span-3 block text-xs font-medium text-slate-600">
          Növ
          <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={qtype} onChange={(e) => setQtype(e.target.value as "mcq" | "tf")}>
            <option value="mcq">Çoxtan seçimli</option>
            <option value="tf">Doğru / Yanlış</option>
          </select>
        </label>
        <label className="sm:col-span-2 block text-xs font-medium text-slate-600">
          Xal
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" step="0.25" value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        </label>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-600">Sual mətni</p>
        <div className="mt-1">
          <RichHtmlEditor value={stem} onChange={setStem} minHeightClass="min-h-[160px]" />
        </div>
      </div>

      {qtype === "mcq" ? (
        <div className="space-y-3 rounded-xl border border-slate-100 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">Variantlar</span>
            <button type="button" className="text-xs font-medium text-indigo-600 hover:underline" onClick={addChoice}>
              + Variant əlavə et
            </button>
          </div>
          {mcq.choices.map((c, idx) => (
            <div key={`${c.key}-${idx}`} className="rounded-lg border border-slate-100 p-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-500">{c.key}</span>
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="radio" name="correct_new" checked={mcq.correct_key === c.key} onChange={() => setMcq((m) => ({ ...m, correct_key: c.key }))} />
                  Düzgün cavab
                </label>
                {mcq.choices.length > 2 ? (
                  <button type="button" className="ml-auto text-xs text-red-600 hover:underline" onClick={() => removeChoice(idx)}>
                    Variantı sil
                  </button>
                ) : null}
              </div>
              <RichHtmlEditor value={c.html} onChange={(html) => setMcq((m) => {
                const choices = m.choices.map((row, i) => (i === idx ? { ...row, html } : row));
                return { ...m, choices };
              })} minHeightClass="min-h-[72px]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-100 bg-white p-3">
          <span className="text-xs font-semibold text-slate-700">Düzgün cavab</span>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="tf_new" checked={tfCorrect === "T"} onChange={() => setTfCorrect("T")} />
              Doğru (T)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="tf_new" checked={tfCorrect === "F"} onChange={() => setTfCorrect("F")} />
              Yanlış (F)
            </label>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={createMut.isPending}
        className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        onClick={() => createMut.mutate()}
      >
        {createMut.isPending ? "Yaradılır…" : "Bazaya əlavə et"}
      </button>
      {createMut.isError ? (
        <p className="text-sm text-red-600">Yaratma alınmadı — variantları və düzgün cavabı yoxlayın.</p>
      ) : null}
    </div>
  );
}

function QuestionDetailPanel({
  q,
  subjects,
  editing,
  onClose,
  onToggleEdit,
  onSaved,
  onDelete
}: {
  q: BankQuestion;
  subjects: BankSubject[];
  editing: boolean;
  onClose: () => void;
  onToggleEdit: () => void;
  onSaved: () => Promise<void>;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [subjectId, setSubjectId] = useState<number | "">(q.subject_id ?? "");
  const [difficulty, setDifficulty] = useState(q.difficulty || "medium");
  const [qtype, setQtype] = useState(q.qtype);
  const [stem, setStem] = useState(q.stem || "<p></p>");
  const [points, setPoints] = useState(q.points);
  const [mcq, setMcq] = useState<McqState>(() => (q.qtype === "mcq" ? parseMcqFromApi(q.options) : defaultMcq()));
  const [tfCorrect, setTfCorrect] = useState<"T" | "F">(() => (q.qtype === "tf" ? parseTfFromApi(q.options) : "T"));

  const saveMut = useMutation({
    mutationFn: async () => {
      const opts =
        qtype === "mcq"
          ? { choices: mcq.choices, correct_key: mcq.correct_key }
          : { correct_key: tfCorrect };
      await updateBankQuestion(q.id, {
        subject_id: subjectId === "" ? null : subjectId,
        difficulty,
        qtype,
        stem,
        points,
        options: opts
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["question-bank"] });
      await onSaved();
    }
  });

  useEffect(() => {
    if (!editing) {
      setSubjectId(q.subject_id ?? "");
      setDifficulty(q.difficulty || "medium");
      setQtype(q.qtype);
      setStem(q.stem || "<p></p>");
      setPoints(q.points);
      setMcq(q.qtype === "mcq" ? parseMcqFromApi(q.options) : defaultMcq());
      setTfCorrect(q.qtype === "tf" ? parseTfFromApi(q.options) : "T");
    }
  }, [q, editing]);

  const syncFromProp = () => {
    setSubjectId(q.subject_id ?? "");
    setDifficulty(q.difficulty || "medium");
    setQtype(q.qtype);
    setStem(q.stem || "<p></p>");
    setPoints(q.points);
    setMcq(q.qtype === "mcq" ? parseMcqFromApi(q.options) : defaultMcq());
    setTfCorrect(q.qtype === "tf" ? parseTfFromApi(q.options) : "T");
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[1px]" role="dialog">
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sual bazası</p>
            <h3 className="text-lg font-semibold text-slate-900">#{q.id}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!editing ? (
              <button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white" onClick={onToggleEdit}>
                Redaktə
              </button>
            ) : (
              <>
                <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => { syncFromProp(); onToggleEdit(); }}>
                  Baxışa qayıt
                </button>
                <button type="button" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
                  Saxla
                </button>
              </>
            )}
            <button type="button" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-800" onClick={onDelete}>
              Sil
            </button>
            <button type="button" className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!editing ? (
            <div className="space-y-6">
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                <div className="flex flex-wrap gap-3 text-xs">
                  <span>
                    <strong>Fənn:</strong> {q.subject?.name ?? "—"}{" "}
                    {q.subject?.short_code ? `(${q.subject.short_code})` : ""}
                  </span>
                  <span>
                    <strong>Çətinlik:</strong> {diffLabels[q.difficulty] ?? q.difficulty}
                  </span>
                  <span>
                    <strong>Növ:</strong> {q.qtype === "mcq" ? "ÇS" : "D/Y"}
                  </span>
                  <span>
                    <strong>Xal:</strong> {q.points}
                  </span>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500">Sual</h4>
                <SafeHtml html={q.stem} className="mt-2 rounded-xl border border-slate-100 bg-white p-4" />
              </div>
              {q.qtype === "mcq" ? (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Variantlar</h4>
                  <ul className="mt-2 space-y-3">
                    {parseMcqFromApi(q.options).choices.map((c) => (
                      <li key={c.key} className={`rounded-xl border p-3 ${parseMcqFromApi(q.options).correct_key === c.key ? "border-emerald-300 bg-emerald-50/50" : "border-slate-100 bg-white"}`}>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-600">{c.key}</span>
                          {parseMcqFromApi(q.options).correct_key === c.key ? (
                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">Düzgün</span>
                          ) : null}
                        </div>
                        <SafeHtml html={c.html} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-slate-700">
                  <strong>Düzgün cavab:</strong> {parseTfFromApi(q.options) === "T" ? "Doğru (T)" : "Yanlış (F)"}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">
                  Fənn
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={subjectId === "" ? "" : String(subjectId)}
                    onChange={(e) => setSubjectId(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">— yox —</option>
                    {subjects.filter((s) => s.is_active).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Çətinlik
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                    <option value="easy">Asan</option>
                    <option value="medium">Orta</option>
                    <option value="hard">Çətin</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Növ
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={qtype} onChange={(e) => setQtype(e.target.value as "mcq" | "tf")}>
                    <option value="mcq">ÇS</option>
                    <option value="tf">D/Y</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Xal
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" type="number" step="0.25" value={points} onChange={(e) => setPoints(Number(e.target.value))} />
                </label>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600">Sual mətni</p>
                <RichHtmlEditor value={stem} onChange={setStem} minHeightClass="min-h-[160px]" />
              </div>
              {qtype === "mcq" ? (
                <div className="space-y-3">
                  {mcq.choices.map((c, idx) => (
                    <div key={`${c.key}-${idx}`} className="rounded-lg border border-slate-100 p-2">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold">{c.key}</span>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="radio" name="correct_edit" checked={mcq.correct_key === c.key} onChange={() => setMcq((m) => ({ ...m, correct_key: c.key }))} />
                          Düzgün
                        </label>
                        {mcq.choices.length > 2 ? (
                          <button type="button" className="ml-auto text-xs text-red-600" onClick={() => setMcq((m) => {
                            const choices = m.choices.filter((_, i) => i !== idx);
                            if (choices.length < 2) return m;
                            let correct_key = m.correct_key;
                            if (!choices.some((x) => x.key === correct_key)) correct_key = choices[0]!.key;
                            return { choices, correct_key };
                          })}>
                            Sil
                          </button>
                        ) : null}
                      </div>
                      <RichHtmlEditor value={c.html} onChange={(html) => setMcq((m) => ({
                        ...m,
                        choices: m.choices.map((row, i) => (i === idx ? { ...row, html } : row))
                      }))} minHeightClass="min-h-[72px]" />
                    </div>
                  ))}
                  <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setMcq((m) => {
                    const n = m.choices.length + 1;
                    const key = `V${n}`;
                    return { ...m, choices: [...m.choices, { key, html: "<p></p>" }] };
                  })}>
                    + Variant
                  </button>
                </div>
              ) : (
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={tfCorrect === "T"} onChange={() => setTfCorrect("T")} />
                    Doğru (T)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={tfCorrect === "F"} onChange={() => setTfCorrect("F")} />
                    Yanlış (F)
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
