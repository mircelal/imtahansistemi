import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Exam } from "../../../api/exams";
import { updateExam } from "../../../api/exams";
import Badge from "../../../components/ui/Badge";
import { formatDateTime } from "../../../utils/dateFormat";
import ToggleSwitch from "./ToggleSwitch";
import {
  examFieldGrid,
  examInput,
  examLabel,
  examPrimaryBtn,
  examSecondaryBtn,
  examSection,
  examSectionBody,
  examSectionHeader,
  examSectionTitle
} from "./examUiTokens";

function toDatetimeLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function lifecycleBadge(status: string | undefined) {
  switch (status) {
    case "scheduled":
      return <Badge variant="info">Planlaşdırılıb</Badge>;
    case "live":
      return <Badge variant="success">Keçirilir</Badge>;
    case "ended":
      return <Badge variant="warning">Bitib · kilidli</Badge>;
    default:
      return <Badge variant="neutral">Tarix yoxdur</Badge>;
  }
}

type Props = {
  examId: number;
  exam: Exam;
  isAdmin: boolean;
  linkedTicketsCount?: number;
  courseId?: number | null;
};

export default function ExamSettingsEditor({ examId, exam, isAdmin, linkedTicketsCount = 0, courseId }: Props) {
  const qc = useQueryClient();
  const isPlatform = exam.course_id == null;
  const locked = Boolean(exam.is_locked);

  const [title, setTitle] = useState(exam.title);
  const [description, setDescription] = useState(exam.description ?? "");
  const [scheduled, setScheduled] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [quota, setQuota] = useState("");
  const [city, setCity] = useState("");
  const [venue, setVenue] = useState("");
  const [resaleEnabled, setResaleEnabled] = useState(Boolean(exam.resale_enabled));
  const [negativeMarking, setNegativeMarking] = useState(Boolean(exam.negative_marking));
  const [negativeRatio, setNegativeRatio] = useState(exam.negative_ratio ?? 0.25);
  const [listPrice, setListPrice] = useState(exam.list_price_amount ?? 0);

  useEffect(() => {
    setTitle(exam.title);
    setDescription(exam.description ?? "");
    setScheduled(toDatetimeLocalInput(exam.scheduled_at));
    setEndsAt(toDatetimeLocalInput(exam.ends_at ?? exam.effective_ends_at));
    setQuota(exam.seat_quota != null ? String(exam.seat_quota) : "");
    setCity(exam.city ?? "");
    setVenue(exam.venue ?? "");
    setResaleEnabled(Boolean(exam.resale_enabled));
    setNegativeMarking(Boolean(exam.negative_marking));
    setNegativeRatio(exam.negative_ratio ?? 0.25);
    setListPrice(exam.list_price_amount ?? 0);
  }, [exam]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!scheduled.trim() || !endsAt.trim()) {
        throw new Error("Başlama və bitmə tarixi mütləqdir.");
      }
      const qRaw = quota.trim();
      let seat_quota: number | null = null;
      if (qRaw !== "") {
        const n = Number(qRaw);
        if (!Number.isFinite(n) || n < 1) throw new Error("Yer limiti ən azı 1 olmalıdır.");
        seat_quota = n;
      }
      return updateExam(examId, {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduled_at: new Date(scheduled).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        seat_quota,
        city: city.trim() || null,
        venue: venue.trim() || null,
        negative_marking: negativeMarking,
        negative_ratio: negativeMarking ? negativeRatio : 0,
        ...(isAdmin ? { list_price_amount: listPrice, list_price_currency: "AZN" } : {}),
        ...(isPlatform && isAdmin ? { resale_enabled: resaleEnabled } : {})
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["exam", examId] });
      await qc.invalidateQueries({ queryKey: ["exams"] });
      await qc.invalidateQueries({ queryKey: ["exam-integrations", examId] });
    }
  });

  return (
    <div className="space-y-4">
      <div className={examSection}>
        <div className={`${examSectionHeader} flex flex-wrap items-center justify-between gap-2`}>
          <div>
            <p className={examSectionTitle}>İmtahan redaktəsi</p>
            <p className="text-[12px] text-slate-500">№{examId}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lifecycleBadge(exam.lifecycle_status)}
            {isPlatform ? <Badge variant="info">Ümumi</Badge> : <Badge variant="neutral">Kurs</Badge>}
            {!exam.is_active ? <Badge variant="warning">Deaktiv</Badge> : null}
            <Link to={`/exams/${examId}/dashboard`} className={examSecondaryBtn}>
              Dashboard
            </Link>
          </div>
        </div>
        <div className={`${examSectionBody} space-y-3`}>
          {locked ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-950">
              İmtahan{" "}
              {exam.effective_ends_at ? formatDateTime(exam.effective_ends_at) : "bitmə vaxtı"}
              -da başa çatıb. Parametrlər, suallar və cavab açarı redaktə edilə bilməz. Nəticələrə dashboarddan baxın;
              skan yoxlaması açıq qala bilər.
            </div>
          ) : null}
          <label className={examLabel}>
            Başlıq
            <input
              className={examInput}
              value={title}
              disabled={locked}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className={examLabel}>
            Təsvir
            <input
              className={examInput}
              value={description}
              disabled={locked}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className={examFieldGrid(2)}>
            <label className={examLabel}>
              Başlama tarixi / saatı *
              <input
                type="datetime-local"
                className={examInput}
                value={scheduled}
                disabled={locked}
                onChange={(e) => setScheduled(e.target.value)}
              />
            </label>
            <label className={examLabel}>
              Bitmə tarixi / saatı *
              <input
                type="datetime-local"
                className={examInput}
                value={endsAt}
                disabled={locked}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
            <label className={examLabel}>
              Yer limiti
              <input
                type="number"
                min={1}
                className={examInput}
                placeholder="Limitsiz"
                value={quota}
                disabled={locked}
                onChange={(e) => setQuota(e.target.value)}
              />
            </label>
            <label className={examLabel}>
              Şəhər
              <input className={examInput} value={city} disabled={locked} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className={examLabel}>
              Məkan
              <input className={examInput} value={venue} disabled={locked} onChange={(e) => setVenue(e.target.value)} />
            </label>
            {isAdmin ? (
              <label className={examLabel}>
                Rəsmi imtahan qiyməti (AZN)
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className={examInput}
                  value={listPrice}
                  disabled={locked}
                  onChange={(e) => setListPrice(Number(e.target.value))}
                />
              </label>
            ) : null}
          </div>
          {!locked ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={saveMut.isPending}
                className={examPrimaryBtn}
                onClick={() =>
                  saveMut.mutate(undefined, {
                    onError: (e) => window.alert(e instanceof Error ? e.message : "Xəta")
                  })
                }
              >
                {saveMut.isPending ? "Saxlanır…" : "Saxla"}
              </button>
              {saveMut.isSuccess ? <span className="self-center text-[12px] text-emerald-600">Saxlandı</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      {!locked ? (
        <div className={examSection}>
          <div className={examSectionHeader}>
            <p className={examSectionTitle}>Mənfi bal</p>
          </div>
          <div className={`${examSectionBody} space-y-3`}>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[13px] font-medium text-slate-900">Səhv cavab üçün mənfi bal</p>
              <ToggleSwitch checked={negativeMarking} onChange={setNegativeMarking} />
            </div>
            {negativeMarking ? (
              <label className={examLabel}>
                Mənfi nisbət
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  className={examInput}
                  value={negativeRatio}
                  onChange={(e) => setNegativeRatio(Number(e.target.value))}
                />
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={examSection}>
        <div className={examSectionHeader}>
          <p className={examSectionTitle}>Bilet ayarları</p>
        </div>
        <div className={`${examSectionBody} space-y-3`}>
          {isPlatform && isAdmin && !locked ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium text-slate-900">Kurs satışına açıq</p>
                <p className="text-[11px] text-slate-500">resale_enabled — kurslar öz bileti yaradır.</p>
              </div>
              <ToggleSwitch
                checked={resaleEnabled}
                onChange={(v) => {
                  setResaleEnabled(v);
                  updateExam(examId, { resale_enabled: v }).then(() => {
                    qc.invalidateQueries({ queryKey: ["exam", examId] });
                  });
                }}
              />
            </div>
          ) : null}

          {courseId != null ? (
            <p className="text-[12px] text-slate-600">
              Əlaqəli bilet: {linkedTicketsCount}. Biletləri kurs panelindən idarə edin.
            </p>
          ) : (
            <p className="text-[12px] text-slate-600">Ümumi imtahan — bilet satışı platform səviyyəsindədir.</p>
          )}
        </div>
      </div>
    </div>
  );
}
