import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { uploadScanFiles } from "../../api/scans";

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic", ".heif"],
  "application/zip": [".zip"]
};

type Props = {
  sessionId: number | null;
};

export default function ImageUploader({ sessionId }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!sessionId || !files.length) return;
      setErr(null);
      setMsg(null);
      setBusy(true);
      try {
        const res = await uploadScanFiles(sessionId, files, true);
        setMsg(`${res.uploaded} fayl yükləndi${res.queued ? "; emal növbəyə düşdü" : ""}.`);
        await queryClient.invalidateQueries({ queryKey: ["scan-session", sessionId] });
        await queryClient.invalidateQueries({ queryKey: ["scan-sessions"] });
      } catch (e: unknown) {
        const ax = e as { response?: { data?: { detail?: string } } };
        const d = ax.response?.data?.detail;
        setErr(typeof d === "string" ? d : "Yükləmə alınmadı.");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, queryClient]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: !sessionId || busy,
    accept: ACCEPT
  });

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-6 transition ${
        !sessionId
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
          : isDragActive
            ? "border-indigo-500 bg-indigo-50/50"
            : "cursor-pointer border-slate-300 hover:border-indigo-400 hover:bg-slate-50/80"
      }`}
      {...getRootProps()}
    >
      <input {...getInputProps()} />
      <p className="text-center text-slate-700">
        {sessionId
          ? "Skan və ya telefon fotolarını (JPG, PNG, WEBP, HEIC) və ya ZIP arxivini bura sürükləyin və ya seçin"
          : "Əvvəlcə aktiv skan oturumu seçin"}
      </p>
      <p className="mt-2 text-center text-xs text-slate-500">
        Bir sorğuda çoxlu fayl; serverdə Celery ilə OMR emalı işlənir.
      </p>
      {busy && <p className="mt-3 text-center text-sm text-indigo-600">Yüklənir…</p>}
      {msg && <p className="mt-3 text-center text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-3 text-center text-sm text-red-600">{err}</p>}
    </div>
  );
}
