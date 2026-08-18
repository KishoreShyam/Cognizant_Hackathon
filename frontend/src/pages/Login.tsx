import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth } from '../firebase';
import { Mail, Lock, Loader2, KeyRound } from 'lucide-react';

const Login: React.FC = () => {
  const [isReset, setIsReset] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isReset) {
        await sendPasswordResetEmail(auth, email);
        setMessage('Password reset instructions sent to your email.');
        setIsReset(false);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      let errMsg = 'Authentication failed. Please verify your credentials.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        errMsg = 'Invalid email or password.';
      } else if (err.code === 'auth/wrong-password') {
        errMsg = 'Incorrect password.';
      } else if (err.code === 'auth/invalid-email') {
        errMsg = 'Invalid email address format.';
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 px-4">
      {/* Background Decorative Blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -z-10 animate-pulse delay-1000"></div>

      <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-8 border border-slate-200/50 flex flex-col gap-6">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <img 
            src="/logo.jpg" 
            alt="CareSync Logo" 
            className="w-12 h-12 rounded-2xl shadow-lg object-cover border border-slate-100" 
          />
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">CareSync SDOH Portal</h1>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">
              {isReset ? 'Reset Password' : 'Secure Admin Login'}
            </p>
          </div>
        </div>

        {/* Notices */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-center">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl text-center">
            {message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary font-medium text-slate-800 transition-colors"
                placeholder="admin@healthmetrics.com"
              />
            </div>
          </div>

          {!isReset && (
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-primary font-medium text-slate-800 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/95 hover:to-indigo-700 disabled:from-primary/50 disabled:to-indigo-500/50 text-white text-xs font-black rounded-xl cursor-pointer shadow-md shadow-primary/10 uppercase tracking-wider flex items-center justify-center gap-2 mt-2 transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Processing...
              </>
            ) : isReset ? (
              <>
                <KeyRound className="w-4 h-4" /> Send Recovery Link
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Toggles */}
        <div className="flex flex-col gap-2.5 text-center mt-2 border-t border-slate-100 pt-4">
          {!isReset ? (
            <button
              type="button"
              onClick={() => {
                setIsReset(true);
                setError('');
                setMessage('');
              }}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              Forgot Password?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsReset(false);
                setError('');
                setMessage('');
              }}
              className="text-xs font-extrabold text-primary hover:text-indigo-600 transition-colors cursor-pointer"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
