import { api } from "./client";

export type AdminUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  linked_student_id?: number | null;
  created_at: string;
};

export async function listUsers() {
  const { data } = await api.get<AdminUser[]>("/api/users/");
  return data;
}

export async function createAdminUser(payload: {
  email: string;
  full_name: string;
  password: string;
  role: "admin" | "operator" | "student";
  linked_student_id?: number;
}) {
  const { data } = await api.post<AdminUser>("/api/users/", payload);
  return data;
}

export async function deleteUser(userId: number) {
  await api.delete(`/api/users/${userId}`);
}
