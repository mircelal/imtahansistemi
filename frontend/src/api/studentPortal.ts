import { api } from "./client";

export type StudentAccount = {
  user_id: number | null;
  email: string;
  full_name: string;
  fin_code?: string | null;
  phone?: string | null;
  member_since: string;
};

export type StudentSummary = {
  id: number;
  student_number: string;
  full_name: string;
  course_id: number | null;
  course_name: string;
  courses?: string[];
};

export type StudentStats = {
  total_attempts: number;
  graded_attempts: number;
  distinct_exams: number;
  average_percent: number | null;
  best_percent: number | null;
  lowest_percent: number | null;
  last_graded_at: string | null;
  median_percent: number | null;
  std_dev_percent: number | null;
};

export type StudentSubjectBrief = {
  subject_code: string;
  subject_name: string;
  percent: number | null;
};

export type StudentResultRow = {
  scan_result_id: number;
  exam_id: number;
  exam_title: string;
  exam_scope_label: string;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  status: string;
  processed_at: string | null;
  subjects: StudentSubjectBrief[];
  rank_in_exam: number | null;
  percentile_in_exam: number | null;
  vs_exam_average: number | null;
};

export type StudentExamSummary = {
  exam_id: number;
  exam_title: string;
  exam_scope_label: string;
  attempt_count: number;
  best_percent: number | null;
  latest_percent: number | null;
  first_percent: number | null;
  improvement_delta: number | null;
  latest_processed_at: string | null;
  cohort_average_percent: number | null;
  cohort_median_percent: number | null;
  rank: number | null;
  total_participants: number;
  percentile: number | null;
  subjects: StudentSubjectBrief[];
};

export type StudentRegistration = {
  order_id: number;
  ticket_title: string;
  exam_id: number | null;
  exam_title: string | null;
  course_name: string;
  status: string;
  quantity: number;
  ordered_at: string;
  has_result: boolean;
};

export type StudentProgressPoint = {
  scan_result_id: number;
  exam_id: number;
  exam_title: string;
  percent: number;
  processed_at: string | null;
};

export type StudentSubjectStat = {
  subject_code: string;
  subject_name: string;
  earned: number;
  max_score: number;
  percent: number | null;
  attempts: number;
};

export type StudentCohortCompare = {
  exam_id: number;
  exam_title: string;
  student_best_percent: number | null;
  student_latest_percent: number | null;
  cohort_average_percent: number | null;
  cohort_median_percent: number | null;
  rank: number | null;
  total_participants: number;
  percentile: number | null;
};

export type StudentInsight = {
  key: string;
  title: string;
  message: string;
  tone: "positive" | "neutral" | "attention" | string;
};

export type StudentAnalytics = {
  progress_trend: StudentProgressPoint[];
  subject_breakdown: StudentSubjectStat[];
  cohort_comparisons: StudentCohortCompare[];
  insights: StudentInsight[];
  performance_band: string | null;
};

export type StudentProfile = {
  account: StudentAccount;
  student: StudentSummary;
  stats: StudentStats;
  exam_summaries: StudentExamSummary[];
  registrations: StudentRegistration[];
  results: StudentResultRow[];
  analytics: StudentAnalytics;
};

export type StudentExamAttempt = {
  scan_result_id: number;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  status: string;
  processed_at: string | null;
  subjects: StudentSubjectBrief[];
};

export type StudentExamDetail = {
  exam_id: number;
  exam_title: string;
  exam_scope_label: string;
  attempt_count: number;
  best_percent: number | null;
  latest_percent: number | null;
  first_percent: number | null;
  improvement_delta: number | null;
  cohort_average_percent: number | null;
  cohort_median_percent: number | null;
  rank: number | null;
  total_participants: number;
  percentile: number | null;
  attempts: StudentExamAttempt[];
};

export async function fetchStudentProfile() {
  const { data } = await api.get<StudentProfile>("/api/me/student");
  return data;
}

export async function fetchStudentExamDetail(examId: number) {
  const { data } = await api.get<StudentExamDetail>(`/api/me/student/exams/${examId}`);
  return data;
}
