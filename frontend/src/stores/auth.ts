import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface User {
  id: string;
  email: string;
  nombre: string;
  picture?: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null }),
    }),
    { name: "vialt-auth", storage: createJSONStorage(() => localStorage) },
  ),
);
