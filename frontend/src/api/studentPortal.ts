import { api } from "./client";

export type StudentSummary = {
  id: number;
  student_number: string;
  full_name: string;
  course_id: number;
  course_name: string;
};

export type StudentStats = {
  total_attempts: number;
  graded_attempts: number;
  distinct_exams: number;
  average_percent: number | null;
  best_percent: number | null;
  lowest_percent: number | null;
  last_graded_at: string | null;
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
};

export type StudentProfile = {
  student: StudentSummary;
  stats: StudentStats;
  results: StudentResultRow[];
};

export async function fetchStudentProfile() {
  const { data } = await api.get<StudentProfile>("/api/me/student");
  return data;
}
