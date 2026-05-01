import axios from "axios";

/**
 * Boş / təyin edilməyibsə: DEV mühitində nisbi URL (/api → Vite proxy).
 * Əks halda birbaşa backend ünvanı (məs. Docker üçün .env-də http://localhost:8000).
 */
function resolveBaseURL(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).trim().replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "";
  }
  return "http://localhost:8000";
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
