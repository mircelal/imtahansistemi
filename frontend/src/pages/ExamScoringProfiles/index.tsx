import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  cloneExamScoringProfile,
  createExamScoringProfile,
  deleteExamScoringProfile,
  listExamScoringProfiles,
  updateExamScoringProfile,
  type ExamScoringProfile,
  type ScoringProfileSubject,
} from "../../api/examScoringProfiles";
import {
  createExamType,
  deactivateExamType,
  examTypeLabelsMap,
  listExamTypes,
  updateExamType,
  type ExamType,
} from "../../api/examTypes";
import {
  createScoringFormulaPreset,
  deactivateScoringFormulaPreset,
  listScoringFormulaPresets,
  updateScoringFormulaPreset,
  type FormulaDefaultParams,
  type ScoringFormulaPreset,
} from "../../api/scoringFormulaPresets";
import PageHeader from "../../components/ui/PageHeader";

const emptyParams = (): FormulaDefaultParams => ({
  closed_coeff: 1,
  open_coded_coeff: 1,
  open_written_coeff: 1,
  relative_max: 100,
  round_step: 0.1,
  guess_correction: false,
  options_k: 4,
});

const emptySubject = (): ScoringProfileSubject => ({
  code: "",
  title: "",
  weight: 1,
  priority: 1,
  formula: "raw_sum",
  formula_params: emptyParams(),
});

type Tab = "types" | "profiles" | "formulas" | "docs";

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ç/g, "c")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
}

function subjectsFromProfile(p: ExamScoringProfile): ScoringProfileSubject[] {
  const subjects = p.formula_config.subjects ?? [];
  if (!subjects.length) return [emptySubject()];
  return subjects.map((s) => ({
    code: s.code ?? "",
    title: s.title ?? "",
    weight: s.weight ?? 1,
    priority: s.priority ?? 1,
    formula: s.formula === "weighted_linear" ? "weighted_linear" : "raw_sum",
    formula_params: s.formula_params,
    from_q: s.from_q,
    to_q: s.to_q,
  }));
}

function SubjectRows({
  subjects,
  setSubjects,
  formulaPresets,
}: {
  subjects: ScoringProfileSubject[];
  setSubjects: Dispatch<SetStateAction<ScoringProfileSubject[]>>;
  formulaPresets: ScoringFormulaPreset[];
}) {
  const applyPreset = (idx: number, presetId: string) => {
    if (!presetId) return;
    const preset = formulaPresets.find((p) => String(p.id) === presetId);
    if (!preset) return;
    setSubjects((rs) =>
      rs.map((r, i) =>
        i === idx
          ? {
              ...r,
              formula: preset.engine === "weighted_linear" ? "weighted_linear" : "raw_sum",
              formula_params: {
                ...emptyParams(),
                ...(preset.default_params || {}),
              },
            }
          : r,
      ),
    );
  };

  const patchParams = (idx: number, key: keyof FormulaDefaultParams, value: number | boolean) => {
    setSubjects((rs) =>
      rs.map((r, i) =>
        i === idx
          ? {
              ...r,
              formula_params: { ...(r.formula_params || emptyParams()), [key]: value },
            }
          : r,
      ),
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-800">Fənnlər</p>
      {subjects.map((s, idx) => {
        const fp = s.formula_params || emptyParams();
        return (
          <div key={idx} className="space-y-2 rounded-lg border border-slate-200 p-2.5">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] font-medium text-slate-600">
                Kod
                <input
                  className="mt-0.5 block w-24 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                  placeholder="riyaz"
                  value={s.code}
                  onChange={(e) =>
                    setSubjects((rs) => rs.map((r, i) => (i === idx ? { ...r, code: e.target.value } : r)))
                  }
                />
              </label>
              <label className="min-w-[140px] flex-1 text-[11px] font-medium text-slate-600">
                Ad
                <input
                  className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                  placeholder="Riyaziyyat"
                  value={s.title}
                  onChange={(e) =>
                    setSubjects((rs) => rs.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r)))
                  }
                />
              </label>
              <label className="text-[11px] font-medium text-slate-600">
                Çəki
                <input
                  className="mt-0.5 block w-20 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                  type="number"
                  step={0.1}
                  value={s.weight ?? 1}
                  onChange={(e) =>
                    setSubjects((rs) =>
                      rs.map((r, i) => (i === idx ? { ...r, weight: Number(e.target.value) || 1 } : r)),
                    )
                  }
                />
              </label>
              <label className="text-[11px] font-medium text-slate-600">
                Üstünlük
                <input
                  className="mt-0.5 block w-20 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                  type="number"
                  value={s.priority ?? 1}
                  onChange={(e) =>
                    setSubjects((rs) =>
                      rs.map((r, i) => (i === idx ? { ...r, priority: Number(e.target.value) || 1 } : r)),
                    )
                  }
                />
              </label>
              <label className="min-w-[160px] flex-1 text-[11px] font-medium text-slate-600">
                Şablon
                <select
                  className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                  defaultValue=""
                  onChange={(e) => {
                    applyPreset(idx, e.target.value);
                    e.target.value = "";
                  }}
                >
                  <option value="">Şablon…</option>
                  {formulaPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-medium text-slate-600">
                Formula
                <select
                  className="mt-0.5 block rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                  value={s.formula ?? "raw_sum"}
                  onChange={(e) =>
                    setSubjects((rs) =>
                      rs.map((r, i) =>
                        i === idx
                          ? {
                              ...r,
                              formula: e.target.value === "weighted_linear" ? "weighted_linear" : "raw_sum",
                              formula_params:
                                e.target.value === "weighted_linear"
                                  ? r.formula_params || emptyParams()
                                  : r.formula_params,
                            }
                          : r,
                      ),
                    )
                  }
                >
                  <option value="raw_sum">Sadə cəm</option>
                  <option value="weighted_linear">Çəkili</option>
                </select>
              </label>
              <button
                type="button"
                className="mb-0.5 text-sm text-red-600"
                onClick={() => setSubjects((rs) => rs.filter((_, i) => i !== idx))}
              >
                Sil
              </button>
            </div>
            {s.formula === "weighted_linear" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {(
                  [
                    ["closed_coeff", "Qapalı"],
                    ["open_coded_coeff", "Kod"],
                    ["open_written_coeff", "Yazılı"],
                    ["relative_max", "Maks"],
                    ["round_step", "Yuvarlaq"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="text-[11px] font-medium text-slate-600">
                    {label}
                    <input
                      className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      type="number"
                      step={0.01}
                      value={Number(fp[key] ?? 0)}
                      onChange={(e) => patchParams(idx, key, Number(e.target.value))}
                    />
                  </label>
                ))}
                <label className="flex items-center gap-2 pt-4 text-[12px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(fp.guess_correction)}
                    onChange={(e) => patchParams(idx, "guess_correction", e.target.checked)}
                  />
                  −Y/4
                </label>
              </div>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        className="rounded border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-700"
        onClick={() => setSubjects((rs) => [...rs, emptySubject()])}
      >
        + Fənn
      </button>
    </div>
  );
}

export default function ExamScoringProfilesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("types");
  const [msg, setMsg] = useState<string | null>(null);

  const typesQuery = useQuery({
    queryKey: ["exam-types", "admin"],
    queryFn: () => listExamTypes({ active_only: false }),
  });
  const types = typesQuery.data ?? [];
  const labels = useMemo(() => examTypeLabelsMap(types.filter((t) => t.is_active)), [types]);
  const activeTypes = useMemo(() => types.filter((t) => t.is_active), [types]);

  // --- Types form ---
  const [typeEditing, setTypeEditing] = useState<ExamType | null>(null);
  const [typeCreating, setTypeCreating] = useState(false);
  const [typeSlug, setTypeSlug] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  const [typeDesc, setTypeDesc] = useState("");
  const [typeSort, setTypeSort] = useState(100);
  const [typeDefaultProfile, setTypeDefaultProfile] = useState<number | "">("");

  const profilesForDefaultQuery = useQuery({
    queryKey: ["exam-scoring-profiles", "for-defaults"],
    queryFn: () => listExamScoringProfiles({ active_only: true }),
  });
  const allProfiles = profilesForDefaultQuery.data ?? [];

  const resetTypeForm = () => {
    setTypeEditing(null);
    setTypeCreating(false);
    setTypeSlug("");
    setTypeLabel("");
    setTypeDesc("");
    setTypeSort(100);
    setTypeDefaultProfile("");
  };

  const openEditType = (t: ExamType) => {
    setTypeCreating(false);
    setTypeEditing(t);
    setTypeSlug(t.slug);
    setTypeLabel(t.label);
    setTypeDesc(t.description ?? "");
    setTypeSort(t.sort_order);
    setTypeDefaultProfile(t.default_scoring_profile_id ?? "");
  };

  const createTypeMut = useMutation({
    mutationFn: () =>
      createExamType({
        slug: typeSlug.trim(),
        label: typeLabel.trim(),
        description: typeDesc.trim() || null,
        sort_order: Number(typeSort) || 0,
        default_scoring_profile_id: typeDefaultProfile === "" ? null : Number(typeDefaultProfile),
      }),
    onSuccess: async () => {
      setMsg("İmtahan növü yaradıldı");
      resetTypeForm();
      await qc.invalidateQueries({ queryKey: ["exam-types"] });
    },
    onError: () => setMsg("Növ yaradıla bilmədi"),
  });

  const updateTypeMut = useMutation({
    mutationFn: () => {
      if (!typeEditing) throw new Error("no type");
      const payload: Parameters<typeof updateExamType>[1] = {
        label: typeLabel.trim(),
        description: typeDesc.trim() || null,
        sort_order: Number(typeSort) || 0,
        default_scoring_profile_id: typeDefaultProfile === "" ? null : Number(typeDefaultProfile),
      };
      if (!typeEditing.is_builtin) {
        payload.slug = typeSlug.trim();
      }
      return updateExamType(typeEditing.id, payload);
    },
    onSuccess: async () => {
      setMsg("İmtahan növü yeniləndi");
      resetTypeForm();
      await qc.invalidateQueries({ queryKey: ["exam-types"] });
    },
    onError: () => setMsg("Növ yenilənmədi"),
  });

  const deactivateTypeMut = useMutation({
    mutationFn: (id: number) => deactivateExamType(id),
    onSuccess: async () => {
      setMsg("İmtahan növü deaktiv edildi");
      await qc.invalidateQueries({ queryKey: ["exam-types"] });
    },
    onError: () => setMsg("Növ deaktiv edilə bilmədi (istifadədə ola bilər)"),
  });

  // --- Profiles ---
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ExamScoringProfile | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("custom");
  const [description, setDescription] = useState("");
  const [subjects, setSubjects] = useState<ScoringProfileSubject[]>([emptySubject()]);

  const listQuery = useQuery({
    queryKey: ["exam-scoring-profiles", "admin", categoryFilter],
    queryFn: () =>
      listExamScoringProfiles({
        category: categoryFilter || undefined,
        active_only: true,
      }),
  });
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const formulasQuery = useQuery({
    queryKey: ["scoring-formula-presets", "admin"],
    queryFn: () => listScoringFormulaPresets({ active_only: false }),
  });
  const formulaRows = formulasQuery.data ?? [];
  const activeFormulas = useMemo(() => formulaRows.filter((f) => f.is_active), [formulaRows]);

  const [formulaEditing, setFormulaEditing] = useState<ScoringFormulaPreset | null>(null);
  const [formulaCreating, setFormulaCreating] = useState(false);
  const [fSlug, setFSlug] = useState("");
  const [fLabel, setFLabel] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fEngine, setFEngine] = useState<"raw_sum" | "weighted_linear">("weighted_linear");
  const [fSort, setFSort] = useState(100);
  const [fParams, setFParams] = useState<FormulaDefaultParams>(emptyParams());

  const resetFormulaForm = () => {
    setFormulaEditing(null);
    setFormulaCreating(false);
    setFSlug("");
    setFLabel("");
    setFDesc("");
    setFEngine("weighted_linear");
    setFSort(100);
    setFParams(emptyParams());
  };

  const openEditFormula = (f: ScoringFormulaPreset) => {
    setFormulaCreating(false);
    setFormulaEditing(f);
    setFSlug(f.slug);
    setFLabel(f.label);
    setFDesc(f.description ?? "");
    setFEngine(f.engine === "weighted_linear" ? "weighted_linear" : "raw_sum");
    setFSort(f.sort_order);
    setFParams({ ...emptyParams(), ...(f.default_params || {}) });
  };

  const createFormulaMut = useMutation({
    mutationFn: () =>
      createScoringFormulaPreset({
        slug: fSlug.trim(),
        label: fLabel.trim(),
        description: fDesc.trim() || null,
        engine: fEngine,
        default_params: fEngine === "weighted_linear" ? fParams : {},
        sort_order: Number(fSort) || 0,
      }),
    onSuccess: async () => {
      setMsg("Formula şablonu yaradıldı");
      resetFormulaForm();
      await qc.invalidateQueries({ queryKey: ["scoring-formula-presets"] });
    },
    onError: () => setMsg("Formula şablonu yaradıla bilmədi"),
  });

  const updateFormulaMut = useMutation({
    mutationFn: () => {
      if (!formulaEditing) throw new Error("no formula");
      const payload: Parameters<typeof updateScoringFormulaPreset>[1] = {
        label: fLabel.trim(),
        description: fDesc.trim() || null,
        engine: fEngine,
        default_params: fEngine === "weighted_linear" ? fParams : {},
        sort_order: Number(fSort) || 0,
      };
      if (!formulaEditing.is_builtin) payload.slug = fSlug.trim();
      return updateScoringFormulaPreset(formulaEditing.id, payload);
    },
    onSuccess: async () => {
      setMsg("Formula şablonu yeniləndi");
      resetFormulaForm();
      await qc.invalidateQueries({ queryKey: ["scoring-formula-presets"] });
    },
    onError: () => setMsg("Formula şablonu yenilənmədi"),
  });

  const deactivateFormulaMut = useMutation({
    mutationFn: (id: number) => deactivateScoringFormulaPreset(id),
    onSuccess: async () => {
      setMsg("Formula şablonu deaktiv edildi");
      await qc.invalidateQueries({ queryKey: ["scoring-formula-presets"] });
    },
    onError: () => setMsg("Formula deaktiv edilə bilmədi"),
  });

  useEffect(() => {
    if (activeTypes.length && !activeTypes.some((t) => t.slug === category)) {
      setCategory(activeTypes[0]?.slug ?? "custom");
    }
  }, [activeTypes, category]);

  const resetProfileForm = () => {
    setCreating(false);
    setEditingProfile(null);
    setName("");
    setDescription("");
    setSubjects([emptySubject()]);
    setCategory(activeTypes.find((t) => t.slug === "custom")?.slug ?? activeTypes[0]?.slug ?? "custom");
  };

  const openEditProfile = (p: ExamScoringProfile) => {
    if (p.is_builtin) return;
    setCreating(false);
    setEditingProfile(p);
    setName(p.name);
    setCategory(p.category);
    setDescription(p.description ?? "");
    setSubjects(subjectsFromProfile(p));
  };

  const buildFormulaConfig = (base?: ExamScoringProfile["formula_config"]) => ({
    ...(base ?? { version: 1 }),
    version: 1,
    subjects: subjects
      .filter((s) => s.code.trim())
      .map((s, i) => ({
        ...s,
        code: s.code.trim(),
        title: s.title.trim() || s.code.trim(),
        weight: Number(s.weight) || 1,
        priority: Number(s.priority) || i + 1,
        formula: s.formula === "weighted_linear" ? "weighted_linear" : "raw_sum",
        formula_params:
          s.formula === "weighted_linear"
            ? { ...emptyParams(), ...(s.formula_params || {}) }
            : s.formula_params,
      })),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createExamScoringProfile({
        name: name.trim(),
        category,
        description: description.trim() || null,
        formula_config: buildFormulaConfig(),
      }),
    onSuccess: async () => {
      setMsg("Profil yaradıldı");
      resetProfileForm();
      await qc.invalidateQueries({ queryKey: ["exam-scoring-profiles"] });
    },
    onError: () => setMsg("Profil yaradıla bilmədi"),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editingProfile) throw new Error("no profile");
      return updateExamScoringProfile(editingProfile.id, {
        name: name.trim(),
        category,
        description: description.trim() || null,
        formula_config: buildFormulaConfig(editingProfile.formula_config),
      });
    },
    onSuccess: async () => {
      setMsg("Profil yeniləndi");
      resetProfileForm();
      await qc.invalidateQueries({ queryKey: ["exam-scoring-profiles"] });
    },
    onError: () => setMsg("Profil yenilənmədi"),
  });

  const cloneMut = useMutation({
    mutationFn: (id: number) => cloneExamScoringProfile(id),
    onSuccess: async () => {
      setMsg("Profil klonlandı");
      await qc.invalidateQueries({ queryKey: ["exam-scoring-profiles"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteExamScoringProfile(id),
    onSuccess: async () => {
      setMsg("Profil deaktiv edildi");
      await qc.invalidateQueries({ queryKey: ["exam-scoring-profiles"] });
    },
  });

  const typeFormOpen = typeCreating || typeEditing != null;
  const profileFormOpen = creating || editingProfile != null;

  return (
    <div className="space-y-4">
      <PageHeader title="Hesablama" className="mb-4 pb-4" />

      {msg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p>
      ) : null}

      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
            ["types", "Növlər"],
            ["profiles", "Profillər"],
            ["formulas", "Formulalar"],
            ["docs", "Sənəd"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`px-3 py-2 text-sm font-medium transition ${
              tab === id
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "types" ? (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              onClick={() => {
                resetTypeForm();
                setTypeCreating(true);
              }}
            >
              + Növ
            </button>
          </div>

          {typeFormOpen ? (
            <section className="card space-y-3">
              <h2 className="text-base font-semibold text-slate-900">
                {typeEditing ? "Növü redaktə et" : "Yeni növ"}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Ad
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={typeLabel}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTypeLabel(v);
                      if (!typeEditing && (!typeSlug || typeSlug === slugifyLabel(typeLabel))) {
                        setTypeSlug(slugifyLabel(v));
                      }
                    }}
                    placeholder="Olimpiada"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Kod
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                    value={typeSlug}
                    disabled={typeEditing?.is_builtin === true}
                    onChange={(e) => setTypeSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="olimpiada"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Sıra
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    type="number"
                    value={typeSort}
                    onChange={(e) => setTypeSort(Number(e.target.value) || 0)}
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Standart profil
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={typeDefaultProfile === "" ? "" : String(typeDefaultProfile)}
                    onChange={(e) =>
                      setTypeDefaultProfile(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  >
                    <option value="">—</option>
                    {allProfiles
                      .filter((p) => !typeSlug || p.category === typeSlug || !typeEditing)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          [{labels[p.category] ?? p.category}] {p.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                İzah
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={2}
                  value={typeDesc}
                  onChange={(e) => setTypeDesc(e.target.value)}
                  placeholder="İstəyə bağlı"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  disabled={!typeLabel.trim() || !typeSlug.trim() || createTypeMut.isPending || updateTypeMut.isPending}
                  onClick={() => (typeEditing ? updateTypeMut.mutate() : createTypeMut.mutate())}
                >
                  Saxla
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                  onClick={resetTypeForm}
                >
                  Ləğv
                </button>
              </div>
            </section>
          ) : null}

          <section className="card overflow-x-auto">
            {typesQuery.isLoading ? <p className="text-sm text-slate-500">Yüklənir…</p> : null}
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-2 py-2 font-medium">Ad</th>
                  <th className="px-2 py-2 font-medium">Kod</th>
                  <th className="px-2 py-2 font-medium">Sıra</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium text-slate-900">
                      {t.label}
                      {t.description ? (
                        <p className="mt-0.5 text-[11px] font-normal text-slate-500">{t.description}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{t.slug}</td>
                    <td className="px-2 py-2">{t.sort_order}</td>
                    <td className="px-2 py-2">
                      {t.is_builtin ? (
                        <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900">
                          Sistem
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          Sərbəst
                        </span>
                      )}{" "}
                      {!t.is_active ? (
                        <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                          Deaktiv
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-indigo-700 hover:underline"
                          onClick={() => openEditType(t)}
                        >
                          Redaktə
                        </button>
                        {!t.is_builtin && t.is_active ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-red-700 hover:underline"
                            onClick={() => deactivateTypeMut.mutate(t.id)}
                          >
                            Deaktiv
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {tab === "profiles" ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="text-sm font-medium text-slate-700">
              Növ
              <select
                className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">Hamısı</option>
                {activeTypes.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              onClick={() => {
                resetProfileForm();
                setCreating(true);
              }}
            >
              + Profil
            </button>
          </div>

          {profileFormOpen ? (
            <section className="card space-y-3">
              <h2 className="text-base font-semibold text-slate-900">
                {editingProfile ? "Profili redaktə et" : "Yeni profil"}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Ad
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Qəbul I"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Növ
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {activeTypes.map((t) => (
                      <option key={t.id} value={t.slug}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                İzah
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="İstəyə bağlı"
                />
              </label>
              <SubjectRows subjects={subjects} setSubjects={setSubjects} formulaPresets={activeFormulas} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  disabled={!name.trim() || createMut.isPending || updateMut.isPending}
                  onClick={() => (editingProfile ? updateMut.mutate() : createMut.mutate())}
                >
                  Saxla
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                  onClick={resetProfileForm}
                >
                  Ləğv
                </button>
              </div>
            </section>
          ) : null}

          <section className="card overflow-x-auto">
            {listQuery.isLoading ? <p className="text-sm text-slate-500">Yüklənir…</p> : null}
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-2 py-2 font-medium">Profil</th>
                  <th className="px-2 py-2 font-medium">Aid olduğu növ</th>
                  <th className="px-2 py-2 font-medium">Fənnlər (çəki)</th>
                  <th className="px-2 py-2 font-medium">Mənbə</th>
                  <th className="px-2 py-2 font-medium">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p: ExamScoringProfile) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium text-slate-900">
                      {p.name}
                      {p.description ? (
                        <p className="mt-0.5 text-[11px] font-normal text-slate-500">{p.description}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{labels[p.category] ?? p.category}</td>
                    <td className="px-2 py-2 text-xs text-slate-700">
                      {(p.formula_config.subjects ?? [])
                        .map((s) => `${s.title || s.code} (${s.weight ?? 1})`)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-2 py-2">
                      {p.is_builtin ? (
                        <span
                          className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900"
                          title="DİM rəsmi cədvəli — redaktə olunmur, klonlayın"
                        >
                          DİM (hazır)
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          Sizin
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        {!p.is_builtin ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-indigo-700 hover:underline"
                            onClick={() => openEditProfile(p)}
                          >
                            Redaktə
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs font-medium text-indigo-700 hover:underline"
                          title="Eyni qaydaların redaktə oluna bilən nüsxəsi"
                          onClick={() => cloneMut.mutate(p.id)}
                        >
                          Klonla
                        </button>
                        {!p.is_builtin ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-red-700 hover:underline"
                            onClick={() => deleteMut.mutate(p.id)}
                          >
                            Deaktiv
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!listQuery.isLoading && rows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Bu filtrə uyğun profil yoxdur. Yeni profil yaradın və ya DİM profilini klonlayın.
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      {tab === "formulas" ? (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              onClick={() => {
                resetFormulaForm();
                setFormulaCreating(true);
              }}
            >
              + Formula
            </button>
          </div>

          {formulaCreating || formulaEditing ? (
            <section className="card space-y-3">
              <h2 className="text-base font-semibold text-slate-900">
                {formulaEditing ? "Şablonu redaktə et" : "Yeni formula"}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Ad
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={fLabel}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFLabel(v);
                      if (!formulaEditing && (!fSlug || fSlug === slugifyLabel(fLabel))) {
                        setFSlug(slugifyLabel(v));
                      }
                    }}
                    placeholder="Olimpiada riyaz"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Kod
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                    value={fSlug}
                    disabled={formulaEditing?.is_builtin === true}
                    onChange={(e) => setFSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Mühərrik
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                    value={fEngine}
                    disabled={formulaEditing?.is_builtin === true}
                    onChange={(e) =>
                      setFEngine(e.target.value === "weighted_linear" ? "weighted_linear" : "raw_sum")
                    }
                  >
                    <option value="raw_sum">Sadə cəm</option>
                    <option value="weighted_linear">Çəkili</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Sıra
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    type="number"
                    value={fSort}
                    onChange={(e) => setFSort(Number(e.target.value) || 0)}
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                İzah
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={2}
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  placeholder="İstəyə bağlı"
                />
              </label>
              {fEngine === "weighted_linear" ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {(
                    [
                      ["closed_coeff", "Qapalı"],
                      ["open_coded_coeff", "Kod"],
                      ["open_written_coeff", "Yazılı"],
                      ["relative_max", "Maks"],
                      ["round_step", "Yuvarlaq"],
                      ["options_k", "k"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-[11px] font-medium text-slate-600">
                      {label}
                      <input
                        className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100"
                        type="number"
                        step={0.01}
                        disabled={formulaEditing?.is_builtin === true}
                        value={Number(fParams[key] ?? 0)}
                        onChange={(e) =>
                          setFParams((p) => ({ ...p, [key]: Number(e.target.value) }))
                        }
                      />
                    </label>
                  ))}
                  <label className="flex items-center gap-2 pt-4 text-[12px] text-slate-700 sm:col-span-2">
                    <input
                      type="checkbox"
                      disabled={formulaEditing?.is_builtin === true}
                      checked={Boolean(fParams.guess_correction)}
                      onChange={(e) =>
                        setFParams((p) => ({ ...p, guess_correction: e.target.checked }))
                      }
                    />
                    −Y/k
                  </label>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  disabled={
                    !fLabel.trim() ||
                    !fSlug.trim() ||
                    createFormulaMut.isPending ||
                    updateFormulaMut.isPending
                  }
                  onClick={() =>
                    formulaEditing ? updateFormulaMut.mutate() : createFormulaMut.mutate()
                  }
                >
                  Saxla
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                  onClick={resetFormulaForm}
                >
                  Ləğv
                </button>
              </div>
            </section>
          ) : null}

          <section className="card overflow-x-auto">
            {formulasQuery.isLoading ? <p className="text-sm text-slate-500">Yüklənir…</p> : null}
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-2 py-2 font-medium">Şablon</th>
                  <th className="px-2 py-2 font-medium">Mühərrik</th>
                  <th className="px-2 py-2 font-medium">Əmsallar</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {formulaRows.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium text-slate-900">
                      {f.label}
                      <p className="mt-0.5 font-mono text-[11px] font-normal text-slate-400">{f.slug}</p>
                      {f.description ? (
                        <p className="mt-0.5 text-[11px] font-normal text-slate-500">{f.description}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {f.engine === "weighted_linear" ? "Çəkili / DİM" : "Sadə cəm"}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-700">
                      {f.engine === "weighted_linear"
                        ? `q=${f.default_params.closed_coeff ?? "—"} · kod=${f.default_params.open_coded_coeff ?? "—"} · yaz=${f.default_params.open_written_coeff ?? "—"} · max=${f.default_params.relative_max ?? 100}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2">
                      {f.is_builtin ? (
                        <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900">
                          DİM
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          Sizin
                        </span>
                      )}
                      {!f.is_active ? (
                        <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                          Deaktiv
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-indigo-700 hover:underline"
                          onClick={() => openEditFormula(f)}
                        >
                          Redaktə
                        </button>
                        {!f.is_builtin && f.is_active ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-red-700 hover:underline"
                            onClick={() => deactivateFormulaMut.mutate(f.id)}
                          >
                            Deaktiv
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {tab === "docs" ? (
        <section className="card max-w-2xl space-y-6 text-sm leading-relaxed text-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Struktur</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>
                <span className="font-medium text-slate-900">Növ</span> — kateqoriya (Buraxılış, Qəbul…).
                Özündə bal hesablamır.
              </li>
              <li>
                <span className="font-medium text-slate-900">Profil</span> — fənlər, çəki, üstünlük;
                imtahana tətbiq olunur.
              </li>
              <li>
                <span className="font-medium text-slate-900">Formula</span> — fənn balının necə
                hesablandığı. Profil fənnində şablon seçəndə əmsallar doldurulur.
              </li>
            </ol>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Axın</h2>
            <p className="mt-2">
              Növ yaradın → profil bağlayın → lazım olsa formula şablonu seçin → imtahan yaradanda növ
              + profil seçin.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Qaydalar</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Sistem (DİM) növləri və formulaları silinmir; əmsallar üçün yeni şablon yaradın.</li>
              <li>DİM profilini dəyişmək üçün klonlayın.</li>
              <li>Çəki — ümumi balda fənnin əhəmiyyəti. Üstünlük — bərabər balda sıralama (1 = ən yüksək).</li>
              <li>Sadə cəm — xallar toplanır. Çəkili — DİM nisbi bal + əmsallar.</li>
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
