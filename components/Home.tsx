
import React, { useState, useEffect } from 'react';
import { 
  Mic, 
  Music, 
  Radio, 
  Crown, 
  BookOpen, 
  ShieldCheck, 
  Volume2, 
  Mic2, 
  Users, 
  Star, 
  Sparkles,
  Zap,
  PlayCircle,
  ArrowRight,
  Headphones,
  Sliders,
  FileText
} from 'lucide-react';
import { AppMode } from '../types';
import { getUserStatus, redeemCode, getFormatExpiryDate } from '../services/monetizationService';
import BluetoothConnect from './BluetoothConnect';
import FeedbackModal from './FeedbackModal';
import { auth } from '../services/firebase';

interface HomeProps {
  onSelectMode: (mode: AppMode) => void;
  userRole: 'user' | 'admin' | 'corporate-admin' | 'corporate-user';
  userEmail: string;
}

const Home: React.FC<HomeProps> = ({ onSelectMode, userRole, userEmail }) => {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<any>(() => ({
    plan: 'free',
    expiryDate: null,
    narrationsToday: 0
  }));
  const [redeemMsg, setRedeemMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const isAdmin = userRole === 'admin' || userRole === 'corporate-admin' || userEmail === 'limadan389@gmail.com' || !userEmail;

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const s = await getUserStatus(userEmail);
        if (isMounted && s) {
          setStatus(s);
        }
      } catch (err) {
        console.warn('[Home] Aviso ao carregar status:', err);
      }
    };
    fetchStatus();

    const handlePlanUpdated = async () => {
      const s = await getUserStatus(userEmail);
      if (isMounted && s) {
        setStatus(s);
      }
    };
    window.addEventListener('voxgen_plan_updated', handlePlanUpdated);

    return () => { 
      isMounted = false; 
      window.removeEventListener('voxgen_plan_updated', handlePlanUpdated);
    };
  }, [userEmail]);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    try {
      const result = await redeemCode(code.trim().toUpperCase(), userEmail);
      if (result.success) {
        setRedeemMsg({ type: 'success', text: result.message });
        const s = await getUserStatus(userEmail);
        if (s) setStatus(s);
        setCode('');
      } else {
        setRedeemMsg({ type: 'error', text: result.message });
      }
    } catch (e: any) {
      setRedeemMsg({ type: 'error', text: 'Falha ao processar código.' });
    }
    setTimeout(() => setRedeemMsg(null), 6000);
  };

  const isSuperAdmin = userEmail === 'limadan389@gmail.com';
  const isPremiumActive = status?.plan === 'premium' || isAdmin || isSuperAdmin;

  return (
    <div className="flex flex-col items-center justify-start min-h-[85vh] w-full max-w-7xl mx-auto px-4 py-6 animate-fade-in space-y-8">
      
      {/* Hero Banner VoxGen AI */}
      <div className="w-full rounded-3xl border border-indigo-500/30 bg-slate-900/80 backdrop-blur-xl p-6 md:p-10 relative overflow-hidden shadow-[0_0_50px_rgba(99,102,241,0.15)]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white px-3.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/30 flex items-center gap-1.5">
                <Sparkles size={13} /> VOXGEN AI STUDIO
              </span>
              <button 
                onClick={() => setIsFeedbackOpen(true)}
                className="flex items-center gap-1.5 text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
              >
                <Star size={12} fill="currentColor" className="text-indigo-400" /> Avaliar VoxGen 🏆
              </button>
            </div>

            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
              Sua Oficina Generativa Completa de <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">Áudio e Voz</span>
            </h1>

            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              Crie narrações profissionais, boletins jornalísticos por IA, dublagens expressivas, clonagens de voz idênticas, trilhas sonoras orquestradas e rádio inteligente – tudo em uma única plataforma integrada.
            </p>

            <div className="pt-2 flex flex-wrap gap-3">
              <button 
                onClick={() => onSelectMode(AppMode.Narration)}
                className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95"
              >
                <Mic size={18} /> Abrir Locutor & Roteiro <ArrowRight size={16} />
              </button>

              <button 
                onClick={() => onSelectMode(AppMode.SmartPlayer)}
                className="bg-slate-800/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all hover:scale-105 active:scale-95"
              >
                <Radio size={18} className="text-cyan-400" /> Abrir Smart Player 📻
              </button>

              {isAdmin && (
                <button 
                  onClick={() => onSelectMode(AppMode.Admin)}
                  className="bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 border border-purple-500/30 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all"
                >
                  <ShieldCheck size={16} className="text-purple-400" /> Painel Admin
                </button>
              )}
            </div>
          </div>

          {/* Card de Status de Assinatura & Cupom */}
          <div className="w-full md:w-80 bg-slate-950/90 border border-indigo-500/30 rounded-2xl p-5 backdrop-blur-md shadow-2xl relative overflow-hidden shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Crown size={20} className={isPremiumActive ? "text-amber-400 fill-amber-400" : "text-slate-400"} />
                <span className={`font-black uppercase tracking-wider text-xs ${isPremiumActive ? "text-amber-300" : "text-slate-300"}`}>
                  {isSuperAdmin ? "SUPER ADMIN (ILIMITADO)" : (isPremiumActive ? "MEMBRO VIP PREMIUM" : "PLANO GRATUITO")}
                </span>
              </div>
              {isPremiumActive && (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                  Sem Vinhetas
                </span>
              )}
            </div>

            <div className="text-xs text-indigo-200 font-bold bg-indigo-500/15 p-3 rounded-xl border border-indigo-500/20 mb-3">
              {isPremiumActive ? (
                <>Acesso Premium ativo até: <span className="text-white font-black">{getFormatExpiryDate(status?.expiryDate)}</span></>
              ) : (
                <span className="text-slate-300">Resgate um cupom para áudio sem anúncios e limites:</span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={code} 
                  onChange={(e) => setCode(e.target.value)} 
                  placeholder="CÓDIGO DE VOUCHER" 
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 flex-grow uppercase font-semibold transition-colors placeholder:text-slate-600" 
                />
                <button 
                  onClick={handleRedeem} 
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-black transition-all shadow-sm shrink-0"
                >
                  RESGATAR
                </button>
              </div>
              {redeemMsg && (
                <p className={`text-[10px] font-bold ${redeemMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {redeemMsg.text}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Conexão Bluetooth */}
      <div className="w-full">
        <BluetoothConnect />
      </div>

      {/* Grade Principal de Módulos do VoxGen AI */}
      <div className="w-full space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Zap size={20} className="text-indigo-400" /> Módulos Generativos VoxGen
          </h2>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            8 Ferramentas Ativas
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 w-full">
          
          {/* 1. Narração Inteligente */}
          <div 
            onClick={() => onSelectMode(AppMode.Narration)}
            className="group relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-slate-900/80 hover:bg-slate-900 transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer shadow-xl hover:border-indigo-500/60 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div>
              <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-5 border border-indigo-500/20 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all">
                <Mic size={28} className="text-indigo-400" />
              </div>
              <h3 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                Narração Inteligente 🎙️
                <ArrowRight size={16} className="text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed font-medium">
                Locuções humanizadas, boletins de rádio e diálogos entre vozes com expressividade ajustável.
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-indigo-400">
              <span>Roteiro & Vozes AI</span>
              <span className="bg-indigo-500/20 px-2 py-0.5 rounded-full text-[9px] uppercase">Ativo</span>
            </div>
          </div>

          {/* 2. Smart Radio Player */}
          <div 
            onClick={() => onSelectMode(AppMode.SmartPlayer)}
            className="group relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-slate-900/80 hover:bg-slate-900 transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer shadow-xl hover:border-cyan-500/60 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)] hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div>
              <div className="w-14 h-14 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-5 border border-cyan-500/20 group-hover:scale-110 group-hover:bg-cyan-500/20 transition-all">
                <Radio size={28} className="text-cyan-400" />
              </div>
              <h3 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                Smart Radio Player 📻
                <ArrowRight size={16} className="text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed font-medium">
                Rádio inteligente em tempo real com vinhetas, spots corporativos, YouTube e anúncios programados.
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-cyan-400">
              <span>Programação Auto</span>
              <span className="bg-cyan-500/20 px-2 py-0.5 rounded-full text-[9px] uppercase">Ativo</span>
            </div>
          </div>

          {/* 3. Estúdio de Trilhas */}
          <div 
            onClick={() => onSelectMode(AppMode.Music)}
            className="group relative overflow-hidden rounded-3xl border border-purple-500/30 bg-slate-900/80 hover:bg-slate-900 transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer shadow-xl hover:border-purple-500/60 hover:shadow-[0_0_30px_rgba(168,85,247,0.2)] hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div>
              <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-5 border border-purple-500/20 group-hover:scale-110 group-hover:bg-purple-500/20 transition-all">
                <Music size={28} className="text-purple-400" />
              </div>
              <h3 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                Estúdio de Trilhas 🎵
                <ArrowRight size={16} className="text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed font-medium">
                Gere fundos musicais e vinhetas sonoras por descrições de texto com instrumentação por IA.
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-purple-400">
              <span>Geração de Música</span>
              <span className="bg-purple-500/20 px-2 py-0.5 rounded-full text-[9px] uppercase">Ativo</span>
            </div>
          </div>

          {/* 4. Clonagem de Voz */}
          <div 
            onClick={() => onSelectMode(AppMode.VoiceCloning)}
            className="group relative overflow-hidden rounded-3xl border border-pink-500/30 bg-slate-900/80 hover:bg-slate-900 transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer shadow-xl hover:border-pink-500/60 hover:shadow-[0_0_30px_rgba(236,72,153,0.2)] hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div>
              <div className="w-14 h-14 bg-pink-500/10 rounded-2xl flex items-center justify-center mb-5 border border-pink-500/20 group-hover:scale-110 group-hover:bg-pink-500/20 transition-all">
                <Mic2 size={28} className="text-pink-400" />
              </div>
              <h3 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                Clonagem de Voz 🎤
                <ArrowRight size={16} className="text-slate-500 group-hover:text-pink-400 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed font-medium">
                Clone timbres de voz a partir de pequenos áudios de amostra e narre qualquer texto.
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-pink-400">
              <span>Vozes Personalizadas</span>
              <span className="bg-pink-500/20 px-2 py-0.5 rounded-full text-[9px] uppercase">Ativo</span>
            </div>
          </div>

          {/* 5. Avatar Falante */}
          <div 
            onClick={() => onSelectMode(AppMode.Avatar)}
            className="group relative overflow-hidden rounded-3xl border border-amber-500/30 bg-slate-900/80 hover:bg-slate-900 transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer shadow-xl hover:border-amber-500/60 hover:shadow-[0_0_30px_rgba(245,158,11,0.2)] hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div>
              <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-5 border border-amber-500/20 group-hover:scale-110 group-hover:bg-amber-500/20 transition-all">
                <Crown size={28} className="text-amber-400" />
              </div>
              <h3 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                Avatar Falante 👤
                <ArrowRight size={16} className="text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed font-medium">
                Apresente seus áudios com avatares visuais sincronizados com expressões labiais.
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-amber-400">
              <span>Animação de Voz</span>
              <span className="bg-amber-500/20 px-2 py-0.5 rounded-full text-[9px] uppercase">Ativo</span>
            </div>
          </div>

          {/* 6. Estúdio de Efeitos FX */}
          <div 
            onClick={() => onSelectMode(AppMode.SFX)}
            className="group relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-slate-900/80 hover:bg-slate-900 transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer shadow-xl hover:border-emerald-500/60 hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div>
              <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-5 border border-emerald-500/20 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all">
                <Volume2 size={28} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                Efeitos Sonoros FX 🔊
                <ArrowRight size={16} className="text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed font-medium">
                Crie foley, vinhetas, aplausos, multidão e efeitos de áudio realistas sob demanda.
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-emerald-400">
              <span>Sons Ambientes</span>
              <span className="bg-emerald-500/20 px-2 py-0.5 rounded-full text-[9px] uppercase">Ativo</span>
            </div>
          </div>

          {/* 7. Gibis Narrados */}
          <div 
            onClick={() => onSelectMode(AppMode.Manga)}
            className="group relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-slate-900/80 hover:bg-slate-900 transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer shadow-xl hover:border-indigo-500/60 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div>
              <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-5 border border-indigo-500/20 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all">
                <FileText size={28} className="text-indigo-400" />
              </div>
              <h3 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                Gibis & HQs Narrados 📖
                <ArrowRight size={16} className="text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed font-medium">
                Histórias em quadrinhos dinâmicas narradas em áudio e ilustradas passo a passo.
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-indigo-400">
              <span>Quadros Dramáticos</span>
              <span className="bg-indigo-500/20 px-2 py-0.5 rounded-full text-[9px] uppercase">Ativo</span>
            </div>
          </div>

          {/* 8. PDF Multimodal */}
          <div 
            onClick={() => onSelectMode(AppMode.PDFAudio)}
            className="group relative overflow-hidden rounded-3xl border border-rose-500/30 bg-slate-900/80 hover:bg-slate-900 transition-all duration-300 p-6 flex flex-col justify-between cursor-pointer shadow-xl hover:border-rose-500/60 hover:shadow-[0_0_30px_rgba(244,63,94,0.2)] hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div>
              <div className="w-14 h-14 bg-rose-500/10 rounded-2xl flex items-center justify-center mb-5 border border-rose-500/20 group-hover:scale-110 group-hover:bg-rose-500/20 transition-all">
                <BookOpen size={28} className="text-rose-400" />
              </div>
              <h3 className="text-lg font-black text-white mb-2 flex items-center justify-between">
                PDF Multimodal 📄
                <ArrowRight size={16} className="text-slate-500 group-hover:text-rose-400 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed font-medium">
                Extraia textos e resumos de documentos PDF e escute tudo com entonação perfeita.
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-bold text-rose-400">
              <span>Leitura de Arquivos</span>
              <span className="bg-rose-500/20 px-2 py-0.5 rounded-full text-[9px] uppercase">Ativo</span>
            </div>
          </div>

        </div>
      </div>

      <FeedbackModal 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
        userId={auth.currentUser?.uid || ''}
        userName={status?.name || userEmail.split('@')[0] || 'Usuário'}
        userEmail={userEmail}
      />
    </div>
  );
};

export default Home;

