import type { Course } from "../../api/courses";

export type StudentsFilterState = {
  courseId: number | "";
  search: string;
  hasLogin: "" | "yes" | "no";
  sort: string;
  order: "asc" | "desc";
  pageSize: number;
};

type Props = {
  courses: Course[];
  isAdmin: boolean;
  filters: StudentsFilterState;
  onChange: (next: Partial<StudentsFilterState>) => void;
};

export default function StudentsFilters({ courses, isAdmin, filters, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {isAdmin ? (
        <select
          className="min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={filters.courseId === "" ? "" : String(filters.courseId)}
          onChange={(e) => onChange({ courseId: e.target.value === "" ? "" : Number(e.target.value) })}
        >
          <option value="">Bütün kurslar</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <select
          className="min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={filters.courseId === "" ? "" : String(filters.courseId)}
          onChange={(e) => onChange({ courseId: Number(e.target.value) })}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <input
        type="search"
        placeholder="Kod, FIN, ad və ya e-poçt…"
        className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={filters.search}
        onChange={(e) => onChange({ search: e.target.value })}
      />

      <select
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={filters.hasLogin}
        onChange={(e) => onChange({ hasLogin: e.target.value as StudentsFilterState["hasLogin"] })}
      >
        <option value="">Kabinet: hamısı</option>
        <option value="yes">Kabineti var</option>
        <option value="no">Kabineti yox</option>
      </select>

      <select
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={filters.sort}
        onChange={(e) => onChange({ sort: e.target.value })}
      >
        <option value="full_name">Ad üzrə</option>
        <option value="student_number">Kod üzrə</option>
        <option value="created_at">Qeydiyyat tarixi</option>
        <option value="last_result_at">Son nəticə</option>
      </select>

      <select
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={filters.order}
        onChange={(e) => onChange({ order: e.target.value as "asc" | "desc" })}
      >
        <option value="asc">Artan</option>
        <option value="desc">Azalan</option>
      </select>

      <select
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={filters.pageSize}
        onChange={(e) => onChange({ pageSize: Number(e.target.value) })}
      >
        <option value={25}>25 / səhifə</option>
        <option value={50}>50 / səhifə</option>
        <option value={100}>100 / səhifə</option>
      </select>
    </div>
  );
}
