type Props = {
  zoom: number;
  onZoomChange: (z: number) => void;
};

const PRESETS = [50, 75, 100, 150, 200] as const;

function clampZoom(z: number) {
  return Math.round(Math.min(300, Math.max(10, z)));
}

export default function ZoomToolbar({ zoom, onZoomChange }: Props) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-slate-200/80 bg-white/95 px-1 py-0.5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md"
      role="toolbar"
      aria-label="Canvas böyütmə"
    >
      <button
        type="button"
        aria-label="Kiçilt"
        disabled={zoom <= 10}
        onClick={() => onZoomChange(clampZoom(zoom - 5))}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-[2.5rem] select-none text-center text-[11px] font-semibold tabular-nums text-slate-800">
        {zoom}%
      </span>
      <button
        type="button"
        aria-label="Böyüt"
        disabled={zoom >= 300}
        onClick={() => onZoomChange(clampZoom(zoom + 5))}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-30"
      >
        +
      </button>
      <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden />
      {PRESETS.map((z) => (
        <button
          key={z}
          type="button"
          onClick={() => onZoomChange(z)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums transition ${
            zoom === z ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          }`}
        >
          {z}
        </button>
      ))}
    </div>
  );
}
