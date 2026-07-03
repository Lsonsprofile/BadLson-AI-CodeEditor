import { useState } from 'react';
import { signUp, logIn, logOut } from '../../firebase/auth';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { X } from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountModal({ isOpen, onClose }: AccountModalProps) {
  const authUser = useWorkspaceStore((state) => state.authUser);
  const setAuthUser = useWorkspaceStore((state) => state.setAuthUser);

  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleAuth = async () => {
    setError(null);
    setLoading(true);

    try {
      const user = mode === 'signup'
        ? await signUp(email, password, displayName || undefined)
        : await logIn(email, password);

      setAuthUser({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });
      handleClose();
    } catch (err) {
      setError((err as Error).message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setError(null);

    try {
      await logOut();
      setAuthUser(null);
      handleClose();
    } catch (err) {
      setError((err as Error).message || 'Logout failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#1e293b] bg-[#0f1322] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e293b]">
          <div>
            <h2 className="text-sm font-semibold text-white">Account</h2>
            <p className="text-[11px] text-slate-400">Sign up or log in to save your workspace.</p>
          </div>
          <button onClick={handleClose} className="p-2 rounded hover:bg-[#1a2035] transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {authUser ? (
            <div className="rounded-xl border border-[#1e293b] bg-[#111625] p-4">
              <p className="text-[11px] text-slate-500">Logged in as</p>
              <p className="text-sm text-white font-medium">{authUser.displayName || authUser.email || authUser.uid}</p>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="mt-4 w-full rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-500 transition"
              >
                {loading ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  onClick={() => { setMode('signup'); setError(null); }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm transition ${mode === 'signup' ? 'bg-indigo-600 text-white' : 'bg-[#111625] text-slate-300 hover:bg-[#1a2035]'}`}
                >
                  Create account
                </button>
                <button
                  onClick={() => { setMode('login'); setError(null); }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm transition ${mode === 'login' ? 'bg-indigo-600 text-white' : 'bg-[#111625] text-slate-300 hover:bg-[#1a2035]'}`}
                >
                  Log in
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
                  placeholder="Password"
                  type="password"
                />
              </div>

              {error && <div className="rounded-md bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</div>}

              <button
                onClick={handleAuth}
                disabled={loading || !email || !password}
                className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Saving...' : mode === 'signup' ? 'Create account' : 'Log in'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
