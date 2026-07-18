import { api } from "./client";

export type CourseWallet = {
  course_id: number;
  balance: number;
  currency: string;
  revenue_total: number;
  revenue_today: number;
  tickets_sold_total: number;
  updated_at: string | null;
};

export type CourseWalletTransaction = {
  id: number;
  amount: number;
  amount_cents: number;
  tx_type: string;
  ref_type: string | null;
  ref_id: number | null;
  note: string | null;
  created_at: string;
  created_by_name: string | null;
};

export type AdminFinanceOverview = {
  total_wallet_balance: number;
  total_revenue: number;
  revenue_today: number;
  tickets_sold_total: number;
  pending_orders: number;
  courses: Array<{
    course_id: number;
    course_name: string;
    wallet_balance: number;
    currency: string;
    revenue_total: number;
    tickets_sold: number;
  }>;
};

export async function fetchCourseWallet(courseId: number) {
  const { data } = await api.get<CourseWallet>(`/api/courses/${courseId}/wallet`);
  return data;
}

export async function fetchCourseWalletTransactions(courseId: number, limit = 50) {
  const { data } = await api.get<CourseWalletTransaction[]>(`/api/courses/${courseId}/wallet/transactions`, {
    params: { limit },
  });
  return data;
}

export async function adjustCourseWallet(courseId: number, payload: { amount: number; note: string }) {
  const { data } = await api.post<CourseWallet>(`/api/courses/${courseId}/wallet/adjust`, payload);
  return data;
}

export async function fetchAdminFinanceOverview() {
  const { data } = await api.get<AdminFinanceOverview>("/api/admin/finance/overview");
  return data;
}
