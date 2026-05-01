import { api } from "./client";

export type LoginPayload = {
  email: string;
  password: string;
};

export type BootstrapPayload = {
  email: string;
  full_name: string;
  password: string;
};

export async function login(payload: LoginPayload) {
  const { data } = await api.post<{ access_token: string; token_type: string }>("/api/auth/login", payload);
  return data;
}

export async function me() {
  const { data } = await api.get<{
    id: number;
    email: string;
    full_name: string;
    role: string;
    linked_student_id?: number | null;
  }>("/api/auth/me");
  return data;
}

export async function bootstrapAdmin(payload: BootstrapPayload) {
  const { data } = await api.post<{ id: number; email: string; full_name: string; role: string }>(
    "/api/auth/bootstrap-admin",
    payload
  );
  return data;
}

export async function bootstrapStatus() {
  const { data } = await api.get<{ needs_bootstrap: boolean }>("/api/auth/bootstrap-status");
  return data;
}

export type OperatorUser = { id: number; email: string; full_name: string; role: string };

export async function listOperators() {
  const { data } = await api.get<OperatorUser[]>("/api/auth/operators");
  return data;
}
