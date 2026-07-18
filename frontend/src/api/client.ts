import axios from "axios";

/**
 * Boş / təyin edilməyibsə: nisbi URL (/api → eyni origin nginx gateway və ya Vite proxy).
 * Ayrıca backend hostu lazımdırsa .env-də VITE_API_BASE_URL təyin edin.
 */
function resolveBaseURL(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).trim().replace(/\/$/, "");
  }
  return "";
}

export const api = axios.create({
  baseURL: resolveBaseURL()
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
