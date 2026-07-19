// src/auth/authService.ts
// This replaces the Firebase auth with our JWT-based auth

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthResponse {
  user: User;
  token: string;
  message: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002';

let authToken: string | null = localStorage.getItem('auth_token');
let currentUser: User | null = null;

// Load user from localStorage on init
const userStr = localStorage.getItem('auth_user');
if (userStr) {
  try {
    currentUser = JSON.parse(userStr);
  } catch {
    currentUser = null;
  }
}

export function getToken(): string | null {
  return authToken;
}

export function getCurrentUser(): User | null {
  return currentUser;
}

export function isAuthenticated(): boolean {
  return !!authToken && !!currentUser;
}

export async function login(email: string, password: string): Promise<User> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Login failed');
  }

  const data: AuthResponse = await response.json();
  authToken = data.token;
  currentUser = data.user;

  localStorage.setItem('auth_token', data.token);
  localStorage.setItem('auth_user', JSON.stringify(data.user));

  return data.user;
}

export async function register(email: string, password: string, name?: string): Promise<User> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Registration failed');
  }

  const data: AuthResponse = await response.json();
  authToken = data.token;
  currentUser = data.user;

  localStorage.setItem('auth_token', data.token);
  localStorage.setItem('auth_user', JSON.stringify(data.user));

  return data.user;
}

export function logout(): void {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
}

export async function getProfile(): Promise<User | null> {
  if (!authToken) return null;

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        logout();
        return null;
      }
      throw new Error('Failed to get profile');
    }

    const data = await response.json();
    currentUser = data.user;
    localStorage.setItem('auth_user', JSON.stringify(data.user));
    return data.user;
  } catch (error) {
    console.error('Failed to get user:', error);
    return null;
  }
}

// Export auth functions with a consistent API
export const auth = {
  login,
  register,
  logout,
  getToken,
  getCurrentUser,
  isAuthenticated,
  getProfile,
};

export default auth;