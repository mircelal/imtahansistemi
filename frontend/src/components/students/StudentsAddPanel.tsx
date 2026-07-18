import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { createStudent, uploadStudentsBulk } from "../../api/courses";

type StudentForm = {
  student_number: string;
  full_name: string;
};

type Props = {
  courseId: number;
  onSuccess?: () => void;
};

export default function StudentsAddPanel({ courseId, onSuccess }: Props) {
  const qc = useQueryClient();
  const form = useForm<StudentForm>({ defaultValues: { student_number: "", full_name: "" } });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const addMut = useMutation({
    mutationFn: (v: StudentForm) =>
      createStudent(courseId, { student_number: v.student_number.trim(), full_name: v.full_name.trim() }),
    onSuccess: async () => {
      form.reset();
      setErr(null);
      setMsg("Şagird əlavə olundu.");
      await qc.invalidateQueries({ queryKey: ["students-list"] });
      await qc.invalidateQueries({ queryKey: ["students-summary"] });
      onSuccess?.();
    },
    onError: () => {
      setMsg(null);
      setErr("Əlavə olunmadı — kod təkrarlanması və ya format xətası.");
    }
  });

  const bulkMut = useMutation({
    mutationFn: (file: File) => uploadStudentsBulk(courseId, file),
    onSuccess: async (r) => {
      setErr(null);
      setMsg(`CSV: ${r.inserted} şagird əlavə olundu.`);
      await qc.invalidateQueries({ queryKey: ["students-list"] });
      await qc.invalidateQueries({ queryKey: ["students-summary"] });
      onSuccess?.();
    },
    onError: () => {
      setMsg(null);
      setErr("CSV yüklənmədi.");
    }
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Yeni qeydiyyat</h2>
      <p className="mt-1 text-xs text-slate-500">
    6 rəqəmli OMR kodu və tam ad. Eyni kodlu kurssuz şagird varsa, avtomatik bu kursa yazılır.
  </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={form.handleSubmit((v) => addMut.mutate(v))}
      >
        <input
          className="w-28 rounded-lg border border-slate-200 px-2 py-2 font-mono text-sm"
          placeholder="123456"
          maxLength={6}
          {...form.register("student_number", { required: true })}
        />
        <input
          className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm"
          placeholder="Ad Soyad"
          {...form.register("full_name", { required: true })}
        />
        <button
          type="submit"
          disabled={addMut.isPending}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Əlavə et
        </button>
      </form>
      <label className="mt-3 block text-xs text-slate-600">
        CSV toplu (student_number, full_name)
        <input
          type="file"
          accept=".csv"
          className="mt-1 block text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) bulkMut.mutate(f);
          }}
        />
      </label>
      {msg ? <p className="mt-2 text-sm text-emerald-800">{msg}</p> : null}
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
    </section>
  );
}
