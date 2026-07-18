import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { applyExamScoringProfile, listExamScoringProfiles } from "../../../api/examScoringProfiles";
import { examTypeLabelsMap, listExamTypes } from "../../../api/examTypes";

type Props = {
  examId: number;
  examCategory?: string | null;
  onApplied: () => void;
  onError: (msg: string) => void;
};

export default function ScoringProfileApplyBar({ examId, examCategory, onApplied, onError }: Props) {
  const [profileId, setProfileId] = useState<number | "">("");
  const profilesQuery = useQuery({
    queryKey: ["exam-scoring-profiles", "apply-bar"],
    queryFn: () => listExamScoringProfiles({ active_only: true }),
  });
  const typesQuery = useQuery({
    queryKey: ["exam-types", "active"],
    queryFn: () => listExamTypes({ active_only: true }),
  });
  const labels = useMemo(() => examTypeLabelsMap(typesQuery.data), [typesQuery.data]);

  const applyMut = useMutation({
    mutationFn: () => applyExamScoringProfile(examId, Number(profileId), { replace_blocks: true }),
    onSuccess: () => {
      onApplied();
    },
    onError: (e: unknown) => {
      onError(e instanceof Error ? e.message : "Profil tətbiq olunmadı");
    },
  });

  const rows = profilesQuery.data ?? [];

  return (
    <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-[12px] font-medium text-slate-800">
          Hesablama profilini tətbiq et (bal qaydası)
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            value={profileId === "" ? "" : String(profileId)}
            onChange={(e) => setProfileId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">— profil seçin —</option>
            {rows.map((p) => (
              <option key={p.id} value={p.id}>
                [{labels[p.category] ?? p.category}] {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
          disabled={profileId === "" || applyMut.isPending}
          onClick={() => applyMut.mutate()}
        >
          {applyMut.isPending ? "Tətbiq…" : "Profili tətbiq et"}
        </button>
        {examCategory ? (
          <span className="pb-2 text-[11px] text-slate-600">
            Cari növ: {labels[examCategory] ?? examCategory}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-slate-600">
        Profil seçmək fənn çəkilərini, üstünlük dərəcəsini və bal düsturunu bu imtahana köçürür. Növ
        yalnız kateqoriyadır; əsl qaydalar profilə aiddir.
      </p>
    </div>
  );
}
