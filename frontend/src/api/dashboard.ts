import { api } from "./client";

export type DashboardTotals = {
  courses_total: number;
  courses_active: number;
  exams_total: number;
  exams_active: number;
  exams_with_results: number;
  exams_ready_for_scan: number;
  exams_not_ready: number;
  students_total: number;
  students_with_cabinet: number;
  scan_sessions_total: number;
  scan_sessions_open: number;
  scan_sessions_done: number;
  scan_rows_total: number;
  participants_total: number;
  manual_review_pending: number;
  scans_today: number;
  total_revenue: number;
  revenue_today: number;
  total_wallet_balance: number;
  pending_ticket_orders: number;
};

export type DashboardAlert = {
  key: string;
  title: string;
  message: string;
  tone: string;
  href: string | null;
};

export type DashboardRecentSession = {
  id: number;
  exam_id: number;
  exam_title: string | null;
  status: string;
  total_images: number;
  processed_images: number;
  operator_full_name: string | null;
  created_at: string;
};

export type DashboardExamActivity = {
  exam_id: number;
  title: string;
  course_name: string | null;
  unique_students: number;
  scan_rows: number;
  average_score: number | null;
  ready_for_scan: boolean;
  last_processed_at: string | null;
};

export type DashboardScanDay = {
  date: string;
  count: number;
};

export type DashboardQuickAction = {
  key: string;
  title: string;
  description: string;
  href: string;
};

export type PlatformDashboard = {
  totals: DashboardTotals;
  alerts: DashboardAlert[];
  recent_sessions: DashboardRecentSession[];
  exam_activity: DashboardExamActivity[];
  exams_needing_attention: DashboardExamActivity[];
  scan_activity: DashboardScanDay[];
  quick_actions: DashboardQuickAction[];
};

export async function fetchDashboardOverview() {
  const { data } = await api.get<PlatformDashboard>("/api/dashboard/overview");
  return data;
}
