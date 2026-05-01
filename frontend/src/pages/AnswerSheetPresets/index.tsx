import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listCourses } from "../../api/courses";
import { listExams } from "../../api/exams";
import {
  createAnswerSheetPreset,
  deleteAnswerSheetPreset,
  duplicateAnswerSheetPreset,
  listAnswerSheetPresets,
  type AnswerSheetPresetOut,
} from "../../api/sheetPresets";
import { useAuthStore } from "../../store/authStore";

export default function AnswerSheetPresetsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [courseFilter, setCourseFilter] = useState<number | "">("");
  const [examPickId, setExamPickId] = useState<number | "">("");
  const [newName, setNewName] = useState("");
  const [newCourseId, setNewCourseId] = useState<number | "">("");

  const canManage = user?.role === "admin" || user?.role === "manager" || user?.role === "operator";

  const presetsQuery = useQuery({
    queryKey: ["sheet-presets", courseFilter],
    queryFn: () =>
      listAnswerSheetPresets(
        courseFilter === "" ? undefined : { course_id: Number(courseFilter) },
      ),
    enabled: canManage,
  });

  const coursesQuery = useQuery({
    queryKey: ["courses"],
    queryFn: listCourses,
    enabled: canManage && user?.role !== "student",
  });

  const examsQuery = useQuery({
    queryKey: ["exams"],
    queryFn: () => listExams(),
    enabled: canManage,
  });

  const filteredExams = useMemo(() => {
    const xs = examsQuery.data ?? [];
    if (courseFilter === "") return xs;
    return xs.filter((e) => e.course_id === Number(courseFilter));
  }, [examsQuery.data, courseFilter]);

  const createMut = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      if (!name) throw new Error("Ad daxil edin");
      let cid: number | null = null;
      if (user?.role === "admin") {
        cid = newCourseId === "" ? null : Number(newCourseId);
      } else {
        if (newCourseId === "") throw new Error("Kurs seçin");
        cid = Number(newCourseId);
      }
      const seed: Record<string, unknown> = {
        identity_section: true,
        layout_mode: "freeform",
        identity_fields: [],
        mcq_grid: { top_mm: 0, left_mm: 19 },
        paper_size: "A4",
        title: "CAVAB KARTI",
        question_count: 30,
        options_per_question: 5,
        columns_count: 4,
      };
      return createAnswerSheetPreset({
        course_id: cid,
        name,
        template_config: seed,
      });
    },
    onSuccess: async () => {
      setNewName("");
      await qc.invalidateQueries({ queryKey: ["sheet-presets"] });
    },
  });

  const dupMut = useMutation({
    mutationFn: (row: AnswerSheetPresetOut) => duplicateAnswerSheetPreset(row.id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["sheet-presets"] }),
  });

  const delMut = useMutation({
    mutationFn: deleteAnswerSheetPreset,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["sheet-presets"] }),
  });

  const designerExamId =
    examPickId === ""
      ? ""
      : Number(examPickId);

  if (!canManage) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Cavab kartı şablonları</h1>
        <p className="mt-2 text-sm text-slate-600">Bu bölməyə yalnız heyət üzvləri daxil ola bilər.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="space-y-2 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Cavab kartı şablonları</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          Dizaynı bir dəfə qurursunuz, bir çox imtahanda təkrar istifadə edirsiniz. İmtahan yaradarkən uyğun şablonu
          seçirsiniz; sistem sual sayını və variant sayını həmin imtahandan götürüb kartı yeniləyir.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Filtr və dizayner üçün nümunə imtahan</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={courseFilter === "" ? "" : String(courseFilter)}
            onChange={(e) => setCourseFilter(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Bütün görünən şablonlar</option>
            {(coursesQuery.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={examPickId === "" ? "" : String(examPickId)}
            onChange={(e) => setExamPickId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Dizaynerdə önizləmə üçün imtahan seçin…</option>
            {filteredExams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                №{ex.id} — {ex.title}
                {ex.course_id ? "" : " (ümumi)"}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 shadow-inner">
        <h2 className="text-sm font-semibold text-indigo-950">Yeni şablon (minimum başlanğıc)</h2>
        <p className="mt-1 text-xs text-indigo-900/80">
          Ətraflı dizayn üçün yaradıldıqdan sonra «Dizaynerdə aç» düyməsindən istifadə edin.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <input
            className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Şablon adı"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          {user?.role === "admin" ? (
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={newCourseId === "" ? "" : String(newCourseId)}
              onChange={(e) => setNewCourseId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">Ümumi şablon (bütün kurslar)</option>
              {(coursesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={newCourseId === "" ? "" : String(newCourseId)}
              onChange={(e) => setNewCourseId(e.target.value === "" ? "" : Number(e.target.value))}
              required
            >
              <option value="">Kurs seçin</option>
              {(coursesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={createMut.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Yaradılır…" : "Yarat"}
          </button>
        </div>
        {createMut.isError && (
          <p className="mt-2 text-sm text-red-700">{createMut.error instanceof Error ? createMut.error.message : "Xəta"}</p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Şablon siyahısı</h2>
        </div>
        {presetsQuery.isLoading && <p className="p-4 text-sm text-slate-500">Yüklənir…</p>}
        {(presetsQuery.data ?? []).length === 0 && !presetsQuery.isLoading && (
          <p className="p-6 text-center text-sm text-slate-500">Şablon yoxdur və ya filtrə uyğun deyil.</p>
        )}
        {(presetsQuery.data ?? []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ad</th>
                  <th className="px-4 py-3">Kurs</th>
                  <th className="px-4 py-3">İmtahan bağlantısı</th>
                  <th className="px-4 py-3 text-right">Əməl</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(presetsQuery.data ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.course_id == null ? (
                        <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">Ümumi</span>
                      ) : (
                        (coursesQuery.data ?? []).find((c) => c.id === p.course_id)?.name ?? `№${p.course_id}`
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.exams_linked_count}</td>
                    <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        className={`font-medium text-indigo-600 hover:text-indigo-900 ${designerExamId === "" ? "pointer-events-none opacity-40" : ""}`}
                        to={designerExamId === "" ? "#" : `/designer?presetId=${p.id}&examId=${designerExamId}`}
                        onClick={(e) => {
                          if (designerExamId === "") {
                            e.preventDefault();
                            window.alert("Əvvəl nümunə imtahan seçin.");
                          }
                        }}
                      >
                        Dizaynerdə aç
                      </Link>
                      <button
                        type="button"
                        className="text-sm text-slate-600 hover:text-slate-900"
                        onClick={() => dupMut.mutate(p)}
                      >
                        Surət
                      </button>
                      <button
                        type="button"
                        className="text-sm text-red-600 hover:text-red-900"
                        onClick={() => {
                          if (window.confirm(`«${p.name}» silinsin?`)) delMut.mutate(p.id);
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
    </div>
  );
}
