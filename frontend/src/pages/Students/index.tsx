import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listCourses } from "../../api/courses";
import CourseStudentsSection from "../../components/CourseStudentsSection";

export default function StudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const coursesQ = useQuery({ queryKey: ["courses"], queryFn: listCourses });
  const courses = useMemo(() => coursesQ.data ?? [], [coursesQ.data]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!courses.length) {
      setSelectedId(null);
      return;
    }
    const raw = searchParams.get("course");
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0 && courses.some((c) => c.id === n)) {
      setSelectedId(n);
      return;
    }
    const first = courses[0].id;
    setSelectedId(first);
    setSearchParams({ course: String(first) }, { replace: true });
  }, [courses, searchParams, setSearchParams]);

  const onChangeCourse = (id: number) => {
    setSelectedId(id);
    setSearchParams({ course: String(id) }, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Şagirdlər</h1>
        <p className="mt-2 text-sm text-slate-600">
          Hər kurs üçün 6 rəqəmli unikal kodlar təyin edin. Skan zamanı cavab kartındakı kodlar bu siyahı ilə uyğunlaşdırılır.
        </p>
      </div>

      {coursesQ.isLoading && <p className="text-slate-600">Kurslar yüklənir…</p>}
      {!coursesQ.isLoading && courses.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Sizə aid kurs yoxdur və ya giriş hüququ məhduddur. Əvvəlcə{" "}
          <Link to="/courses" className="font-medium underline">
            kurs yaradın
          </Link>
          .
        </p>
      )}

      {courses.length > 0 && selectedId != null && (
        <label className="block text-sm font-medium text-slate-800">
          Kurs seçin
          <select
            className="mt-1 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={selectedId}
            onChange={(e) => onChangeCourse(Number(e.target.value))}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                №{c.id} · {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedId != null && selectedId > 0 && <CourseStudentsSection courseId={selectedId} />}

      <p className="text-sm text-slate-500">
        <Link to="/courses" className="text-indigo-600 hover:underline">
          Kurs paneli (biletlər)
        </Link>
      </p>
    </div>
  );
}
