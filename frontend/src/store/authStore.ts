import { create } from "zustand";

type AuthState = {
  token: string | null;
  user: { id: number; email: string; full_name: string; role: string; linked_student_id?: number | null } | null;
  setToken: (token: string | null) => void;
  setUser: (user: AuthState["user"]) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("auth_token"),
  user: null,
  setToken: (token) => {
    if (token) {
      localStorage.setItem("auth_token", token);
    } else {
      localStorage.removeItem("auth_token");
    }
    set({ token });
  },
  setUser: (user) => set({ user }),
  logout: () => {
    localStorage.removeItem("auth_token");
    set({ token: null, user: null });
  }
}));
