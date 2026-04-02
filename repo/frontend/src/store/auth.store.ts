import { create } from 'zustand';
import { queryClient } from '../lib/query-client';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  role: string | null;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
}

const SESSION_KEY = 'pm_auth';

function loadFromSession(): { user: AuthUser | null; token: string | null } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { user: null, token: null };
    return JSON.parse(raw) as { user: AuthUser; token: string };
  } catch {
    return { user: null, token: null };
  }
}

const initial = loadFromSession();

export const useAuthStore = create<AuthState>((set) => ({
  user: initial.user,
  token: initial.token,
  role: initial.user?.role ?? null,

  login: (user: AuthUser, token: string) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, token }));
    set({ user, token, role: user.role });
  },

  logout: () => {
    sessionStorage.removeItem(SESSION_KEY);
    queryClient.clear();
    set({ user: null, token: null, role: null });
  },
}));
