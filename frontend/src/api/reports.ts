import { api } from "./client";

export type ReportOverviewExam = {
  exam_id: number;
  title: string;
  course_id: number | null;
  course_name: string | null;
  question_count: number;
  scheduled_at: string | null;
  has_results: boolean;
  unique_students: number;
  scan_rows: number;
  average_score: number | null;
  last_processed_at: string | null;
};

export type ReportOverview = {
  exams: ReportOverviewExam[];
  totals: {
    exam_count: number;
    exams_with_results: number;
    total_participants: number;
    total_scan_rows: number;
    suggested_exam_id: number | null;
  };
};

export type ReportHistogramBin = {
  from: number;
  to: number;
  count: number;
};

export type ReportSummary = {
  average: number;
  minimum: number;
  maximum: number;
  std_dev: number;
  median_score: number;
  participation: number;
  unique_students: number;
  scan_rows: number;
  typical_max_score: number;
  average_percent: number | null;
  median_percent: number | null;
  std_dev_percent: number;
  q1_percent: number | null;
  q3_percent: number | null;
  pass_rate: number | null;
  pass_threshold_percent: number;
  histogram: ReportHistogramBin[];
  percent_histogram: ReportHistogramBin[];
};

export type ReportItem = {
  question_number: number;
  correct_count: number;
  attempted_count: number;
  difficulty_p: number;
  correct_answer: string | null;
};

export type ReportLeaderboardRow = {
  rank: number | null;
  student_id: number;
  student_number: string | null;
  student_full_name: string | null;
  score: number | null;
  max_score: number | null;
  percent: number;
};

export type ReportInsight = {
  key: string;
  title: string;
  message: string;
  tone: string;
};

export type ReportExamDetail = {
  exam: {
    id: number;
    title: string;
    course_id: number | null;
    course_name: string | null;
    question_count: number;
    scheduled_at: string | null;
  };
  summary: ReportSummary;
  status_breakdown: Record<string, number>;
  item_analysis: { exam_id: number; items: ReportItem[] };
  leaderboard: ReportLeaderboardRow[];
  insights: ReportInsight[];
};

export async function fetchReportsOverview() {
  const { data } = await api.get<ReportOverview>("/api/reports/overview");
  return data;
}

export async function fetchExamReportDetail(examId: number) {
  const { data } = await api.get<ReportExamDetail>(`/api/reports/exams/${examId}/detail`);
  return data;
}

export async function downloadReportExport(examId: number, kind: "pdf" | "excel") {
  const res = await api.get(`/api/reports/exams/${examId}/export/${kind}`, { responseType: "blob" });
  const blob = new Blob([res.data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `imtahan-${examId}.${kind === "excel" ? "xlsx" : "pdf"}`;
  a.click();
  URL.revokeObjectURL(url);
}
