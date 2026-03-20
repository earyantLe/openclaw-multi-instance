import { create } from 'zustand';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export interface Instance {
  id: string;
  tenantId: string;
  name: string;
  profile: string;
  port: number;
  workspace?: string;
  status: 'stopped' | 'running' | 'error' | 'starting' | 'stopping';
  pid?: number;
  config?: Record<string, any>;
  lastStartedAt?: Date;
  lastStoppedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface InstanceState {
  instances: Instance[];
  loading: boolean;
  error: string | null;
  fetchInstances: () => Promise<void>;
  createInstance: (data: { name: string; port?: number; workspace?: string }) => Promise<Instance>;
  startInstance: (id: string) => Promise<void>;
  stopInstance: (id: string) => Promise<void>;
  restartInstance: (id: string) => Promise<void>;
  deleteInstance: (id: string) => Promise<void>;
  refreshInstance: (id: string) => Promise<void>;
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  loading: false,
  error: null,

  fetchInstances: async () => {
    set({ loading: true, error: null });
    try {
      const response = await axios.get(`${API_BASE}/api/instances`);
      set({ instances: response.data, loading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to fetch instances', loading: false });
    }
  },

  createInstance: async (data) => {
    set({ loading: true, error: null });
    try {
      const response = await axios.post(`${API_BASE}/api/instances`, data);
      set((state) => ({
        instances: [...state.instances, response.data],
        loading: false
      }));
      return response.data;
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to create instance', loading: false });
      throw error;
    }
  },

  startInstance: async (id) => {
    try {
      await axios.post(`${API_BASE}/api/instances/${id}/start`);
      get().refreshInstance(id);
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to start instance' });
      throw error;
    }
  },

  stopInstance: async (id) => {
    try {
      await axios.post(`${API_BASE}/api/instances/${id}/stop`);
      get().refreshInstance(id);
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to stop instance' });
      throw error;
    }
  },

  restartInstance: async (id) => {
    try {
      await axios.post(`${API_BASE}/api/instances/${id}/restart`);
      get().refreshInstance(id);
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to restart instance' });
      throw error;
    }
  },

  deleteInstance: async (id) => {
    try {
      await axios.delete(`${API_BASE}/api/instances/${id}`);
      set((state) => ({
        instances: state.instances.filter((i) => i.id !== id)
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to delete instance' });
      throw error;
    }
  },

  refreshInstance: async (id) => {
    try {
      const response = await axios.get(`${API_BASE}/api/instances/${id}`);
      set((state) => ({
        instances: state.instances.map((i) => (i.id === id ? response.data : i))
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to refresh instance' });
    }
  }
}));
