import { create } from 'zustand';
import api from '../api/client';

interface AuthStore {
  token: string | null;
  isAuthenticated: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('qr-mailer-token');
}

export const useAuth = create<AuthStore>((set) => ({
  token: getStoredToken(),
  isAuthenticated: !!getStoredToken(),
  login: async (password: string) => {
    const { data } = await api.post('/auth/login', { password });
    localStorage.setItem('qr-mailer-token', data.token);
    set({ token: data.token, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('qr-mailer-token');
    set({ token: null, isAuthenticated: false });
  },
}));
