import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import type { Course } from "../../../api/courses";
import { listExamScoringProfiles } from "../../../api/examScoringProfiles";
import { examTypeLabelsMap, listExamTypes } from "../../../api/examTypes";
import type { AnswerSheetPresetOut } from "../../../api/sheetPresets";
import ToggleSwitch from "./ToggleSwitch";
import {
  examFieldGrid,
  examInput,
  examLabel,
  examPrimaryBtn,
  examSection,
  examSectionBody,
  examSectionHeader,
  examSectionHint,
  examSectionTitle
} from "./examUiTokens";

export type ExamBasicsFormValues = {
  course_id: number | "";
  title: string;
  description: string;
  question_count: number;
  options_per_question: number;
  columns_count: number;
  scheduled_at: string;
  ends_at: string;
  seat_quota: string;
  venue: string;
  city: string;
  resale_enabled: boolean;
  add_ticket: boolean;
  ticket_title: string;
  ticket_description: string;
  ticket_price: number;
  ticket_quota: string;
  answer_sheet_preset_id: number | "";
  negative_marking: boolean;
  negative_ratio: number;
  list_price_amount: number;
  use_dim_preset: boolean;
  exam_category: string;
  scoring_profile_id: number | "";
};

type Props = {
  register: UseFormRegister<ExamBasicsFormValues>;
  watch: UseFormWatch<ExamBasicsFormValues>;
  setValue: UseFormSetValue<ExamBasicsFormValues>;
  courses: Course[];
  sheetPresets?: AnswerSheetPresetOut[];
  umumiExam: boolean;
  onUmumiExamChange: (v: boolean) => void;
  isAdmin: boolean;
  /** Admin və ya menecer — kurs olmadan imtahan yarada bilər */
  canCreateUmumi: boolean;
  isPending: boolean;
  isError: boolean;
  onSubmit: () => void;
};

export default function ExamCreateForm({
  register,
  watch,
  setValue,
  courses,
  sheetPresets = [],
  umumiExam,
  onUmumiExamChange,
  isAdmin,
  canCreateUmumi,
  isPending,
  isError,
  onSubmit
}: Props) {
  const addTicket = watch("add_ticket");
  const resaleEnabled = watch("resale_enabled");
  const scheduledAt = watch("scheduled_at");
  const endsAt = watch("ends_at");
  const examCategory = watch("exam_category") || "custom";
  const scoringProfileId = watch("scoring_profile_id");

  const typesQuery = useQuery({
    queryKey: ["exam-types", "active"],
    queryFn: () => listExamTypes({ active_only: true }),
  });
  const examTypes = typesQuery.data ?? [];
  const typeLabels = useMemo(() => examTypeLabelsMap(examTypes), [examTypes]);
  const selectedType = useMemo(
    () => examTypes.find((t) => t.slug === examCategory),
    [examTypes, examCategory],
  );

  const profilesQuery = useQuery({
    queryKey: ["exam-scoring-profiles", examCategory],
    queryFn: () =>
      listExamScoringProfiles({
        category: examCategory,
        active_only: true,
      }),
  });

  const profilesForCategory = useMemo(() => {
    const rows = profilesQuery.data ?? [];
    // Builtin kateqoriyalar: yalnız həmin növ; digər növlərdə həm növün, həm də qeyri-builtin (sərbəst) profillər
    const isStrict = examCategory === "buraxilis" || examCategory === "qebul";
    if (isStrict) {
      return rows.filter((p) => p.category === examCategory);
    }
    return rows.filter((p) => p.category === examCategory || !p.is_builtin);
  }, [profilesQuery.data, examCategory]);

  // custom/blok/sinif üçün əlavə qeyri-builtin — ayrı sorğu
  const extraProfilesQuery = useQuery({
    queryKey: ["exam-scoring-profiles", "non-strict-extra", examCategory],
    enabled: examCategory !== "buraxilis" && examCategory !== "qebul",
    queryFn: () => listExamScoringProfiles({ active_only: true }),
  });

  const profilesMerged = useMemo(() => {
    const isStrict = examCategory === "buraxilis" || examCategory === "qebul";
    if (isStrict) return profilesForCategory;
    const byId = new Map<number, (typeof profilesForCategory)[0]>();
    for (const p of profilesForCategory) byId.set(p.id, p);
    for (const p of extraProfilesQuery.data ?? []) {
      if (p.category === examCategory || !p.is_builtin) byId.set(p.id, p);
    }
    return Array.from(byId.values());
  }, [profilesForCategory, extraProfilesQuery.data, examCategory]);

  const selectedProfile = useMemo(
    () => profilesMerged.find((p) => p.id === Number(scoringProfileId)),
    [profilesMerged, scoringProfileId],
  );

  useEffect(() => {
    if (!scheduledAt || endsAt) return;
    const start = new Date(scheduledAt);
    if (Number.isNaN(start.getTime())) return;
    start.setHours(start.getHours() + 3);
    const pad = (n: number) => String(n).padStart(2, "0");
    const next = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
    setValue("ends_at", next);
  }, [scheduledAt, endsAt, setValue]);

  useEffect(() => {
    // Növ dəyişəndə default profil tətbiq et və ya uyğunsuz seçimi təmizlə
    if (selectedType?.default_scoring_profile_id) {
      const defId = selectedType.default_scoring_profile_id;
      if (profilesMerged.some((p) => p.id === defId)) {
        setValue("scoring_profile_id", defId);
        return;
      }
    }
    if (scoringProfileId !== "" && scoringProfileId != null) {
      if (!profilesMerged.some((p) => p.id === Number(scoringProfileId))) {
        setValue("scoring_profile_id", "");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız növ / profil siyahısı dəyişəndə
  }, [examCategory, selectedType?.default_scoring_profile_id, profilesMerged, setValue]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {canCreateUmumi ? (
        <div className={examSection}>
          <div className={examSectionHeader}>
            <p className={examSectionTitle}>İmtahan tipi</p>
            <p className={examSectionHint}>
              Kurs imtahanı — konkret kursa bağlıdır. Ümumi — kurs seçilmir; suallar Word/CSV/bazadan
              əlavə olunur.
            </p>
          </div>
          <div className={examSectionBody}>
            <div className="flex rounded-xl bg-slate-100/90 p-1">
              <button
                type="button"
                className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition ${
                  !umumiExam ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                }`}
                onClick={() => onUmumiExamChange(false)}
                disabled={courses.length === 0}
              >
                Kurs
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition ${
                  umumiExam ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                }`}
                onClick={() => onUmumiExamChange(true)}
              >
                Ümumi (kurs yoxdur)
              </button>
            </div>
            {courses.length === 0 && !umumiExam ? (
              <p className="mt-2 text-[11px] text-amber-800">
                Aktiv kurs yoxdur — «Ümumi» seçin və ya əvvəlcə kurs yaradın.
              </p>
            ) : null}
            {umumiExam && isAdmin ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-900">Kurslar bilet sata bilsin</p>
                  <p className="text-[11px] text-slate-500">Mərkəzlər öz qiymət/kontingenti ilə satır.</p>
                </div>
                <ToggleSwitch checked={resaleEnabled} onChange={(v) => setValue("resale_enabled", v)} />
              </div>
            ) : umumiExam ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Kurssuz imtahan — qlobal cavab kartı şablonları; sual əlavəsi Word, CSV və ya sual
                bazası ilə.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={examSection}>
        <div className={examSectionHeader}>
          <p className={examSectionTitle}>Əsas məlumat</p>
        </div>
        <div className={`${examSectionBody} space-y-3`}>
          {!umumiExam ? (
            <label className={examLabel}>
              Kurs
              <select
                className={examInput}
                {...register("course_id", {
                  setValueAs: (v) => (v === "" ? "" : Number(v)),
                })}
              >
                {courses.length === 0 ? (
                  <option value="">Kurs tapılmadı</option>
                ) : (
                  courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </label>
          ) : null}
          <label className={examLabel}>
            Başlıq
            <input className={examInput} placeholder="Riyaziyyat — buraxılış" {...register("title", { required: true })} />
          </label>
          <label className={examLabel}>
            Təsvir
            <input className={examInput} placeholder="İstəyə bağlı" {...register("description")} />
          </label>
        </div>
      </div>

      <div className={examSection}>
        <div className={examSectionHeader}>
          <p className={examSectionTitle}>İmtahan növü və hesablama profili</p>
          <p className={examSectionHint}>
            <strong>Növ</strong> — imtahanın kateqoriyası (Buraxılış, Qəbul…).{" "}
            <strong>Profil</strong> — balların necə hesablandığı (fənn çəkisi, DİM düsturu). Əvvəlcə
            növü, sonra profili seçin.
          </p>
        </div>
        <div className={examSectionBody}>
          <div className={examFieldGrid(2)}>
            <label className={examLabel}>
              İmtahan növü (kateqoriya)
              <select
                className={examInput}
                value={examCategory}
                onChange={(e) => {
                  setValue("exam_category", e.target.value);
                  setValue("scoring_profile_id", "");
                }}
              >
                {examTypes.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.label}
                  </option>
                ))}
                {!examTypes.length
                  ? Object.entries(typeLabels).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))
                  : null}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-slate-500">
                {selectedType?.description ||
                  "Yalnız qruplaşdırma üçündür; bal hesablamasını profil müəyyən edir."}
              </span>
            </label>
            <label className={examLabel}>
              Hesablama profili (bal qaydası)
              <select
                className={examInput}
                value={scoringProfileId === "" ? "" : String(scoringProfileId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setValue("scoring_profile_id", v === "" ? "" : Number(v));
                  if (v !== "") setValue("use_dim_preset", false);
                }}
              >
                <option value="">Sonra seçəcəyəm</option>
                {profilesMerged.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.is_builtin ? " · DİM hazır" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-slate-500">
                Seçiləndə fənn çəkiləri və düsturlar imtahana köçürülür. Siyahı boşdursa «İmtahan
                növləri» səhifəsində profil yaradın.
              </span>
            </label>
          </div>
          {selectedProfile ? (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-[12px] font-semibold text-slate-800">
                Bu profil nə edir: {selectedProfile.name}
              </p>
              {selectedProfile.description ? (
                <p className="mt-1 text-[11px] text-slate-600">{selectedProfile.description}</p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-600">
                  Aşağıdakı fənnlər, çəkilər və düsturlar imtahana tətbiq olunacaq.
                </p>
              )}
              <table className="mt-2 w-full min-w-[320px] text-left text-[11px]">
                <thead>
                  <tr className="text-slate-500">
                    <th className="py-1 pr-2 font-medium">Fənn</th>
                    <th className="py-1 pr-2 font-medium">Çəki</th>
                    <th className="py-1 pr-2 font-medium">Üstünlük</th>
                    <th className="py-1 font-medium">Formula</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedProfile.formula_config.subjects ?? []).map((s) => (
                    <tr key={s.code} className="border-t border-slate-200/80 text-slate-800">
                      <td className="py-1 pr-2">{s.title || s.code}</td>
                      <td className="py-1 pr-2">{s.weight ?? 1}</td>
                      <td className="py-1 pr-2">{s.priority ?? "—"}</td>
                      <td className="py-1">{s.formula === "weighted_linear" ? "Çəkili (DİM)" : "Sadə cəm"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      <div className={examSection}>
        <div className={examSectionHeader}>
          <p className={examSectionTitle}>Kart parametrləri</p>
        </div>
        <div className={examSectionBody}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-900 hover:bg-rose-100"
              onClick={() => {
                setValue("question_count", 30);
                setValue("options_per_question", 4);
                setValue("negative_marking", false);
                setValue("negative_ratio", 0);
                setValue("use_dim_preset", true);
                setValue("exam_category", "custom");
                setValue("scoring_profile_id", "");
              }}
            >
              DİM standartı (sadə 30 sual)
            </button>
            <span className="text-[11px] text-slate-500">
              30 sual · A–D · mənfi bal off · 1–20=1, 21–30=2 xal (essay: 31–38=5, 39–40=10)
            </span>
          </div>
          <div className={examFieldGrid(3)}>
            <label className={examLabel}>
              Suallar
              <input className={examInput} type="number" min={1} {...register("question_count", { valueAsNumber: true })} />
            </label>
            <label className={examLabel}>
              Variant
              <input className={examInput} type="number" min={2} max={5} {...register("options_per_question", { valueAsNumber: true })} />
            </label>
            <label className={examLabel}>
              Sütun
              <input className={examInput} type="number" min={1} max={4} {...register("columns_count", { valueAsNumber: true })} />
            </label>
          </div>
        </div>
      </div>

      <div className={examSection}>
        <div className={examSectionHeader}>
          <p className={examSectionTitle}>Başlanğıc dizayn şablonu (ixtiyari)</p>
          <p className={examSectionHint}>Cavab kartı kitabxanasından əvvəlcədən seçin; sonra da dəyişə bilərsiniz.</p>
        </div>
        <div className={examSectionBody}>
          <label className={examLabel}>
            Dizayn şablonu
            <select
              className={examInput}
              {...register("answer_sheet_preset_id", {
                setValueAs: (v) => (v === "" ? "" : Number(v)),
              })}
            >
              <option value="">Sonradan seçəcəyəm</option>
              {sheetPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.course_id == null ? " — ümumi" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className={examSection}>
        <div className={examSectionHeader}>
          <p className={examSectionTitle}>Mənfi bal</p>
        </div>
        <div className={examSectionBody}>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[13px] font-medium text-slate-900">Səhv cavab üçün mənfi bal</p>
            <ToggleSwitch
              checked={watch("negative_marking")}
              onChange={(v) => setValue("negative_marking", v)}
            />
          </div>
          {watch("negative_marking") ? (
            <label className={`${examLabel} mt-3`}>
              Mənfi nisbət (məs. 0.25 = hər səhv ¼ bal çıxır)
              <input
                className={examInput}
                type="number"
                step="0.05"
                min={0}
                max={1}
                {...register("negative_ratio", { valueAsNumber: true })}
              />
            </label>
          ) : null}
        </div>
      </div>

      <div className={examSection}>
        <div className={examSectionHeader}>
          <p className={examSectionTitle}>Keçirilmə planı</p>
        </div>
        <div className={examSectionBody}>
          <p className={`${examSectionHint} mb-3`}>
            İmtahanın başlama və bitmə vaxtı mütləqdir. Bitəndən sonra parametrlər, suallar və cavab açarı kilidlənir.
          </p>
          <div className={examFieldGrid(2)}>
            <label className={examLabel}>
              Başlama tarixi / saatı *
              <input className={examInput} type="datetime-local" required {...register("scheduled_at")} />
            </label>
            <label className={examLabel}>
              Bitmə tarixi / saatı *
              <input className={examInput} type="datetime-local" required {...register("ends_at")} />
            </label>
            <label className={examLabel}>
              Yer limiti
              <input className={examInput} type="number" min={1} placeholder="Limitsiz" {...register("seat_quota")} />
            </label>
            <label className={examLabel}>
              Şəhər
              <input className={examInput} placeholder="Bakı" {...register("city")} />
            </label>
            <label className={examLabel}>
              Məkan
              <input className={examInput} placeholder="Mərkəz" {...register("venue")} />
            </label>
            {isAdmin ? (
              <label className={examLabel}>
                Rəsmi imtahan qiyməti (AZN)
                <input
                  className={examInput}
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Bilik tarifi"
                  {...register("list_price_amount", { valueAsNumber: true })}
                />
              </label>
            ) : null}
          </div>
          {isAdmin ? (
            <p className="mt-2 text-[11px] text-slate-500">
              Bilik tərəfindən təyin olunan rəsmi imtahan haqqı. Kurslar öz bilet qiymətini ayrıca təyin edir.
            </p>
          ) : null}
        </div>
      </div>

      {!umumiExam ? (
        <div className={examSection}>
          <div className={`${examSectionHeader} flex items-center justify-between gap-3`}>
            <div>
              <p className={examSectionTitle}>Bilet</p>
              <p className={examSectionHint}>Kursa avtomatik bilet əlavə et.</p>
            </div>
            <ToggleSwitch checked={addTicket} onChange={(v) => setValue("add_ticket", v)} aria-label="Bilet yarat" />
          </div>
          {addTicket ? (
            <div className={examSectionBody}>
              <div className={examFieldGrid(2)}>
                <label className={`${examLabel} sm:col-span-2`}>
                  Bilet adı
                  <input
                    className={examInput}
                    {...register("ticket_title", {
                      validate: (v) => !addTicket || (v && v.trim().length > 0) || "Mütləqdir"
                    })}
                  />
                </label>
                <label className={examLabel}>
                  Qiymət (AZN)
                  <input className={examInput} type="number" step="0.01" {...register("ticket_price", { valueAsNumber: true })} />
                </label>
                <label className={examLabel}>
                  Kontingent
                  <input className={examInput} type="number" min={1} placeholder="Limitsiz" {...register("ticket_quota")} />
                </label>
                <label className={`${examLabel} sm:col-span-2`}>
                  Təsvir
                  <input className={examInput} {...register("ticket_description")} />
                </label>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="submit" disabled={isPending} className={examPrimaryBtn}>
          {isPending ? "Yaradılır…" : "Yarat və davam et"}
        </button>
        {isError ? <p className="text-[13px] text-red-600">Yaratma xətası.</p> : null}
      </div>
    </form>
  );
}
