import type { SheetConfig } from "./hooks/useSheetConfig";
import type { McqGridPos } from "./layoutBlockModel";

type Props = {
  sheetConfig: SheetConfig;
  mcqGrid: McqGridPos;
  onConfigChange: (next: SheetConfig) => void;
  onMcqChange: (next: McqGridPos) => void;
};

const inp =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[12px] text-slate-900 outline-none transition focus:border-[#c0176a] focus:ring-1 focus:ring-[#fce8f3]";

export default function McqGridPropertiesPanel({
  sheetConfig,
  mcqGrid,
  onConfigChange,
  onMcqChange,
}: Props) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-[13px] font-semibold text-slate-900">Cavab şəbəkəsi</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Şagird cavablarının başladığı zona. Maqenta başlıqdan tutub sürükləyin — digər sahələr kimi.
        </p>
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-medium text-slate-700">Başlıq (kanvas)</label>
        <input
          className={inp}
          type="text"
          value={sheetConfig.mcq_grid_label ?? "CAVABLAR"}
          onChange={(e) => onConfigChange({ ...sheetConfig, mcq_grid_label: e.target.value })}
          placeholder="CAVABLAR"
        />
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-[11px] text-slate-600">
        <p>
          <span className="font-medium text-slate-800">{sheetConfig.question_count}</span> sual ·{" "}
          <span className="font-medium text-slate-800">{sheetConfig.columns_count}</span> sütun ·{" "}
          {sheetConfig.options_per_question} variant
        </p>
        {(sheetConfig.mcq_sections?.length ?? 0) > 0 ? (
          <p className="mt-1 text-slate-500">
            {sheetConfig.mcq_sections!.length} fənn/qrup başlığı — eni hər qrupun sual sayına görə
            avtomatikdir.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-slate-500">Yuxarı (mm)</label>
          <input
            className={inp}
            type="number"
            step={0.5}
            value={Number(mcqGrid.top_mm.toFixed(1))}
            onChange={(e) => onMcqChange({ ...mcqGrid, top_mm: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] font-medium text-slate-500">Sol (mm)</label>
          <input
            className={inp}
            type="number"
            step={0.5}
            value={Number(mcqGrid.left_mm.toFixed(1))}
            onChange={(e) => onMcqChange({ ...mcqGrid, left_mm: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
    </div>
  );
}
