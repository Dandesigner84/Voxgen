
import React, { useState, useEffect } from 'react';
import { Mic, Music, Radio, Crown, Check, BookOpen, ShieldCheck, Volume2, Mic2, Users, Gift, Star, Sparkles } from 'lucide-react';
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
  const [status, setStatus] = useState<any>(null);
  const [redeemMsg, setRedeemMsg] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const isCorpTeam = userRole === 'corporate-user';
  const isAdmin = userRole === 'admin';

  const refreshStatus = async () => {
    const s = await getUserStatus(userEmail);
    setStatus(s);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshStatus();
    }, 0);
    return () => clearTimeout(timer);
  }, [userEmail]);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    const result = await redeemCode(code.trim().toUpperCase(), userEmail);
    if (result.success) {
      setRedeemMsg({ type: 'success', text: result.message });
      refreshStatus();
      setCode('');
    } else {
      setRedeemMsg({ type: 'error', text: result.message });
    }
    setTimeout(() => setRedeemMsg(null), 5000);
  };

  if (!status) return <div className="min-h-screen flex items-center justify-center text-slate-500 font-bold">Carregando VoxGen...</div>;

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full animate-fade-in px-4 py-8">
      
      {/* Abstract AI Tech Header Card */}
      <div className="w-full max-w-4xl rounded-3xl overflow-hidden border border-indigo-500/20 bg-[#0f172a]/40 backdrop-blur-md p-8 md:p-10 mb-10 relative group shadow-[0_0_50px_rgba(99,102,241,0.1)]">
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
              <span className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1.5 w-max">
                 ✨ VOXGEN AI PREMIUM
              </span>
              <h2 className="text-2xl md:text-4xl font-black text-white mt-4 tracking-tight">Oficina Generativa Completa de Áudio</h2>
              <p className="text-slate-300 text-sm md:text-base mt-2 max-w-2xl">
                 Crie narrações com vozes humanizadas, dublagens expressivas, clonagens vocais idênticas, trilhas sonoras orquestradas e efeitos especiais – tudo orquestrado por modelos de inteligência artificial de ponta.
              </p>
          </div>
      </div>

      <div className="w-full max-w-4xl flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
        <div className="text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-end gap-3 mb-2">
                <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 tracking-tight drop-shadow-md">
                VoxGen AI
                </h1>
                <button 
                  onClick={() => setIsFeedbackOpen(true)}
                  className="flex items-center justify-center gap-2 text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white hover:scale-105 transition-all mb-2 md:mb-1 self-center md:self-auto shadow-md"
                >
                  <Star size={12} fill="currentColor" className="text-indigo-400" /> Avaliar VoxGen 🏆
                </button>
            </div>
            <p className="text-slate-300 text-lg mt-2 font-medium tracking-wide">
            Sua oficina avançada de som baseada em Inteligência Artificial.
            </p>
            
            {userRole === 'admin' && (
                <button onClick={() => onSelectMode(AppMode.Admin)} className="mt-4 inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 px-4 py-2 rounded-full text-sm font-black hover:bg-indigo-600 hover:text-white transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                    <ShieldCheck size={16} className="text-indigo-400" /> Painel de Administração Geral
                </button>
            )}

            <div className="mt-6 flex flex-wrap gap-4">
                <button 
                    onClick={() => alert("Módulo de Equipe em breve!")} 
                    className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/30 text-white px-6 py-3 rounded-2xl font-black hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all hover:-translate-y-1 active:scale-95 shadow-md"
                >
                    <div className="bg-white/20 p-1.5 rounded-lg group-hover:rotate-12 transition-transform">
                        <Users size={20} />
                    </div>
                    <div className="text-left">
                        <div className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest leading-none mb-1">Corporativo</div>
                        <div className="text-sm">Cadastrar Equipe</div>
                    </div>
                </button>
                
                <button 
                    onClick={() => alert("Upgrade para Plano Ilimitado em breve!")} 
                    className="group flex items-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 px-6 py-3 rounded-2xl font-black hover:shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all hover:-translate-y-1 active:scale-95 shadow-md"
                >
                    <div className="bg-white/10 p-1.5 rounded-lg group-hover:rotate-12 transition-transform">
                        <Sparkles size={20} className="text-indigo-400" />
                    </div>
                    <div className="text-left">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-1">Acesso VIP</div>
                        <div className="text-sm">Plano Ilimitado</div>
                    </div>
                </button>
            </div>
        </div>

        <div className="bg-slate-950/90 border border-indigo-500/30 rounded-2xl p-5 min-w-[310px] backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.4)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-tr from-transparent to-cyan-500/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {status.plan === 'premium' ? (
                        <Crown size={20} className="text-indigo-400 fill-indigo-400" />
                    ) : (
                        <Star size={20} className="text-slate-500" />
                    )}
                    <span className={`font-black uppercase tracking-wider text-sm ${status.plan === 'premium' ? 'text-indigo-400' : 'text-slate-400'}`}>
                        {status.plan === 'premium' ? '🏆 MEMBRO VIP PREMIUM' : '🥈 PLANO DE ACESSO GRÁTIS'}
                    </span>
                </div>
            </div>
            
            {status.plan === 'premium' ? (
                <div className="text-xs text-indigo-300 font-bold bg-indigo-500/15 p-2.5 rounded-lg border border-indigo-500/20">
                    Acesso ilimitado até: <span className="text-white font-black">{getFormatExpiryDate(status.expiryDate)}</span>
                </div>
            ) : (
                <div className="text-xs text-slate-300 mb-2">
                    Locuções realizadas hoje: <span className="text-indigo-400 font-extrabold">{status.narrationsToday}/3</span>
                </div>
            )}

            {!isCorpTeam && (
                <div className="mt-4 flex gap-2">
                    <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="INSERIR VOUCHER" className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 flex-grow uppercase font-semibold transition-colors" />
                    <button onClick={handleRedeem} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-black transition-colors shadow-sm">
                        RESGATAR
                    </button>
                </div>
            )}
            {redeemMsg && <p className={`text-[10px] mt-2 font-bold ${redeemMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{redeemMsg.text}</p>}
        </div>
      </div>
      
      <div className="w-full max-w-4xl mb-12">
        <BluetoothConnect />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full">
        <button 
          onClick={() => (isAdmin || userRole === 'corporate-admin') ? onSelectMode(AppMode.Narration) : alert("Módulo em construção para usuários VIP.")} 
          className={`group relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-slate-900/60 hover:bg-slate-900/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${(userRole === 'user' || userRole === 'corporate-user') && !isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-indigo-500/50 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {(userRole === 'user' || userRole === 'corporate-user') && !isAdmin && (
            <div className="absolute top-4 right-4 bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVADO
            </div>
          )}
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/20 group-hover:scale-110 group-hover:bg-indigo-500/20 group-hover:border-indigo-400/40 transition-all">
            <Mic size={32} className="text-indigo-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2 flex items-center gap-1.5">Narração Inteligente 🎙️</h2>
          {(isAdmin || userRole === 'corporate-admin') ? (
            <p className="text-slate-300 text-xs font-semibold">Gere locuções profissionais e vibrantes com IA com expressividade avançada.</p>
          ) : (
            <p className="text-indigo-400 text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>

        {!isCorpTeam && (
            <button 
              onClick={() => isAdmin ? onSelectMode(AppMode.Music) : alert("Módulo em construção para usuários VIP.")} 
              className={`group relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-slate-900/60 hover:bg-slate-900/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-indigo-500/50 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)]'}`}
            >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {!isAdmin && (
              <div className="absolute top-4 right-4 bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
                RESERVADO
              </div>
            )}
            <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6 border border-cyan-500/20 group-hover:scale-110 group-hover:bg-cyan-500/20 group-hover:border-indigo-400/40 transition-all">
                <Music size={32} className="text-cyan-400 group-hover:text-indigo-400" />
            </div>
            <h2 className="text-xl font-black text-white mb-2 flex items-center gap-1.5">Estúdio de Trilhas 🎵</h2>
            {isAdmin ? (
              <p className="text-slate-300 text-xs font-semibold">Crie trilhas sonoras épicas e fundos musicais com descrições simples por IA.</p>
            ) : (
              <p className="text-indigo-400 text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
            )}
            </button>
        )}

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.VoiceCloning) : alert("Módulo em construção para usuários VIP.")} 
          className={`group relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-slate-900/60 hover:bg-slate-900/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-indigo-500/50 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVADO
            </div>
          )}
          <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6 border border-purple-500/20 group-hover:scale-110 group-hover:bg-purple-500/20 group-hover:border-indigo-400/40 transition-all">
            <Mic2 size={32} className="text-purple-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Clonagem de Voz 🎤</h2>
          {isAdmin ? (
            <p className="text-slate-300 text-xs font-semibold">Clone sua voz para narrar textos com expressividade natural e fidelidade absoluta.</p>
          ) : (
            <p className="text-indigo-400 text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>

        <button onClick={() => onSelectMode(AppMode.SmartPlayer)} className="group relative overflow-hidden rounded-3xl border border-indigo-500/30 bg-slate-950/80 hover:bg-slate-950 border-indigo-500/20 hover:border-indigo-500/50 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl shadow-[0_0_15px_rgba(99,102,241,0.05)]">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/25 group-hover:scale-110 transition-transform">
            <Radio size={32} className="text-indigo-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Smart Radio Player 📻</h2>
          <p className="text-slate-300 text-xs font-semibold">Rádio inteligente com playlists geradas, spots e anúncios simulados.</p>
        </button>

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.Avatar) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-slate-900/60 hover:bg-slate-900/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-indigo-500/50 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVADO
            </div>
          )}
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/20 group-hover:scale-110 group-hover:bg-indigo-500/25 transition-all">
            <Crown size={32} className="text-indigo-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Avatar Falante 👤</h2>
          {isAdmin ? (
            <p className="text-slate-300 text-xs font-semibold">Crie avatares virtuais expressivos para apresentar seus áudios visualmente.</p>
          ) : (
            <p className="text-indigo-400 text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.SFX) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-slate-900/60 hover:bg-slate-900/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-indigo-500/50 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVADO
            </div>
          )}
          <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-6 border border-cyan-500/20 group-hover:scale-110 transition-transform">
            <Volume2 size={32} className="text-cyan-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Estúdio de Efeitos FX 🔊</h2>
          {isAdmin ? (
            <p className="text-slate-300 text-xs font-semibold">Gere efeitos especiais sonoros realistas, sons ambientes e foley com IA.</p>
          ) : (
            <p className="text-indigo-400 text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.Manga) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-slate-900/60 hover:bg-slate-900/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-indigo-500/50 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVADO
            </div>
          )}
          <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6 border border-purple-500/20 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all">
            <Sparkles size={32} className="text-purple-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Gibis Narrados 📖</h2>
          {isAdmin ? (
            <p className="text-slate-300 text-xs font-semibold">Crie histórias em quadrinhos dinâmicas e narradas por IA.</p>
          ) : (
            <p className="text-indigo-400 text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.PDFAudio) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-slate-900/60 hover:bg-slate-900/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-indigo-500/50 hover:shadow-[0_0_25px_rgba(99,102,241,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVADO
            </div>
          )}
          <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mb-6 border border-rose-500/20 group-hover:scale-110 transition-transform">
            <BookOpen size={32} className="text-rose-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">PDF Multimodal 📄</h2>
          {isAdmin ? (
            <p className="text-slate-300 text-xs font-semibold">Leitura inteligente de documentos PDF em voz alta com fundos imersivos.</p>
          ) : (
            <p className="text-indigo-400 text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>
      </div>

      <FeedbackModal 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
        userId={auth.currentUser?.uid || ''}
        userName={status?.name || userEmail.split('@')[0]}
        userEmail={userEmail}
      />
    </div>
  );
};

export default Home;
