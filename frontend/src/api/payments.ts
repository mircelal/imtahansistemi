import { api } from "./client";
import type { ExamTicket } from "./tickets";

export type PaymentIntent = {
  id: number;
  public_id: string;
  purpose: string;
  amount_cents: number;
  currency: string;
  status: string;
  driver: string;
  external_id: string | null;
  checkout_url: string | null;
  course_id: number | null;
  ticket_order_id: number | null;
  buyer_email: string | null;
  paid_at: string | null;
  created_at: string;
};

export type CheckoutResponse = {
  intent: PaymentIntent;
  checkout_url: string;
  driver: string;
};

export type PaymentSettings = {
  active_driver: string;
  drivers: string[];
  config: Record<string, unknown>;
  wallet_enabled: boolean;
  payriff_configured: boolean;
  mock_available: boolean;
};

export async function createWalletTopup(payload: {
  course_id: number;
  amount: number;
  return_url?: string;
  cancel_url?: string;
}) {
  const { data } = await api.post<CheckoutResponse>("/api/payments/wallet-topup", payload);
  return data;
}

export async function fetchPaymentIntent(publicId: string) {
  const { data } = await api.get<PaymentIntent>(`/api/payments/intents/${publicId}`);
  return data;
}

export async function mockCompletePayment(publicId: string) {
  const { data } = await api.post<PaymentIntent>(`/api/payments/mock/complete/${publicId}`);
  return data;
}

export async function getPaymentSettings() {
  const { data } = await api.get<PaymentSettings>("/api/admin/settings/payments");
  return data;
}

export async function updatePaymentSettings(payload: {
  active_driver: string;
  config?: Record<string, unknown>;
  wallet_enabled?: boolean;
}) {
  const { data } = await api.put<PaymentSettings>("/api/admin/settings/payments", payload);
  return data;
}

export async function fetchPublicTicket(ticketId: number) {
  const { data } = await api.get<ExamTicket>(`/api/public/tickets/${ticketId}`);
  return data;
}

export async function publicTicketCheckout(
  ticketId: number,
  payload: {
    buyer_name: string;
    buyer_email: string;
    buyer_phone?: string;
    quantity?: number;
    notes?: string;
    return_url?: string;
    cancel_url?: string;
  }
) {
  const { data } = await api.post<CheckoutResponse>(`/api/public/tickets/${ticketId}/checkout`, payload);
  return data;
}
