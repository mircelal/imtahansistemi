import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listCourses } from "../../api/courses";
import { listExams } from "../../api/exams";
import {
  createAnswerSheetPreset,
  deleteAnswerSheetPreset,
  duplicateAnswerSheetPreset,
  listAnswerSheetPresets,
  type AnswerSheetPresetOut,
} from "../../api/sheetPresets";
import { IconCopy, IconEye, IconLayout, IconPencil, IconPlus, IconTrash } from "../../components/icons";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import DropdownMenu from "../../components/ui/DropdownMenu";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import { useAuthStore } from "../../store/authStore";
import { DEFAULT_SHEET_CONFIG } from "./hooks/useSheetConfig";
import { dimStandardTemplate, fieldsToApiPayload } from "./layoutBlockModel";
import { formatDate } from "../../utils/dateFormat";

type StatCardProps = {
  label: string;
  value: number | string;
  hint?: string;
  accent?: string;
};

function StatCard({ label, value, hint, accent = "from-slate-50 to-white" }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-gradient-to-br ${accent} p-5 shadow-sm ring-1 ring-slate-100`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/**
 * /designer — şablon seçilməyəndə: cavab kartı şablonlarının idarə paneli.
 */
export default function AnswerSheetDesignerHub() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const examFromUrl = Number(params.get("examId") || params.get("exam_id") || "");
  const initialExam = Number.isFinite(examFromUrl) && examFromUrl > 0 ? examFromUrl : null;

  const [courseFilter, setCourseFilter] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [previewExamId, setPreviewExamId] = useState<number | null>(initialExam);
  const [newName, setNewName] = useState("");
  const [newCourseId, setNewCourseId] = useState<number | "">("");
  const [showCreate, setShowCreate] = useState(false);

  const examsQuery = useQuery({
    queryKey: ["exams-hub-picker"],
    queryFn: () => listExams(),
  });

  const presetsQuery = useQuery({
    queryKey: ["sheet-presets", courseFilter],
    queryFn: () =>
      listAnswerSheetPresets(courseFilter === "" ? undefined : { course_id: Number(courseFilter) }),
  });

  const coursesQuery = useQuery({
    queryKey: ["courses"],
    queryFn: listCourses,
    enabled: user?.role !== "student",
  });

  const allPresets = presetsQuery.data ?? [];

  const filteredPresets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allPresets;
    return allPresets.filter((p) => p.name.toLowerCase().includes(q));
  }, [allPresets, search]);

  const stats = useMemo(() => {
    const globalCount = allPresets.filter((p) => p.course_id == null).length;
    const courseCount = allPresets.length - globalCount;
    const linkedExams = allPresets.reduce((sum, p) => sum + p.exams_linked_count, 0);
    const activeCount = allPresets.filter((p) => p.is_active).length;
    return { total: allPresets.length, globalCount, courseCount, linkedExams, activeCount };
  }, [allPresets]);

  const courseName = (courseId: number | null) => {
    if (courseId == null) return "Ümumi";
    return (coursesQuery.data ?? []).find((c) => c.id === courseId)?.name ?? `Kurs №${courseId}`;
  };

  /** İmtahan məcburi deyil — yalnız önizləmə/PDF üçün əlavə olunur. */
  const designerHref = (presetId: number, view: boolean) => {
    const q = new URLSearchParams();
    q.set("presetId", String(presetId));
    if (previewExamId != null) q.set("examId", String(previewExamId));
    if (view) q.set("view", "1");
    return `/designer?${q.toString()}`;
  };

  const examsForPicker = useMemo(() => {
    const all = examsQuery.data ?? [];
    if (courseFilter === "") return all;
    return all.filter((ex) => ex.course_id === Number(courseFilter));
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
      const { fields, mcqGridPos } = dimStandardTemplate(DEFAULT_SHEET_CONFIG);
      const seed: Record<string, unknown> = {
        identity_section: true,
        layout_mode: "freeform",
        identity_fields: fieldsToApiPayload(fields),
        mcq_grid: { top_mm: mcqGridPos.top_mm, left_mm: mcqGridPos.left_mm },
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
    onSuccess: async (row) => {
      setNewName("");
      setShowCreate(false);
      await qc.invalidateQueries({ queryKey: ["sheet-presets"] });
      navigate(designerHref(row.id, false));
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

  const menuItems = (p: AnswerSheetPresetOut) => {
    const viewTo = designerHref(p.id, true);
    const editTo = designerHref(p.id, false);
    return [
      { type: "link" as const, label: "Bax", icon: <IconEye />, to: viewTo },
      { type: "link" as const, label: "Redaktə et", icon: <IconPencil />, to: editTo },
      { type: "divider" as const },
      {
        type: "action" as const,
        label: "Surət çıxart",
        icon: <IconCopy />,
        onClick: () => dupMut.mutate(p),
        disabled: dupMut.isPending,
      },
      {
        type: "action" as const,
        label: "Sil",
        icon: <IconTrash />,
        variant: "danger" as const,
        onClick: () => {
          if (window.confirm(`«${p.name}» silinsin?`)) delMut.mutate(p.id);
        },
        disabled: delMut.isPending,
      },
    ];
  };

  return (
    <div className="page-container-wide">
      <PageHeader
        title="Cavab vərəqi"
        subtitle="Şablonu birbaşa redaktə edin. Önizləmə və PDF üçün imtahanı burada və ya dizaynerdə seçə bilərsiniz."
        action={
          <Button type="button" onClick={() => setShowCreate((v) => !v)}>
            <IconPlus size={16} />
            Yeni şablon
          </Button>
        }
      />

      {/* Statistika */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Şablon statistikası">
        <StatCard label="Cəmi şablon" value={stats.total} hint={`${stats.activeCount} aktiv`} accent="from-sky-50/80 to-white" />
        <StatCard label="Ümumi şablon" value={stats.globalCount} hint="Bütün kurslar üçün" accent="from-violet-50/80 to-white" />
        <StatCard label="Kurs şablonu" value={stats.courseCount} hint="Kursa bağlı" accent="from-amber-50/80 to-white" />
        <StatCard label="Bağlı imtahan" value={stats.linkedExams} hint="Şablon istifadəsi" accent="from-emerald-50/80 to-white" />
      </section>

      {/* Filtr toolbar */}
      <Card padding="sm" className="!p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-600">Axtarış</span>
              <input
                type="search"
                placeholder="Şablon adı…"
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm outline-none ring-brand/30 transition focus:border-brand focus:bg-white focus:ring-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-600">Kurs filtri</span>
              <select
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm outline-none ring-brand/30 focus:border-brand focus:bg-white focus:ring-2"
                value={courseFilter === "" ? "" : String(courseFilter)}
                onChange={(e) => setCourseFilter(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Bütün kurslar</option>
                {(coursesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-600">
                İmtahan <span className="font-normal text-slate-400">(istəyə bağlı)</span>
              </span>
              <select
                className="rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm outline-none ring-brand/30 focus:border-brand focus:bg-white focus:ring-2"
                value={previewExamId ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setPreviewExamId(Number.isFinite(n) && n > 0 ? n : null);
                }}
              >
                <option value="">Sonra dizaynerdə seçin</option>
                {examsForPicker.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    №{ex.id} — {ex.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs leading-relaxed text-slate-500 lg:max-w-xs lg:text-right">
            Seçsəniz, «Redaktə»/«Bax» ilə birlikdə açılır. Seçməsəniz də şablonu redaktə edə bilərsiniz.
          </p>
        </div>
      </Card>

      {/* Yeni şablon paneli */}
      {showCreate ? (
        <Card className="border-brand/20 bg-gradient-to-br from-brand/[0.04] to-white">
          <h2 className="text-base font-semibold text-slate-900">Yeni şablon yarat</h2>
          <p className="mt-1 text-sm text-slate-600">Ad və kurs seçdikdən sonra birbaşa dizaynerə yönləndiriləcəksiniz.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
            <input
              className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none ring-brand/30 focus:border-brand focus:ring-2"
              placeholder="Şablon adı"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            {user?.role === "admin" ? (
              <select
                className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none ring-brand/30 focus:border-brand focus:ring-2"
                value={newCourseId === "" ? "" : String(newCourseId)}
                onChange={(e) => setNewCourseId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Ümumi (bütün kurslar)</option>
                {(coursesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none ring-brand/30 focus:border-brand focus:ring-2"
                value={newCourseId === "" ? "" : String(newCourseId)}
                onChange={(e) => setNewCourseId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Kurs seçin</option>
                {(coursesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1">
              <Button type="button" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? "Yaradılır…" : "Yarat"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                Ləğv
              </Button>
            </div>
          </div>
          {createMut.isError ? (
            <p className="mt-3 text-sm text-red-600">
              {createMut.error instanceof Error ? createMut.error.message : "Xəta baş verdi"}
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* Cədvəl */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Şablonlar</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {filteredPresets.length} nəticə
              {search.trim() ? ` · «${search.trim()}» üzrə` : ""}
            </p>
          </div>
        </div>

        {presetsQuery.isLoading ? (
          <div className="space-y-2 p-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filteredPresets.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<IconLayout size={22} />}
              title="Hələ şablon yoxdur"
              description="Yeni cavab kartı şablonu yaradın və OMR dizaynına başlayın."
              action={
                <Button type="button" onClick={() => setShowCreate(true)}>
                  <IconPlus size={16} />
                  İlk şablonu yarat
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Şablon</th>
                  <th className="hidden px-5 py-3.5 font-semibold md:table-cell">Kurs</th>
                  <th className="px-5 py-3.5 font-semibold">İmtahan</th>
                  <th className="hidden px-5 py-3.5 font-semibold lg:table-cell">Yaradılıb</th>
                  <th className="hidden px-5 py-3.5 font-semibold sm:table-cell">Status</th>
                  <th className="w-14 px-3 py-3.5" aria-label="Əməliyyatlar" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPresets.map((p) => (
                  <tr key={p.id} className="group transition hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 ring-1 ring-slate-200/80">
                          <IconLayout size={18} />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="truncate text-left font-semibold text-slate-900 hover:text-brand hover:underline"
                            onClick={() => navigate(designerHref(p.id, false))}
                          >
                            {p.name}
                          </button>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400">#{p.id}</p>
                          {p.description ? (
                            <p className="mt-1 line-clamp-1 text-xs text-slate-500">{p.description}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-5 py-4 md:table-cell">
                      {p.course_id == null ? (
                        <Badge variant="info">Ümumi</Badge>
                      ) : (
                        <span className="text-sm text-slate-700">{courseName(p.course_id)}</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex min-w-[2rem] items-center justify-center rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold tabular-nums text-slate-800">
                        {p.exams_linked_count}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-5 py-4 text-sm text-slate-500 lg:table-cell">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="hidden px-5 py-4 sm:table-cell">
                      <Badge variant={p.is_active ? "success" : "neutral"}>
                        {p.is_active ? "Aktiv" : "Deaktiv"}
                      </Badge>
                    </td>
                    <td className="px-3 py-4 text-right">
                      <DropdownMenu items={menuItems(p)} ariaLabel={`${p.name} əməliyyatları`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
