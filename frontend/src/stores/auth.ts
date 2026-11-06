import { create } from "zustand";

export interface User {
  id: string;
  email: string;
  nombre: string;
  picture?: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  initialized: boolean;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  initialized: false,
  setAuth: (token, user) => set({ token, user, initialized: true }),
  setUser: (user) => set({ user }),
  clear: () => set({ token: null, user: null, initialized: true }),
}));
