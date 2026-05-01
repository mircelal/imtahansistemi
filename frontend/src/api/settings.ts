import { api } from "./client";

export type PublicSettings = {
  system_name: string;
  has_logo: boolean;
};

export type AdminSettings = PublicSettings;

export async function getPublicSettings() {
  const { data } = await api.get<PublicSettings>("/api/settings/public");
  return data;
}

export async function getAdminSettings() {
  const { data } = await api.get<AdminSettings>("/api/settings/admin");
  return data;
}

export async function updateAdminSettings(payload: { system_name: string }) {
  const { data } = await api.put<AdminSettings>("/api/settings/admin", payload);
  return data;
}

export async function uploadLogo(file: File) {
  const form = new FormData();
  form.append("file", file);
  await api.post("/api/settings/admin/logo", form);
}

export async function deleteLogo() {
  await api.delete("/api/settings/admin/logo");
}

/** İctimai logo; brauzer eyni origin + Vite proxy ilə yükləyir. */
export function publicLogoPath() {
  return "/api/settings/public/logo";
}
