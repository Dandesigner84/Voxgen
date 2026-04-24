
import React, { useState } from 'react';
import { Mail, ArrowRight, ShieldCheck, User, CheckCircle, ArrowLeft, Loader2, Key, AlertCircle } from 'lucide-react';
import { UserRole } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../services/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface LoginProps {
  onLogin: (role: UserRole, email: string) => void;
}

type AuthStep = 'login' | 'register';

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [step, setStep] = useState<AuthStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Sync user to Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        const role: UserRole = (user.email === 'limadan389@gmail.com') ? 'admin' : 'user';
        await setDoc(userDocRef, {
          email: user.email,
          name: user.displayName,
          role: role,
          plan: 'free',
          narrationsToday: 0,
          createdAt: Date.now()
        });
        onLogin(role, user.email || '');
      } else {
        onLogin(userDoc.data().role as UserRole, user.email || '');
      }
    } catch (err: any) {
      console.error('[Firebase Auth Error]', err);
      setError('Erro ao iniciar login com Google: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
        setError('Preencha email e senha.');
        return;
    }
    setLoading(true);
    setError('');
    
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        onLogin(userDoc.data().role as UserRole, user.email || '');
      } else {
        onLogin('user', user.email || '');
      }
    } catch (err: any) {
      setError('Falha no login: ' + (err.message || 'Verifique suas credenciais.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword || !name) {
        setError('Preencha todos os campos.');
        return;
    }
    if (password !== confirmPassword) {
        setError('As senhas não coincidem.');
        return;
    }
    setLoading(true);
    setError('');
    
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const user = result.user;
      
      await updateProfile(user, { displayName: name });
      
      const role: UserRole = (email === 'limadan389@gmail.com') ? 'admin' : 'user';
      await setDoc(doc(db, 'users', user.uid), {
        email: email,
        name: name,
        role: role,
        plan: 'free',
        narrationsToday: 0,
        createdAt: Date.now()
      });
      
      onLogin(role, email);
    } catch (err: any) {
      setError('Falha no cadastro: ' + (err.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

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
                  <p className="text-slate-400 text-sm">Acesse o Banco de Dados VoxGen</p>
                </div>

                <div className="space-y-4">
                    <button 
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 border bg-white hover:bg-slate-50 text-slate-900 border-slate-200"
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
                                Entrar com Google
                            </>
                        )}
                    </button>

                    <div className="relative flex py-4 items-center">
                        <div className="flex-grow border-t border-slate-800"></div>
                        <span className="flex-shrink-0 mx-4 text-slate-600 text-[10px] uppercase font-bold tracking-widest text-center">Ou E-mail</span>
                        <div className="flex-grow border-t border-slate-800"></div>
                    </div>

                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-white outline-none focus:border-indigo-500 transition-colors" />
                        </div>
                        <div className="relative">
                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha" className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-white outline-none focus:border-indigo-500 transition-colors" />
                        </div>
                        <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
                             {loading ? <Loader2 className="animate-spin" /> : <>Entrar <ArrowRight size={18} /></>}
                        </button>
                    </form>

                    <div className="pt-2 text-center text-xs text-slate-400">
                        Ainda não tem conta?{' '}
                        <button 
                            onClick={() => {
                                setStep('register');
                                setError('');
                            }} 
                            className="text-indigo-400 font-bold hover:underline"
                        >
                            Cadastre-se agora
                        </button>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-xs text-center border border-red-500/20 flex items-center justify-center gap-2">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                </div>
            </>
        )}

        {step === 'register' && (
            <>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">Criar Nova Conta</h2>
                  <p className="text-slate-400 text-sm">Acesso integrado ao Cloud Database</p>
                </div>

                <form onSubmit={handleRegisterSubmit} className="space-y-4 text-left">
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold ml-1 mb-1 block">Nome Completo</label>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input 
                                type="text" 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                placeholder="Seu nome" 
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-white outline-none focus:border-indigo-500 transition-colors" 
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold ml-1 mb-1 block">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input 
                                type="email" 
                                value={email} 
                                onChange={e => setEmail(e.target.value)} 
                                placeholder="email@exemplo.com" 
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-white outline-none focus:border-indigo-500 transition-colors" 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase font-bold ml-1 mb-1 block">Senha</label>
                            <div className="relative">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input 
                                    type="password" 
                                    value={password} 
                                    onChange={e => setPassword(e.target.value)} 
                                    placeholder="••••••" 
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-white outline-none focus:border-indigo-500 transition-colors text-sm" 
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase font-bold ml-1 mb-1 block">Confirmar</label>
                            <div className="relative">
                                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input 
                                    type="password" 
                                    value={confirmPassword} 
                                    onChange={e => setConfirmPassword(e.target.value)} 
                                    placeholder="••••••" 
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-white outline-none focus:border-indigo-500 transition-colors text-sm" 
                                />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-xs text-center border border-red-500/20 flex items-center justify-center gap-2">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={loading} 
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 mt-4"
                    >
                         {loading ? <Loader2 className="animate-spin" /> : <><UserPlus size={18} /> Finalizar Cadastro</>}
                    </button>

                    <button 
                        type="button"
                        onClick={() => {
                            setStep('login');
                            setError('');
                        }} 
                        className="w-full py-2 text-slate-400 hover:text-white text-xs font-medium flex items-center justify-center gap-2"
                    >
                        <ArrowLeft size={14} /> Voltar para o login
                    </button>
                </form>
            </>
        )}
      </div>
    </div>
  );
};

export default Login;
