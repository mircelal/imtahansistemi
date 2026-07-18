import { api } from "./client";

export type AdminTicketOrder = {
  id: number;
  ticket_id: number;
  ticket_title: string;
  course_id: number;
  course_name: string;
  exam_id: number | null;
  exam_title: string | null;
  exam_scope: string | null;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  currency: string;
  status: "pending" | "confirmed" | "cancelled";
  notes: string | null;
  student_id: number | null;
  created_at: string;
};

export type AdminTicketOrdersSummary = {
  total_orders: number;
  total_tickets_sold: number;
  total_revenue: number;
  by_course: Array<{
    course_id: number;
    course_name: string;
    orders: number;
    tickets: number;
    revenue: number;
  }>;
};

export async function listAdminTicketOrders(params?: {
  course_id?: number;
  exam_id?: number;
  status?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}) {
  const { data } = await api.get<AdminTicketOrder[]>("/api/admin/ticket-orders/", { params });
  return data;
}

export async function getAdminTicketOrdersSummary(params?: {
  course_id?: number;
  exam_id?: number;
  status?: string;
  date_from?: string;
  date_to?: string;
}) {
  const { data } = await api.get<AdminTicketOrdersSummary>("/api/admin/ticket-orders/summary", { params });
  return data;
}
