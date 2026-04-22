
import React, { useState } from 'react';
import { Mail, Lock, LogIn, UserPlus, ArrowRight, ShieldCheck, Github, Building2, Briefcase, User, CheckCircle, ArrowLeft, Loader2, FileText, Globe, Key, AlertCircle } from 'lucide-react';
import { UserRole } from '../types';
import { signInWithGoogle } from '../services/supabase';

interface LoginProps {
  onLogin: (role: UserRole, email: string) => void;
}

type AuthStep = 'login' | 'register_data';

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [step, setStep] = useState<AuthStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      // Supabase redirect handles the rest, App.tsx listener will catch it
    } catch (err: any) {
      setError('Erro ao iniciar login com Google: ' + err.message);
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('Login manual desativado. Use o Google.');
  };

  const isConfigMissing = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_URL === 'your-project-url.supabase.co';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-cyan-600/20 rounded-full blur-[128px]" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 backdrop-blur-xl rounded-3xl shadow-2xl p-8 relative z-10 animate-fade-in text-center">
        
        {step === 'login' && (
            <>
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 tracking-tight mb-2">
                    VoxGen AI
                  </h1>
                  <p className="text-slate-400 text-sm">Crie narrações e clones de voz profissionais</p>
                </div>

                {isConfigMissing && (
                    <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-left">
                        <div className="flex items-center gap-2 text-amber-500 font-bold text-xs mb-1">
                            <AlertCircle size={14} /> Configuração Pendente
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                            As chaves do Supabase (VITE_SUPABASE_URL/ANON_KEY) não foram encontradas. 
                            <b> Configure-as no painel da Vercel ou AI Studio</b> para habilitar o login.
                        </p>
                    </div>
                )}

                <div className="space-y-4">
                    <button 
                        onClick={handleGoogleLogin}
                        disabled={loading || isConfigMissing}
                        className={`w-full font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 border ${isConfigMissing ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200'}`}
                    >
                        {loading ? (
                            <Loader2 className="animate-spin text-indigo-500" />
                        ) : (
                            <>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.47 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Continuar com Google
                            </>
                        )}
                    </button>

                    <div className="relative flex py-4 items-center">
                        <div className="flex-grow border-t border-slate-800"></div>
                        <span className="flex-shrink-0 mx-4 text-slate-600 text-[10px] uppercase font-bold tracking-widest text-center">Seguro & Criptografado</span>
                        <div className="flex-grow border-t border-slate-800"></div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-xs text-center border border-red-500/20 flex items-center justify-center gap-2">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                </div>

                <p className="mt-8 text-center text-[10px] text-slate-500 leading-relaxed max-w-[280px] mx-auto">
                    Ao entrar, você concorda com nossos <span className="text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer">Termos de Serviço</span> e <span className="text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer">Política de Privacidade</span>.
                </p>
            </>
        )}
      </div>
    </div>
  );
};

export default Login;
