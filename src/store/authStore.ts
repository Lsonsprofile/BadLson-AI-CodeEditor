// src/store/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  user: { uid: string; email: string | null; displayName: string | null } | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      isAuthenticated: false,
      user: null,

      login: async (password: string) => {
        try {
          console.log('🔐 Attempting login...');
          
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Invalid password');
          }

          const data = await response.json();
          console.log('✅ Login successful, token received:', !!data.token);

          // ✅ IMPORTANT: Save token to localStorage
          localStorage.setItem('auth_token', data.token);
          localStorage.setItem('auth_user', JSON.stringify(data.user));

          set({
            token: data.token,
            isAuthenticated: true,
            user: data.user,
          });

          // ✅ Verify it was saved
          console.log('🔑 Token in localStorage after save:', localStorage.getItem('auth_token'));

          return true;
        } catch (error) {
          console.error('Login error:', error);
          return false;
        }
      },

      logout: () => {
        console.log('🔐 Logging out...');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        set({
          token: null,
          isAuthenticated: false,
          user: null,
        });
      },

      checkAuth: async () => {
        // ✅ First check localStorage directly
        const token = localStorage.getItem('auth_token');
        const userStr = localStorage.getItem('auth_user');
        
        console.log('🔍 Checking auth - token exists?', !!token);
        
        if (!token) {
          set({ isAuthenticated: false, user: null, token: null });
          return false;
        }

        // Update state from localStorage
        try {
          const user = userStr ? JSON.parse(userStr) : null;
          set({
            token: token,
            isAuthenticated: true,
            user: user,
          });
          return true;
        } catch {
          set({ isAuthenticated: false, user: null, token: null });
          return false;
        }
      },
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
    }
  )
);