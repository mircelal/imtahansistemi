import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { createStudent, listStudents, uploadStudentsBulk } from "../api/courses";
import { useAuthStore } from "../store/authStore";
import { useState } from "react";

type StudentForm = {
  student_number: string;
  full_name: string;
};

type Props = {
  courseId: number;
};

/**
 * Kurs üzrə şagird siyahısı (6 rəqəmli kod). Menecer, admin və kurs operatorları üçün.
 */
export default function CourseStudentsSection({ courseId: cid }: Props) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const studentForm = useForm<StudentForm>({
    defaultValues: { student_number: "", full_name: "" }
  });
  const [studentMsg, setStudentMsg] = useState<string | null>(null);
  const [studentErr, setStudentErr] = useState<string | null>(null);

  const studentsQ = useQuery({
    queryKey: ["students", cid],
    queryFn: () => listStudents(cid),
    enabled: Number.isFinite(cid)
  });

  const addStudentMut = useMutation({
    mutationFn: (v: StudentForm) =>
      createStudent(cid, { student_number: v.student_number.trim(), full_name: v.full_name.trim() }),
    onSuccess: async () => {
      studentForm.reset();
      setStudentErr(null);
      setStudentMsg("Şagird əlavə olundu.");
      await qc.invalidateQueries({ queryKey: ["students", cid] });
    },
    onError: () => {
      setStudentMsg(null);
      setStudentErr("Əlavə olunmadı — 6 rəqəmli kod və ya təkrarlanma.");
    }
  });

  const bulkStudentsMut = useMutation({
    mutationFn: (file: File) => uploadStudentsBulk(cid, file),
    onSuccess: async (r) => {
      setStudentErr(null);
      setStudentMsg(`CSV: ${r.inserted} şagird.`);
      await qc.invalidateQueries({ queryKey: ["students", cid] });
    },
    onError: () => {
      setStudentMsg(null);
      setStudentErr("CSV yüklənmədi — format: student_number,full_name (6 rəqəm).");
    }
  });

  if (!user || user.role === "student") {
    return null;
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-slate-900">Şagirdlər (6 rəqəmli kod)</h2>
      <p className="mb-3 text-sm text-slate-600">
        Kodlar kurs üzrə unikaldır. Cavab kartında OMR ilə eyni kodlar skan zamanı avtomatik şagirdə bağlanır.
      </p>
      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={studentForm.handleSubmit((v) => addStudentMut.mutate(v))}
      >
        <input
          className="w-28 rounded-md border border-slate-300 px-2 py-2 font-mono text-sm"
          placeholder="123456"
          maxLength={6}
          {...studentForm.register("student_number", { required: true })}
        />
        <input
          className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm"
          placeholder="Ad Soyad"
          {...studentForm.register("full_name", { required: true })}
        />
        <button
          type="submit"
          disabled={addStudentMut.isPending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Əlavə et
        </button>
      </form>
      <label className="block text-sm text-slate-700">
        CSV toplu (sütunlar: student_number, full_name)
        <input
          type="file"
          accept=".csv"
          className="mt-1 block text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) bulkStudentsMut.mutate(f);
          }}
        />
      </label>
      {studentMsg && <p className="mt-2 text-sm text-emerald-800">{studentMsg}</p>}
      {studentErr && <p className="mt-2 text-sm text-red-700">{studentErr}</p>}
      <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
        {(studentsQ.data ?? []).map((s) => (
          <li key={s.id} className="flex flex-wrap justify-between gap-2 rounded border border-white bg-white px-2 py-1">
            <span className="font-mono font-semibold text-slate-900">{s.student_number}</span>
            <span className="text-slate-700">{s.full_name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
