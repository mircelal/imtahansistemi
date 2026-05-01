import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";

type Summary = {
  average: number;
  minimum: number;
  maximum: number;
  std_dev: number;
  participation: number;
  histogram: { from: number; to: number; count: number }[];
};

async function fetchSummary(examId: number) {
  const { data } = await api.get<Summary>(`/api/reports/exams/${examId}/summary`);
  return data;
}

export default function ReportsPage() {
  const [searchParams] = useSearchParams();
  const fromUrl = Number(searchParams.get("exam") || "0");
  const [examId, setExamId] = useState(fromUrl > 0 ? fromUrl : 1);

  useEffect(() => {
    if (fromUrl > 0) setExamId(fromUrl);
  }, [fromUrl]);
  const summaryQ = useQuery({
    queryKey: ["report-summary", examId],
    queryFn: () => fetchSummary(examId),
    enabled: examId > 0
  });

  const chartData =
    summaryQ.data?.histogram.map((b, i) => ({
      name: `${b.from.toFixed(0)}–${b.to.toFixed(0)}`,
      count: b.count,
      key: i
    })) ?? [];

  const download = async (kind: "pdf" | "excel") => {
    const res = await api.get(`/api/reports/exams/${examId}/export/${kind}`, { responseType: "blob" });
    const blob = new Blob([res.data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `imtahan-${examId}.${kind === "excel" ? "xlsx" : "pdf"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Hesabatlar</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-slate-700">İmtahan ID</label>
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            className="w-32 rounded-md border border-slate-300 px-3 py-2"
            value={examId}
            min={1}
            onChange={(e) => setExamId(Number(e.target.value))}
          />
        </div>
      </section>

      {summaryQ.isLoading && <p className="text-slate-600">Yüklənir...</p>}
      {summaryQ.data && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">Ümumi göstəricilər</h2>
          <p className="text-sm text-slate-600">
            İştirak: {summaryQ.data.participation} · Orta: {summaryQ.data.average.toFixed(2)} · Min:{" "}
            {summaryQ.data.minimum.toFixed(2)} · Max: {summaryQ.data.maximum.toFixed(2)} · Std:{" "}
            {summaryQ.data.std_dev.toFixed(2)}
          </p>
          {chartData.length > 0 && (
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          onClick={() => download("excel")}
        >
          Excel yüklə
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          onClick={() => download("pdf")}
        >
          PDF yüklə
        </button>
      </section>
    </div>
  );
}
