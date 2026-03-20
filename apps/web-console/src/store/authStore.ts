import { create } from 'zustand';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';
const AUTH_BASE = import.meta.env.VITE_AUTH_URL || 'http://localhost:3001';

interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, tenantId: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (email: string, password: string, tenantId: string) => {
    const response = await axios.post(`${AUTH_BASE}/api/auth/login`, {
      email,
      password,
      tenantId
    });

    const { token, user } = response.data;
    localStorage.setItem('token', token);
    set({ token, user, isAuthenticated: true });

    // Set default auth header
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  },

  logout: () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    set({ token: null, user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ token: null, user: null, isAuthenticated: false });
      return;
    }

    try {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await axios.get(`${AUTH_BASE}/api/auth/me`);
      set({ user: response.data, isAuthenticated: true });
    } catch {
      get().logout();
    }
  }
}));
