import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CourseDashboardExamBrief, CourseDashboardPlatformExam } from "../../../api/courses";
import { listExams, type Exam } from "../../../api/exams";
import { createTicket } from "../../../api/tickets";
import Badge from "../../../components/ui/Badge";
import EmptyState from "../../../components/ui/EmptyState";
import { formatExamDt } from "../coursePanelUtils";

type Props = {
  courseId: number;
  ownExams: CourseDashboardExamBrief[];
  platformExams: CourseDashboardPlatformExam[];
  onGoTickets: () => void;
};

type LifeFilter = "all" | "scheduled" | "live" | "ended" | "draft";
type ActiveFilter = "all" | "active" | "inactive";

function lifecycleOf(e: Exam | CourseDashboardExamBrief): string {
  if ("lifecycle_status" in e && e.lifecycle_status) return e.lifecycle_status;
  return "draft";
}

function lifecycleLabel(status: string): string {
  switch (status) {
    case "scheduled":
      return "Planlaşdırılıb";
    case "live":
      return "Keçirilir";
    case "ended":
      return "Bitib";
    default:
      return "Tarixsiz";
  }
}

export default function ExamsTab({ courseId, ownExams, platformExams, onGoTickets }: Props) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [lifeFilter, setLifeFilter] = useState<LifeFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [platformQ, setPlatformQ] = useState("");

  const examsQ = useQuery({
    queryKey: ["exams", courseId],
    queryFn: () => listExams(courseId),
  });

  const createPlatformTicket = useMutation({
    mutationFn: (exam: CourseDashboardPlatformExam) =>
      createTicket(courseId, {
        title: `${exam.title} — bilet`,
        price_amount: 0,
        currency: "AZN",
        quota: exam.seat_remaining ?? null,
        is_active: true,
        exam_id: exam.id,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["course-dashboard", courseId] });
      await qc.invalidateQueries({ queryKey: ["tickets", courseId] });
      onGoTickets();
    },
  });

  const rows = examsQ.data ?? ownExams;

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((e) => {
      if (needle) {
        const hay = [String(e.id), e.title, e.city ?? "", e.venue ?? ""].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      const life = lifecycleOf(e as Exam);
      if (lifeFilter !== "all" && life !== lifeFilter) return false;
      if (activeFilter === "active" && !e.is_active) return false;
      if (activeFilter === "inactive" && e.is_active) return false;
      return true;
    });
  }, [rows, q, lifeFilter, activeFilter]);

  const filteredPlatform = useMemo(() => {
    const needle = platformQ.trim().toLowerCase();
    if (!needle) return platformExams;
    return platformExams.filter((e) => {
      const hay = [String(e.id), e.title, e.city ?? "", e.venue ?? ""].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [platformExams, platformQ]);

  const hasFilters = q.trim() !== "" || lifeFilter !== "all" || activeFilter !== "all";

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Kurs imtahanları</h2>
            <p className="text-sm text-slate-600">Bu kursa aid daxili imtahanlar.</p>
          </div>
          <Link
            to="/exams/yarat"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Yeni imtahan
          </Link>
        </div>

        <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
            Axtarış
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
              type="search"
              placeholder="Ad, №, şəhər…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Status
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
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
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Aktivlik
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
            >
              <option value="all">Hamısı</option>
              <option value="active">Aktiv</option>
              <option value="inactive">Deaktiv</option>
            </select>
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">
            {filteredRows.length} / {rows.length} imtahan
            {hasFilters ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="font-medium text-brand underline"
                  onClick={() => {
                    setQ("");
                    setLifeFilter("all");
                    setActiveFilter("all");
                  }}
                >
                  sıfırla
                </button>
              </>
            ) : null}
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="İmtahan yoxdur" description="İlk kurs imtahanını yaradın." />
        ) : filteredRows.length === 0 ? (
          <EmptyState title="Nəticə yoxdur" description="Filtrə uyğun imtahan tapılmadı." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Ad</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Tarix</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Yer</th>
                  <th className="px-4 py-3 font-semibold">Suallar</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((e) => {
                  const life = lifecycleOf(e as Exam);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-slate-900">{e.title}</td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {formatExamDt(e.scheduled_at)}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">
                        {[e.city, e.venue].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {"questions_registered" in e && e.questions_registered != null
                          ? `${e.questions_registered}/${e.question_count}`
                          : e.question_count}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            variant={
                              life === "ended" ? "neutral" : life === "live" ? "success" : life === "scheduled" ? "info" : "warning"
                            }
                          >
                            {lifecycleLabel(life)}
                          </Badge>
                          {!e.is_active ? <Badge variant="warning">Deaktiv</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/exams/${e.id}/dashboard`} className="text-brand hover:underline">
                          Dashboard
                        </Link>
                        <span className="mx-2 text-slate-300">·</span>
                        <Link to={`/exams/yarat?exam=${e.id}`} className="text-brand hover:underline">
                          Giriş
                        </Link>
                        <span className="mx-2 text-slate-300">·</span>
                        <Link to={`/scan?exam=${e.id}`} className="text-brand hover:underline">
                          Skan
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Platform imtahanları (açıq satış)</h2>
            <p className="text-sm text-slate-600">
              MirTech ümumi imtahanları — kurs öz qiymət və kontingenti ilə bilet satır.
            </p>
          </div>
          {platformExams.length > 0 && (
            <label className="flex min-w-[220px] flex-col gap-1 text-xs font-medium text-slate-600">
              Axtarış
              <input
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                type="search"
                placeholder="Platform imtahanı…"
                value={platformQ}
                onChange={(e) => setPlatformQ(e.target.value)}
              />
            </label>
          )}
        </div>

        {platformExams.length === 0 ? (
          <EmptyState
            title="Açıq platform imtahanı yoxdur"
            description="Administrator imtahanda «Kurslar bilet sata bilsin» seçimini aktiv edəndə burada görünəcək."
          />
        ) : filteredPlatform.length === 0 ? (
          <EmptyState title="Nəticə yoxdur" description="Axtarışa uyğun platform imtahanı yoxdur." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredPlatform.map((e) => (
              <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{e.title}</h3>
                      <Badge variant="info">Ümumi</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{formatExamDt(e.scheduled_at)}</p>
                    {(e.city || e.venue) && (
                      <p className="text-xs text-slate-500">{[e.city, e.venue].filter(Boolean).join(" · ")}</p>
                    )}
                    {e.seat_quota != null && (
                      <p className="mt-1 text-xs text-slate-500">
                        Platform limiti: {e.seat_quota}
                        {e.seat_remaining != null ? ` · qalan ${e.seat_remaining}` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4">
                  {e.has_course_ticket ? (
                    <button
                      type="button"
                      className="rounded-lg border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10"
                      onClick={onGoTickets}
                    >
                      Satışa davam et
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={createPlatformTicket.isPending}
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                      onClick={() => createPlatformTicket.mutate(e)}
                    >
                      Bilet yarat
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
