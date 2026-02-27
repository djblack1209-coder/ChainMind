// Auth store: manages user authentication state
// Uses Electron IPC for SQLite-backed auth, falls back gracefully in browser

import { create } from 'zustand';
import type {} from '@/lib/electron-api'; // pull in global Window augmentation

interface UserInfo {
  id: number;
  uuid: string;
  username: string;
  nick_name: string;
  header_img: string;
  phone: string;
  email: string;
  enable: number;
  authority_id: number;
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  isLoggedIn: boolean;
  loading: boolean;

  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  verifyToken: () => Promise<boolean>;
  updateUser: (partial: Partial<UserInfo>) => void;
  changePassword: (oldPwd: string, newPwd: string) => Promise<{ ok: boolean; error?: string }>;
  restoreSession: () => Promise<boolean>;
}

const TOKEN_KEY = 'chainmind_token';

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  user: null,
  isLoggedIn: false,
  loading: false,

  login: async (username, password) => {
    set({ loading: true });
    try {
      const api = window.electronAPI;
      if (!api) return { ok: false, error: 'Not in Electron environment' };

      const result = await api.login(username, password);
      if (result.ok && result.data) {
        const { token, user } = result.data;
        setStoredToken(token);
        set({ token, user, isLoggedIn: true, loading: false });
        return { ok: true };
      }
      set({ loading: false });
      return { ok: false, error: result.error || '登录失败' };
    } catch (err: unknown) {
      set({ loading: false });
      const errorMessage = err instanceof Error ? err.message : '登录异常';
      return { ok: false, error: errorMessage || '登录异常' };
    }
  },

  logout: () => {
    setStoredToken(null);
    set({ token: null, user: null, isLoggedIn: false });
  },

  verifyToken: async () => {
    const token = get().token || getStoredToken();
    if (!token) return false;

    const api = window.electronAPI;
    if (!api) return false;

    try {
      const result = await api.verifyToken(token);
      if (result.ok && result.data) {
        set({ token, user: result.data.user, isLoggedIn: true });
        return true;
      }
      setStoredToken(null);
      set({ token: null, user: null, isLoggedIn: false });
      return false;
    } catch {
      return false;
    }
  },

  updateUser: (partial) => {
    const current = get().user;
    if (current) {
      set({ user: { ...current, ...partial } });
    }
  },

  changePassword: async (oldPwd, newPwd) => {
    const user = get().user;
    if (!user) return { ok: false, error: '未登录' };

    const api = window.electronAPI;
    if (!api) return { ok: false, error: 'Not in Electron environment' };

    try {
      const result = await api.changePassword({
        userId: user.id,
        oldPassword: oldPwd,
        newPassword: newPwd,
      });
      return result.ok ? { ok: true } : { ok: false, error: result.error || '修改失败' };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '修改失败';
      return { ok: false, error: errorMessage };
    }
  },

  restoreSession: async () => {
    const token = getStoredToken();
    if (!token) return false;
    set({ token, loading: true });
    const valid = await get().verifyToken();
    set({ loading: false });
    return valid;
  },
}));
