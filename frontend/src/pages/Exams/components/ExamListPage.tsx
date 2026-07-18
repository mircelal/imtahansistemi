import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { listCourses } from "../../../api/courses";
import { listExams, type Exam, type ExamReadiness } from "../../../api/exams";
import { useAuthStore } from "../../../store/authStore";
import PageHeader from "../../../components/ui/PageHeader";
import { formatDateTime } from "../../../utils/dateFormat";
import ExamListRowActions, { examListVariants } from "./ExamListRowActions";
import { examInput, examLabel, examPrimaryBtn, examSection, examSectionBody } from "./examUiTokens";

function examOperationalReady(e: Exam, readiness?: ExamReadiness): boolean {
  if (readiness) return readiness.ready_for_scan;
  const ak = e.answer_key_rows ?? 0;
  const sheets = e.confirmed_sheet_templates ?? 0;
  return e.question_count > 0 && ak >= e.question_count && sheets > 0;
}

function lifecycleLabel(status: string | undefined): string {
  switch (status) {
    case "scheduled":
      return "Planlaşdırılıb";
    case "live":
      return "Keçirilir";
    case "ended":
      return "Bitib";
    case "draft":
      return "Tarixsiz";
    default:
      return "—";
  }
}

type ReadyFilter = "all" | "ready" | "building";
type LifeFilter = "all" | "scheduled" | "live" | "ended" | "draft";
type ActiveFilter = "all" | "active" | "inactive";

export default function ExamListPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [courseFilter, setCourseFilter] = useState<number | "" | "none">("");
  const [q, setQ] = useState("");
  const [readyFilter, setReadyFilter] = useState<ReadyFilter>("all");
  const [lifeFilter, setLifeFilter] = useState<LifeFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  const examOpenParam = searchParams.get("exam");
  useEffect(() => {
    if (examOpenParam == null || examOpenParam === "") return;
    const id = Number(String(examOpenParam).trim());
    if (!Number.isFinite(id) || id < 1) return;
    navigate(`/exams/yarat?exam=${id}`, { replace: true });
  }, [examOpenParam, navigate]);

  const examsQuery = useQuery({
    queryKey: ["exams", courseFilter === "" ? "all" : courseFilter === "none" ? "none" : courseFilter],
    queryFn: async () => {
      const all = await listExams(courseFilter === "" || courseFilter === "none" ? undefined : Number(courseFilter));
      if (courseFilter === "none") return all.filter((e) => e.course_id == null);
      return all;
    },
  });
  const coursesQuery = useQuery({ queryKey: ["courses"], queryFn: listCourses });

  const courseName = (id: number | null) => {
    if (id == null) return "Ümumi";
    const c = (coursesQuery.data ?? []).find((x) => x.id === id);
    return c?.name ?? `Kurs #${id}`;
  };

  const filtered = useMemo(() => {
    const rows = examsQuery.data ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter((e) => {
      if (needle) {
        const hay = [
          String(e.id),
          e.title,
          e.city ?? "",
          e.venue ?? "",
          courseName(e.course_id),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      const ready = examOperationalReady(e);
      if (readyFilter === "ready" && !ready) return false;
      if (readyFilter === "building" && ready) return false;
      const life = e.lifecycle_status ?? "draft";
      if (lifeFilter !== "all" && life !== lifeFilter) return false;
      if (activeFilter === "active" && !e.is_active) return false;
      if (activeFilter === "inactive" && e.is_active) return false;
      return true;
    });
  }, [examsQuery.data, q, readyFilter, lifeFilter, activeFilter, coursesQuery.data, courseFilter]);

  const hasExtraFilters =
    q.trim() !== "" || readyFilter !== "all" || lifeFilter !== "all" || activeFilter !== "all";

  const clearFilters = () => {
    setQ("");
    setReadyFilter("all");
    setLifeFilter("all");
    setActiveFilter("all");
  };

  const openExam = (id: number) => navigate(`/exams/yarat?exam=${id}`);

  if (user?.role === "student") {
    return (
      <div className="page-container">
        <p className="text-slate-600">Bu səhifə şagirdlər üçün mövcud deyil.</p>
      </div>
    );
  }

  if (examOpenParam) {
    return (
      <div className="page-container-wide">
        <p className="text-[13px] text-slate-500">İmtahana yönləndirilir…</p>
      </div>
    );
  }

  const total = examsQuery.data?.length ?? 0;

  return (
    <div className="page-container-wide space-y-5">
      <PageHeader
        title="İmtahanlar"
        subtitle="Sətirə klikləyin — giriş. Cavab kartı və sual kitabçasını «Endir» menyusundan variant üzrə yükləyin."
        action={
          <Link to="/exams/yarat" className={examPrimaryBtn}>
            Yeni imtahan
          </Link>
        }
        className="!mb-4 !pb-4"
      />

      <div className={examSection}>
        <div className={`${examSectionBody} space-y-3`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className={`${examLabel} sm:col-span-2 xl:col-span-2`}>
              Axtarış
              <input
                className={examInput}
                type="search"
                placeholder="Ad, №, şəhər, məkan…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label className={examLabel}>
              Kurs
              <select
                className={examInput}
                value={courseFilter === "" ? "" : courseFilter === "none" ? "none" : String(courseFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setCourseFilter(v === "" ? "" : v === "none" ? "none" : Number(v));
                }}
              >
                <option value="">Hamısı</option>
                <option value="none">Kurs yoxdur (ümumi)</option>
                {(coursesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={examLabel}>
              Status
              <select
                className={examInput}
                value={lifeFilter}
                onChange={(e) => setLifeFilter(e.target.value as LifeFilter)}
              >
                <option value="all">Hamısı</option>
                <option value="scheduled">Planlaşdırılıb</option>
                <option value="live">Keçirilir</option>
                <option value="ended">Bitib</option>
                <option value="draft">Tarixsiz</option>
              </select>
            </label>
            <label className={examLabel}>
              Hazırlıq
              <select
                className={examInput}
                value={readyFilter}
                onChange={(e) => setReadyFilter(e.target.value as ReadyFilter)}
              >
                <option value="all">Hamısı</option>
                <option value="ready">Hazır</option>
                <option value="building">Qurulur</option>
              </select>
            </label>
            <label className={examLabel}>
              Aktivlik
              <select
                className={examInput}
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              >
                <option value="all">Hamısı</option>
                <option value="active">Aktiv</option>
                <option value="inactive">Deaktiv</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-600">
            <p>
              {examsQuery.isLoading
                ? "Yüklənir…"
                : `${filtered.length} / ${total} imtahan${hasExtraFilters || courseFilter !== "" ? " (filtrli)" : ""}`}
            </p>
            {(hasExtraFilters || courseFilter !== "") && (
              <button
                type="button"
                className="font-medium text-indigo-700 underline hover:text-indigo-900"
                onClick={() => {
                  clearFilters();
                  setCourseFilter("");
                }}
              >
                Filtrləri sıfırla
              </button>
            )}
          </div>
        </div>
      </div>

      {examsQuery.isLoading && <p className="text-[13px] text-slate-500">Yüklənir…</p>}
      {examsQuery.isError && <p className="text-[13px] text-red-600">Siyahı yüklənmədi.</p>}

      {!examsQuery.isLoading && total === 0 && (
        <div className={`${examSection} text-center`}>
          <div className={examSectionBody}>
            <p className="text-[13px] text-slate-600">Hələ imtahan yoxdur.</p>
            <Link to="/exams/yarat" className={`${examPrimaryBtn} mt-4 inline-flex`}>
              İlk imtahanı yaradın
            </Link>
          </div>
        </div>
      )}

      {!examsQuery.isLoading && total > 0 && filtered.length === 0 && (
        <div className={`${examSection} text-center`}>
          <div className={examSectionBody}>
            <p className="text-[13px] text-slate-600">Filtrə uyğun imtahan tapılmadı.</p>
            <button type="button" className={`${examPrimaryBtn} mt-4 inline-flex`} onClick={clearFilters}>
              Axtarışı təmizlə
            </button>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className={`${examSection} overflow-x-auto`}>
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">№</th>
                <th className="px-4 py-2.5">Başlıq</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Kurs</th>
                <th className="hidden px-4 py-2.5 lg:table-cell">Tarix</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Variantlar</th>
                <th className="px-4 py-2.5">Hazırlıq</th>
                <th className="px-4 py-2.5 text-right">Əməllər</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((e) => {
                const ready = examOperationalReady(e);
                const qr = e.questions_registered ?? 0;
                const ak = e.answer_key_rows ?? 0;
                const variants = examListVariants(e);
                const life = e.lifecycle_status ?? "draft";
                return (
                  <tr
                    key={e.id}
                    className="cursor-pointer hover:bg-indigo-50/40"
                    onClick={() => openExam(e.id)}
                    title="İmtahana giriş"
                  >
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-slate-900">{e.id}</td>
                    <td className="max-w-[220px] px-4 py-3 font-medium text-slate-800 md:max-w-md">
                      <span className="line-clamp-2 text-indigo-900 hover:underline">{e.title}</span>
                      {(e.city || e.venue) && (
                        <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                          {[e.city, e.venue].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{courseName(e.course_id)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-slate-600 lg:table-cell">
                      {e.scheduled_at ? formatDateTime(e.scheduled_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          life === "ended"
                            ? "bg-slate-200 text-slate-800"
                            : life === "live"
                              ? "bg-emerald-100 text-emerald-800"
                              : life === "scheduled"
                                ? "bg-sky-100 text-sky-900"
                                : "bg-amber-50 text-amber-900"
                        }`}
                      >
                        {lifecycleLabel(life)}
                      </span>
                      {!e.is_active ? (
                        <span className="mt-0.5 block text-[10px] text-amber-700">Deaktiv</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-0.5">
                        {variants.map((v) => (
                          <span
                            key={v}
                            className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {ready ? "Hazır" : "Qurulur"}
                      </span>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Açar {ak}/{e.question_count} · Sual {qr}
                        {(e.confirmed_sheet_templates ?? 0) > 0 ? " · Kart ✓" : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ExamListRowActions exam={e} scanReady={ready} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
