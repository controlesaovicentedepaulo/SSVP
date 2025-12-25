
import React, { useState } from 'react';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { signIn } from '../db';
import logoImage from '../assets/Logo.jpg';

interface AuthProps {
  onSuccess: (session: any) => void;
}

const Auth: React.FC<AuthProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await signIn(email, password);
      if (signInError) throw signInError;
      onSuccess(data.session);
    } catch (err: any) {
      setError(err.message || 'Erro na autenticação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 overflow-hidden border border-slate-100 animate-fade-in">
        <div className="p-10">
          <div className="flex flex-col items-center mb-10 text-center">
            <img 
              src={logoImage} 
              alt="SSVP Logo" 
              className="w-24 h-24 md:w-28 md:h-28 object-contain mb-4"
            />
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">SSVP Brasil</h1>
            <p className="text-sm text-slate-500 font-medium">Sociedade de São Vicente de Paulo</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
              <input 
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ssvp-input"
                placeholder="vicentino@email.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Senha</label>
              <input 
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ssvp-input"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full ssvp-btn-primary mt-6 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  Entrar no Sistema
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            <ShieldCheck size={14} className="text-emerald-500" /> Sistema Seguro SSVP
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
