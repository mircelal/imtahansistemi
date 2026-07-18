import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { me } from "../../api/auth";
import { createStudentLogin } from "../../api/courses";
import type { StudentListRow } from "../../api/studentsAdmin";
import {
  deleteStudent,
  deleteStudentLogin,
  getCourseStudentProfile,
  impersonateStudent,
  resetStudentPassword
} from "../../api/studentsAdmin";
import { useAuthStore } from "../../store/authStore";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import StudentResultsTable from "./StudentResultsTable";
import { formatDateTime } from "../../utils/dateFormat";

type Props = {
  row: StudentListRow;
  onClose: () => void;
  onUpdated: () => void;
};

function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: string } | undefined;
    if (typeof d?.detail === "string") return d.detail;
  }
  return "Xəta baş verdi.";
}

function formatDt(iso: string | null | undefined) {
  return formatDateTime(iso);
}

type Tab = "info" | "results" | "stats" | "registrations";

export default function StudentDetailDrawer({ row, onClose, onUpdated }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("info");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const profileQ = useQuery({
    queryKey: ["student-profile", row.course_id, row.id],
    queryFn: () => getCourseStudentProfile(row.course_id, row.id)
  });

  const createLoginMut = useMutation({
    mutationFn: () =>
      createStudentLogin(row.course_id, row.id, {
        email: loginEmail.trim(),
        password: loginPassword,
        full_name: row.full_name
      }),
    onSuccess: () => {
      setLoginEmail("");
      setLoginPassword("");
      onUpdated();
      profileQ.refetch();
    }
  });

  const resetMut = useMutation({
    mutationFn: () => resetStudentPassword(row.course_id, row.id, resetPassword),
    onSuccess: () => {
      setResetPassword("");
      window.alert("Şifrə yeniləndi.");
    }
  });

  const deleteLoginMut = useMutation({
    mutationFn: () => deleteStudentLogin(row.course_id, row.id),
    onSuccess: () => {
      onUpdated();
      profileQ.refetch();
    }
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteStudent(row.course_id, row.id),
    onSuccess: () => {
      onUpdated();
      onClose();
    }
  });

  const impersonateMut = useMutation({
    mutationFn: () => {
      const uid = row.login_user_id ?? profile?.account.user_id;
      if (!uid) throw new Error("Kabinet yoxdur");
      return impersonateStudent(uid);
    },
    onSuccess: async (data) => {
      setToken(data.access_token);
      const u = await me();
      setUser(u);
      navigate("/");
    }
  });

  const profile = profileQ.data;
  const tabs: { id: Tab; label: string }[] = [
    { id: "info", label: "Məlumat" },
    { id: "results", label: "Nəticələr" },
    { id: "stats", label: "Statistika" },
    { id: "registrations", label: "Qeydiyyatlar" }
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="font-mono text-sm text-slate-500">{row.student_number}</p>
            <h2 className="text-xl font-bold text-slate-900">{row.full_name}</h2>
            <p className="text-sm text-slate-600">{row.course_name}</p>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`px-3 py-2.5 text-sm font-medium ${
                tab === t.id ? "border-b-2 border-violet-600 text-violet-700" : "text-slate-500"
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {profileQ.isLoading ? (
            <p className="text-slate-500">Yüklənir…</p>
          ) : profileQ.isError ? (
            <p className="text-red-600">{errMsg(profileQ.error)}</p>
          ) : profile ? (
            <>
              {tab === "info" && (
                <div className="space-y-4">
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-slate-100 py-2">
                      <dt className="text-slate-500">Kod</dt>
                      <dd className="font-mono font-semibold">{profile.student.student_number}</dd>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 py-2">
                      <dt className="text-slate-500">Kurs</dt>
                      <dd>{profile.student.course_name}</dd>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 py-2">
                      <dt className="text-slate-500">Kabinet e-poçtu</dt>
                      <dd>{row.has_login ? profile.account.email : "—"}</dd>
                    </div>
                    <div className="flex justify-between py-2">
                      <dt className="text-slate-500">Qeydiyyat</dt>
                      <dd>{formatDt(row.created_at)}</dd>
                    </div>
                  </dl>

                  {!row.has_login ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                      <p className="mb-2 text-sm font-medium text-emerald-950">Kabinet yarat</p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="email"
                          placeholder="E-poçt"
                          className="rounded-md border px-2 py-1.5 text-sm"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                        />
                        <input
                          type="password"
                          placeholder="Şifrə (min 6)"
                          className="rounded-md border px-2 py-1.5 text-sm"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                        />
                        <Button
                          size="sm"
                          disabled={createLoginMut.isPending}
                          onClick={() => createLoginMut.mutate()}
                        >
                          Yarat
                        </Button>
                      </div>
                      {createLoginMut.isError ? (
                        <p className="mt-2 text-sm text-red-600">{errMsg(createLoginMut.error)}</p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                      <Badge variant="success">Kabinet aktiv</Badge>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="password"
                          placeholder="Yeni şifrə"
                          className="rounded-md border px-2 py-1.5 text-sm"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={resetMut.isPending || resetPassword.length < 6}
                          onClick={() => resetMut.mutate()}
                        >
                          Şifrə reset
                        </Button>
                        {isAdmin ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={impersonateMut.isPending}
                            onClick={() => {
                              if (window.confirm("Şagird kabinetinə admin baxış rejimində keçilsin?")) {
                                impersonateMut.mutate();
                              }
                            }}
                          >
                            Şagird kimi bax
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          disabled={deleteLoginMut.isPending}
                          onClick={() => {
                            if (window.confirm("Kabinet silinsin?")) deleteLoginMut.mutate();
                          }}
                        >
                          Kabineti sil
                        </Button>
                      </div>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    className="text-red-600"
                    disabled={deleteMut.isPending || row.has_login}
                    onClick={() => {
                      if (window.confirm("Şagird qeydiyyatı silinsin?")) deleteMut.mutate();
                    }}
                  >
                    Qeydiyyatı sil
                  </Button>
                  {deleteMut.isError ? <p className="text-sm text-red-600">{errMsg(deleteMut.error)}</p> : null}
                </div>
              )}

              {tab === "results" && <StudentResultsTable results={profile.results} />}
              {tab === "stats" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label="İmtahan sayı" value={profile.stats.distinct_exams} />
                  <Stat label="Cəhdlər" value={profile.stats.total_attempts} />
                  <Stat
                    label="Orta faiz"
                    value={profile.stats.average_percent != null ? `${profile.stats.average_percent}%` : "—"}
                  />
                  <Stat
                    label="Ən yaxşı"
                    value={profile.stats.best_percent != null ? `${profile.stats.best_percent}%` : "—"}
                  />
                  {profile.exam_summaries.map((ex) => (
                    <div key={ex.exam_id} className="sm:col-span-2 rounded-lg border border-slate-100 p-3 text-sm">
                      <p className="font-semibold">{ex.exam_title}</p>
                      <p className="text-slate-500">
                        Cəhd: {ex.attempt_count} · Ən yaxşı: {ex.best_percent ?? "—"}% · Son:{" "}
                        {ex.latest_percent ?? "—"}%
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {tab === "registrations" && (
                <div className="space-y-2">
                  {profile.registrations.length === 0 ? (
                    <p className="text-sm text-slate-500">Bilet qeydiyyatı yoxdur.</p>
                  ) : (
                    profile.registrations.map((r) => (
                      <div key={r.order_id} className="rounded-lg border border-slate-100 p-3 text-sm">
                        <p className="font-medium">{r.exam_title ?? r.ticket_title}</p>
                        <p className="text-slate-500">
                          {r.course_name} · {r.status} · {formatDt(r.ordered_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
