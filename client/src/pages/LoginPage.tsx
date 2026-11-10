import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../stores/authStore';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password);
      navigate('/', { replace: true });
    } catch {
      setError('Invalid password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-blue-500/15 rounded-2xl mb-4">
            <Mail className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-heading">QR Mailer</h1>
          <p className="text-sm text-dim mt-1">Email Marketing Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-line rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-subtle mb-1.5">Admin Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 bg-elevated border border-line rounded-lg text-heading placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[11px] text-dim mt-6">Mailgod · self-hosted email marketing</p>
      </div>
    </div>
  );
}
