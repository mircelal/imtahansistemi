import { api } from "./client";

export type ExamTicket = {
  id: number;
  course_id: number;
  exam_id: number | null;
  title: string;
  description: string | null;
  price_amount: number;
  currency: string;
  quota: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type TicketOrder = {
  id: number;
  ticket_id: number;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  quantity: number;
  status: "pending" | "confirmed" | "cancelled";
  notes: string | null;
  created_at: string;
};

export async function listCourseTickets(courseId: number) {
  const { data } = await api.get<ExamTicket[]>(`/api/courses/${courseId}/tickets`);
  return data;
}

export async function createTicket(
  courseId: number,
  payload: {
    title: string;
    description?: string;
    price_amount: number;
    currency?: string;
    quota?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
    is_active?: boolean;
    exam_id?: number | null;
  }
) {
  const { data } = await api.post<ExamTicket>(`/api/courses/${courseId}/tickets`, payload);
  return data;
}

export async function deleteTicket(ticketId: number) {
  await api.delete(`/api/tickets/${ticketId}`);
}

export async function listTicketOrders(ticketId: number) {
  const { data } = await api.get<TicketOrder[]>(`/api/tickets/${ticketId}/orders`);
  return data;
}

export async function createTicketOrder(
  ticketId: number,
  payload: {
    buyer_name: string;
    buyer_email: string;
    buyer_phone?: string;
    quantity: number;
    notes?: string;
  }
) {
  const { data } = await api.post<TicketOrder>(`/api/tickets/${ticketId}/orders`, payload);
  return data;
}

export async function confirmOrder(orderId: number) {
  const { data } = await api.post<TicketOrder>(`/api/ticket-orders/${orderId}/confirm`);
  return data;
}

export async function cancelOrder(orderId: number) {
  const { data } = await api.post<TicketOrder>(`/api/ticket-orders/${orderId}/cancel`);
  return data;
}
