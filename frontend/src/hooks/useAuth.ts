import { create } from 'zustand';
import { authApi } from '../api/auth';

const TOKEN_KEY = 'app_auth_token';

interface AuthState {
  token: string | null;
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  checkStatus: () => Promise<void>;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useAuth = create<AuthState>()((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  isEnabled: false,
  isLoading: true,
  error: null,

  checkStatus: async () => {
    set({ isLoading: true });
    try {
      const status = await authApi.getStatus();
      const token = localStorage.getItem(TOKEN_KEY);
      set({
        isEnabled: status.enabled,
        token,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (password: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await authApi.login(password);
      localStorage.setItem(TOKEN_KEY, result.token);
      set({ token: result.token, isLoading: false, error: null });
      return true;
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.message || err?.detail || 'Login failed',
      });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null });
  },

  clearError: () => set({ error: null }),
}));
