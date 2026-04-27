
import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  Phone, 
  ChevronRight,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { UserRole } from '../types';
import { auth, db } from '../services/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface LoginProps {
  onLogin: (role: UserRole, email: string) => void;
}

type LoginStep = 'method_select' | 'phone_entry' | 'code_entry';

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [step, setStep] = useState<LoginStep>('method_select');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    let interval: any;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const syncUserToFirestore = async (user: any) => {
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      const role: UserRole = (user.email === 'limadan389@gmail.com') ? 'admin' : 'user';
      await setDoc(userDocRef, {
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        name: user.displayName || 'Usuário',
        role: role,
        plan: 'free',
        narrationsToday: 0,
        createdAt: Date.now()
      });
      return role;
    } else {
      return userDoc.data().role as UserRole;
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const role = await syncUserToFirestore(result.user);
      onLogin(role, result.user.email || result.user.phoneNumber || '');
    } catch (err: any) {
      console.error('[Firebase Auth Error]', err);
      let msg = err.message || 'Erro desconhecido';
      if (err.code === 'auth/unauthorized-domain') {
        msg = 'Domínio não autorizado. Adicione no console do Firebase.';
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = 'Login com Google não ativado.';
      }
      setError('Erro no login com Google: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const setupRecaptcha = () => {
    if ((window as any).recaptchaVerifier) return (window as any).recaptchaVerifier;
    
    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible'
    });
    (window as any).recaptchaVerifier = verifier;
    return verifier;
  };

  const handleSendCode = async () => {
    if (!phoneNumber) {
      setError('Por favor, insira o número de telefone.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const verifier = setupRecaptcha();
      // Format number if needed (assuming international format or Brazil +55)
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+55' + formattedPhone.replace(/\D/g, '');
      }

      const result = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(result);
      setStep('code_entry');
      setResendTimer(60);
    } catch (err: any) {
      console.error('[Phone Auth Error]', err);
      setError('Erro ao enviar código: ' + (err.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || !confirmationResult) return;

    setLoading(true);
    setError('');
    try {
      const result = await confirmationResult.confirm(verificationCode);
      const role = await syncUserToFirestore(result.user);
      onLogin(role, result.user.phoneNumber || '');
    } catch (err: any) {
      console.error('[Verify Code Error]', err);
      setError('Código inválido ou expirado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-cyan-600/20 rounded-full blur-[128px]" />

      <div id="recaptcha-container"></div>

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 backdrop-blur-xl rounded-3xl shadow-2xl p-8 relative z-10 animate-fade-in">
        
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 tracking-tighter mb-2">
            VoxGen AI
          </h1>
          <p className="text-slate-400 text-sm font-medium">Banco de Dados VoxGen</p>
        </div>

        {step === 'method_select' && (
          <div className="space-y-4">
            <button 
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full group font-bold py-4 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 border bg-white hover:bg-slate-50 text-slate-900 border-slate-200"
            >
              {loading ? (
                <Loader2 className="animate-spin text-indigo-500" />
              ) : (
                <>
                  <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.47 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Login com Google
                </>
              )}
            </button>

            <button 
              onClick={() => setStep('phone_entry')}
              disabled={loading}
              className="w-full group font-bold py-4 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white border border-indigo-500/30"
            >
              <Phone size={20} className="group-hover:scale-110 transition-transform" />
              Login com Telefone
            </button>
          </div>
        )}

        {step === 'phone_entry' && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-4 mb-2">
              <button 
                onClick={() => setStep('method_select')}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400"
              >
                <ChevronRight className="rotate-180" size={24} />
              </button>
              <h2 className="text-xl font-bold text-white">Login por Telefone</h2>
            </div>

            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center border-r border-slate-700 pr-3 mr-3 h-6">
                  <span className="text-slate-400 font-bold">+55</span>
                </div>
                <input 
                  type="tel" 
                  value={phoneNumber} 
                  onChange={e => setPhoneNumber(e.target.value)} 
                  placeholder="(00) 00000-0000" 
                  disabled={loading}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl py-4 pl-20 pr-4 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600" 
                />
              </div>
              
              <button 
                onClick={handleSendCode}
                disabled={loading || !phoneNumber}
                className="w-full bg-white hover:bg-slate-50 text-slate-900 font-bold py-4 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <>Continuar <ArrowRight size={18} /></>}
              </button>
              
              <p className="text-[10px] text-slate-500 text-center px-4 leading-relaxed">
                Ao continuar, você poderá receber um SMS de verificação. Tarifas de mensagens e dados podem ser aplicadas.
              </p>
            </div>
          </div>
        )}

        {step === 'code_entry' && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                <ShieldCheck className="text-indigo-400" size={32} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Verifique seu Telefone</h2>
              <p className="text-slate-400 text-sm">Insira o código de 6 dígitos enviado para seu número</p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  maxLength={6}
                  value={verificationCode} 
                  onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))} 
                  placeholder="000000" 
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl py-5 text-center text-3xl font-black tracking-[1em] text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-700" 
                />
              </div>
              
              <button 
                onClick={handleVerifyCode}
                disabled={loading || verificationCode.length !== 6}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={20} /> Verificar Código</>}
              </button>

              <div className="text-center pt-2">
                {resendTimer > 0 ? (
                  <p className="text-xs text-slate-500">Reenviar código em {resendTimer}s</p>
                ) : (
                  <button 
                    onClick={handleSendCode}
                    className="text-xs text-indigo-400 font-bold hover:underline"
                  >
                    Não recebeu o código? Reenviar
                  </button>
                )}
              </div>
              
              <button 
                onClick={() => setStep('phone_entry')}
                className="w-full py-2 text-slate-500 hover:text-slate-400 text-xs font-medium flex items-center justify-center gap-2"
              >
                Alterar número de telefone
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 animate-in fade-in duration-300">
            <div className="bg-red-500/10 text-red-400 p-4 rounded-2xl text-xs text-center border border-red-500/20 flex items-center justify-center gap-3">
              <AlertCircle size={18} className="shrink-0" /> 
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
