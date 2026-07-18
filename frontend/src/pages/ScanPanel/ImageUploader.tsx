import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { quickUploadScanFiles, type ScanQuickUpload, uploadScanFiles } from "../../api/scans";

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic", ".heif"],
  "application/zip": [".zip"],
};

type Props = {
  sessionId: number | null;
  uploadDisabled?: boolean;
  /** Bitmiş partiya — yükləmə bağlanır (tarixçə silinməsin) */
  sessionClosed?: boolean;
  /** QR ilə avtomatik imtahan tanıma — sessionId olmadan yükləmə */
  autoDetect?: boolean;
  onQuickUpload?: (result: ScanQuickUpload) => void;
};

export default function ImageUploader({
  sessionId,
  uploadDisabled = false,
  sessionClosed = false,
  autoDetect = false,
  onQuickUpload,
}: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canUpload = (sessionId != null || autoDetect) && !uploadDisabled;

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!canUpload || !files.length) return;
      setErr(null);
      setMsg(null);
      setBusy(true);
      try {
        if (sessionId == null && autoDetect) {
          const res = await quickUploadScanFiles(files, true);
          const title = res.qr.exam_title ?? (res.qr.exam_id ? `İmtahan #${res.qr.exam_id}` : "");
          setMsg(
            title
              ? `${title} tanındı · ${res.uploaded} fayl yükləndi${res.queued ? " · emal başladı" : ""}`
              : `${res.uploaded} fayl yükləndi`,
          );
          onQuickUpload?.(res);
          await queryClient.invalidateQueries({ queryKey: ["scan-session", res.session.id] });
          await queryClient.invalidateQueries({ queryKey: ["scan-results", res.session.id] });
          await queryClient.invalidateQueries({ queryKey: ["scan-sessions"] });
        } else if (sessionId != null) {
          const res = await uploadScanFiles(sessionId, files, true);
          setMsg(`${res.uploaded} fayl yükləndi${res.queued ? "; emal növbəyə düşdü" : ""}.`);
          await queryClient.invalidateQueries({ queryKey: ["scan-session", sessionId] });
          await queryClient.invalidateQueries({ queryKey: ["scan-results", sessionId] });
          await queryClient.invalidateQueries({ queryKey: ["scan-sessions"] });
        }
      } catch (e: unknown) {
        const ax = e as { response?: { data?: { detail?: string } } };
        const d = ax.response?.data?.detail;
        setErr(typeof d === "string" ? d : "Yükləmə alınmadı.");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, autoDetect, canUpload, queryClient, onQuickUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: !canUpload || busy,
    accept: ACCEPT,
  });

  const hint =
    sessionClosed
      ? "Bu partiya bitib — nəticələr saxlanır. Əlavə kart üçün yuxarıda «Yeni partiya» açın."
      : sessionId != null
        ? uploadDisabled
          ? "İmtahan hazır olmayana qədər skan yükləməsi deaktivdir"
          : "Skan və ya telefon fotolarını (JPG, PNG, WEBP, HEIC) və ya ZIP arxivini bura sürükləyin"
        : autoDetect
          ? "Cavab kartı şəkillərini buraya atın — QR kod imtahanı avtomatik tanıyacaq"
          : "Skan partiyası hazırlanır…";

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-6 transition ${
        !canUpload
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
          : isDragActive
            ? "border-indigo-500 bg-indigo-50/50"
            : "cursor-pointer border-slate-300 hover:border-indigo-400 hover:bg-slate-50/80"
      }`}
      {...getRootProps()}
    >
      <input {...getInputProps()} />
      <p className="text-center text-slate-700">{hint}</p>
      <p className="mt-2 text-center text-xs text-slate-500">
        Bir sorğuda çoxlu fayl; serverdə Celery ilə OMR emalı işlənir.
        <span className="mt-1 block text-amber-800/90">
          Ekran görüntüsü yox — çap edilmiş kartın tam skan/fotosu. Aşağı sağ küncdə QR kodu görünməlidir.
        </span>
      </p>
      {busy && <p className="mt-3 text-center text-sm text-indigo-600">QR oxunur və yüklənir…</p>}
      {msg && <p className="mt-3 text-center text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-3 text-center text-sm text-red-600">{err}</p>}
    </div>
  );
}
