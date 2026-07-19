import { useState, useEffect } from 'react';
import { loginUser, registerUser, logoutUser, getAuthToken, isAuthenticated } from '../../services/api';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { X } from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountModal({ isOpen, onClose }: AccountModalProps) {
  const authUser = useWorkspaceStore((state) => state.authUser);
  const setAuthUser = useWorkspaceStore((state) => state.setAuthUser);

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check auth status on mount and when modal opens
  useEffect(() => {
    if (isOpen) {
      // Check if user is already logged in
      const token = getAuthToken();
      const storedUser = localStorage.getItem('auth_user');
      
      if (token && storedUser) {
        try {
          const user = JSON.parse(storedUser);
          setAuthUser({
            uid: user.id || user.uid,
            email: user.email,
            displayName: user.name || user.displayName,
          });
        } catch (e) {
          console.error('Failed to parse stored user:', e);
        }
      }
    }
  }, [isOpen, setAuthUser]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleAuth = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      let user;
      if (mode === 'signup') {
        // Validate password length
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters');
        }
        user = await registerUser(email, password, displayName || undefined);
        setSuccess('Account created successfully!');
      } else {
        user = await loginUser(email, password);
        setSuccess('Welcome back!');
      }

      // Update the store with user info
      setAuthUser({
        uid: user.id,
        email: user.email,
        displayName: user.name,
      });

      // Store user in localStorage for persistence
      localStorage.setItem('auth_user', JSON.stringify(user));

      // Don't close immediately - let user see success message
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      setError((err as Error).message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      logoutUser();
      setAuthUser(null);
      localStorage.removeItem('auth_user');
      setSuccess('Logged out successfully');
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setError((err as Error).message || 'Logout failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" 
      onClick={handleClose}
    >
      <div 
        className="w-full max-w-md rounded-2xl border border-[#1e293b] bg-[#0f1322] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e293b]">
          <div>
            <h2 className="text-sm font-semibold text-white">Account</h2>
            <p className="text-[11px] text-slate-400">
              {authUser ? 'Manage your account' : 'Sign up or log in to save your workspace.'}
            </p>
          </div>
          <button 
            onClick={handleClose} 
            className="p-2 rounded hover:bg-[#1a2035] transition"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {success && (
            <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300 border border-emerald-500/20">
              {success}
            </div>
          )}

          {authUser ? (
            <div className="rounded-xl border border-[#1e293b] bg-[#111625] p-4">
              <p className="text-[11px] text-slate-500">Logged in as</p>
              <p className="text-sm text-white font-medium">
                {authUser.displayName || authUser.email || authUser.uid}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">{authUser.email}</p>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="mt-4 w-full rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-500 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm transition ${
                    mode === 'login' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-[#111625] text-slate-300 hover:bg-[#1a2035]'
                  }`}
                >
                  Log in
                </button>
                <button
                  onClick={() => { setMode('signup'); setError(null); setSuccess(null); }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm transition ${
                    mode === 'signup' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-[#111625] text-slate-300 hover:bg-[#1a2035]'
                  }`}
                >
                  Create account
                </button>
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="text-[11px] text-slate-400">Display Name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#1e293b] bg-[#111625] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                    placeholder="Optional"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] text-slate-400">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#1e293b] bg-[#111625] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  placeholder="you@example.com"
                  type="email"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400">Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#1e293b] bg-[#111625] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                  placeholder={mode === 'signup' ? 'Min 8 characters' : 'Enter your password'}
                  type="password"
                  minLength={8}
                />
                {mode === 'signup' && password.length > 0 && password.length < 8 && (
                  <p className="text-[10px] text-red-400 mt-1">Password must be at least 8 characters</p>
                )}
              </div>

              {error && (
                <div className="rounded-md bg-red-500/10 px-3 py-2 text-[11px] text-red-300 border border-red-500/20">
                  {error}
                </div>
              )}

              <button
                onClick={handleAuth}
                disabled={
                  loading || 
                  !email || 
                  !password || 
                  (mode === 'signup' && password.length < 8)
                }
                className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Processing...' : mode === 'login' ? 'Log in' : 'Create account'}
              </button>

              {mode === 'login' && (
                <button
                  onClick={() => {
                    setEmail('admin@example.com');
                    setPassword('admin123');
                  }}
                  className="w-full text-[10px] text-slate-500 hover:text-slate-300 transition text-center"
                >
                  ⚡ Quick login as admin (for testing)
                </button>
              )}

              {mode === 'signup' && (
                <p className="text-[10px] text-slate-500 text-center">
                  By creating an account, you agree to our Terms of Service
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}