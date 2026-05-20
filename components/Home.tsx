
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
      
      {/* Banner da Copa do Mundo */}
      <div className="w-full max-w-4xl rounded-3xl overflow-hidden border border-[#FFDF00]/30 shadow-[0_0_35px_rgba(0,151,57,0.15)] mb-10 relative group bg-[#020d06]">
          <div className="absolute inset-0 bg-gradient-to-t from-[#020f08] via-[#020f08]/20 to-transparent z-10" />
          <img 
            src="/voxgen_copa_banner_1779318696684.png" 
            alt="Copa do Mundo VoxGen" 
            className="w-full h-48 sm:h-56 md:h-64 object-cover group-hover:scale-103 transition-transform duration-700 opacity-90"
            referrerPolicy="no-referrer"
          />
          <div className="absolute bottom-4 left-6 z-20">
              <span className="bg-[#FFDF00] text-[#002776] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1 w-max">
                 <span className="animate-bounce">⚽</span> EDIÇÃO COPA DO MUNDO
              </span>
              <h2 className="text-xl md:text-3xl font-black text-white mt-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">Oficina de Voz do Hexa! 🇧🇷</h2>
              <p className="text-slate-100 text-xs md:text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] opacity-95 mt-0.5 font-medium">Solte o grito de gol e refine suas locuções com a inteligência canarinho.</p>
          </div>
      </div>

      <div className="w-full max-w-4xl flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
        <div className="text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-end gap-3 mb-2">
                <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#009739] via-[#FFDF00] to-sky-400 tracking-tight drop-shadow-[0_4px_12px_rgba(0,151,57,0.25)]">
                VoxGen AI
                </h1>
                <button 
                  onClick={() => setIsFeedbackOpen(true)}
                  className="flex items-center justify-center gap-2 text-[#FFDF00] bg-[#FFDF00]/10 border border-[#FFDF00]/35 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-[#FFDF00] hover:text-[#002776] hover:scale-105 transition-all mb-2 md:mb-1 self-center md:self-auto shadow-md"
                >
                  <Star size={12} fill="currentColor" /> Avaliar VoxGen 🏆
                </button>
            </div>
            <p className="text-emerald-400 text-lg mt-2 font-bold tracking-wide">
            Sua oficina tática de som completa com Inteligência Artificial.
            </p>
            
            {userRole === 'admin' && (
                <button onClick={() => onSelectMode(AppMode.Admin)} className="mt-4 inline-flex items-center gap-2 bg-[#009739]/20 border border-[#FFDF00]/40 text-[#FFDF00] px-4 py-2 rounded-full text-sm font-black hover:bg-[#009739] hover:text-white transition-all shadow-[0_0_15px_rgba(0,151,57,0.2)]">
                    <ShieldCheck size={16} className="text-[#FFDF00]" /> Painel Administrativo do Técnico
                </button>
            )}

            <div className="mt-6 flex flex-wrap gap-4">
                <button 
                    onClick={() => alert("Módulo de Equipe em breve!")} 
                    className="group flex items-center gap-3 bg-[#009739] hover:bg-[#007a2d] border border-[#FFDF00]/30 text-white px-6 py-3 rounded-2xl font-black hover:shadow-[0_0_20px_rgba(0,151,57,0.4)] transition-all hover:-translate-y-1 active:scale-95 shadow-md"
                >
                    <div className="bg-white/20 p-1.5 rounded-lg group-hover:rotate-12 transition-transform">
                        <Users size={20} />
                    </div>
                    <div className="text-left">
                        <div className="text-[10px] text-[#FFDF00] font-black uppercase tracking-widest leading-none mb-1">Corporate</div>
                        <div className="text-sm">Cadastrar Equipe</div>
                    </div>
                </button>
                
                <button 
                    onClick={() => alert("Upgrade para Plano Ilimitado em breve!")} 
                    className="group flex items-center gap-3 bg-[#002776] hover:bg-[#001746] border border-[#FFDF00]/40 text-[#FFDF00] px-6 py-3 rounded-2xl font-black hover:shadow-[0_0_20px_rgba(0,39,118,0.5)] transition-all hover:-translate-y-1 active:scale-95 shadow-md"
                >
                    <div className="bg-white/10 p-1.5 rounded-lg group-hover:rotate-12 transition-transform">
                        <Sparkles size={20} className="text-[#FFDF00]" />
                    </div>
                    <div className="text-left">
                        <div className="text-[10px] text-white font-bold uppercase tracking-widest leading-none mb-1">VIP Access</div>
                        <div className="text-sm">Escalação Premium</div>
                    </div>
                </button>
            </div>
        </div>

        <div className="bg-[#020f08]/92 border border-[#009739]/40 rounded-2xl p-5 min-w-[310px] backdrop-blur-md shadow-[0_4px_30px_rgba(0,151,57,0.15)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-tr from-transparent to-[#FFDF00]/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {status.plan === 'premium' ? (
                        <Crown size={20} className="text-[#FFDF00] fill-[#FFDF00]" />
                    ) : (
                        <Star size={20} className="text-[#009739]" />
                    )}
                    <span className={`font-black uppercase tracking-wider text-sm ${status.plan === 'premium' ? 'text-[#FFDF00]' : 'text-emerald-400'}`}>
                        {status.plan === 'premium' ? '🏆 TITULAR COPA' : '🥈 RESERVA DE LUXO'}
                    </span>
                </div>
            </div>
            
            {status.plan === 'premium' ? (
                <div className="text-xs text-[#FFDF00] font-black bg-[#009739]/15 p-2.5 rounded-lg border border-[#009739]/30">
                    Acesso ilimitado até: <span className="text-white font-black">{getFormatExpiryDate(status.expiryDate)}</span>
                </div>
            ) : (
                <div className="text-xs text-slate-300 mb-2">
                    Gols de hoje: <span className="text-[#FFDF00] font-extrabold">{status.narrationsToday}/3</span> locuções
                </div>
            )}

            {!isCorpTeam && (
                <div className="mt-4 flex gap-2">
                    <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="INSERIR INGRESSO" className="bg-[#010905] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#FFDF00] flex-grow uppercase font-semibold transition-colors" />
                    <button onClick={handleRedeem} className="bg-[#FFDF00] hover:bg-[#ccb000] text-[#002776] px-4 py-2 rounded-lg text-xs font-black transition-colors shadow-sm">
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
          className={`group relative overflow-hidden rounded-3xl border border-[#009739]/30 bg-[#020f08]/60 hover:bg-[#020f08]/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${(userRole === 'user' || userRole === 'corporate-user') && !isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-[#FFDF00]/60 hover:shadow-[0_0_25px_rgba(0,151,57,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#009739]/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {(userRole === 'user' || userRole === 'corporate-user') && !isAdmin && (
            <div className="absolute top-4 right-4 bg-[#FFDF00]/20 text-[#FFDF00] border border-[#FFDF00]/30 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVA
            </div>
          )}
          <div className="w-16 h-16 bg-[#009739]/25 rounded-2xl flex items-center justify-center mb-6 border border-[#009739]/30 group-hover:scale-110 group-hover:bg-[#FFDF00]/20 group-hover:border-[#FFDF00]/40 transition-all">
            <Mic size={32} className="text-[#FFDF00]" />
          </div>
          <h2 className="text-xl font-black text-white mb-2 flex items-center gap-1.5">Narração Canarinho 🇧🇷</h2>
          {(isAdmin || userRole === 'corporate-admin') ? (
            <p className="text-slate-300 text-xs font-semibold">Gere locuções profissionais e vibrantes com IA com toda a energia da Copa.</p>
          ) : (
            <p className="text-[#FFDF00] text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>

        {!isCorpTeam && (
            <button 
              onClick={() => isAdmin ? onSelectMode(AppMode.Music) : alert("Módulo em construção para usuários VIP.")} 
              className={`group relative overflow-hidden rounded-3xl border border-[#009739]/30 bg-[#020f08]/60 hover:bg-[#020f08]/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-[#FFDF00]/60 hover:shadow-[0_0_25px_rgba(0,151,57,0.15)]'}`}
            >
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {!isAdmin && (
              <div className="absolute top-4 right-4 bg-[#FFDF00]/20 text-[#FFDF00] border border-[#FFDF00]/30 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
                RESERVA
              </div>
            )}
            <div className="w-16 h-16 bg-sky-500/20 rounded-2xl flex items-center justify-center mb-6 border border-sky-500/30 group-hover:scale-110 group-hover:bg-[#FFDF00]/20 group-hover:border-[#FFDF00]/40 transition-all">
                <Music size={32} className="text-sky-300 group-hover:text-[#FFDF00]" />
            </div>
            <h2 className="text-xl font-black text-white mb-2 flex items-center gap-1.5">Estúdio de Hinos 🏆</h2>
            {isAdmin ? (
              <p className="text-slate-300 text-xs font-semibold">Crie trilhas épicas e hinos do hexa com descrições simples de IA.</p>
            ) : (
              <p className="text-[#FFDF00] text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
            )}
            </button>
        )}

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.VoiceCloning) : alert("Módulo em construção para usuários VIP.")} 
          className={`group relative overflow-hidden rounded-3xl border border-[#009739]/30 bg-[#020f08]/60 hover:bg-[#020f08]/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-[#FFDF00]/60 hover:shadow-[0_0_25px_rgba(0,151,57,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#002776]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-[#FFDF00]/20 text-[#FFDF00] border border-[#FFDF00]/30 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVA
            </div>
          )}
          <div className="w-16 h-16 bg-[#002776]/30 rounded-2xl flex items-center justify-center mb-6 border border-[#002776]/40 group-hover:scale-110 group-hover:bg-[#FFDF00]/20 group-hover:border-[#FFDF00]/40 transition-all">
            <Mic2 size={32} className="text-[#002776] fill-[#FFDF00]" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Clone de Grito 🎤</h2>
          {isAdmin ? (
            <p className="text-slate-300 text-xs font-semibold">Clone sua voz para gritar gol e narrar jogadas com fidelidade absoluta.</p>
          ) : (
            <p className="text-[#FFDF00] text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>

        <button onClick={() => onSelectMode(AppMode.SmartPlayer)} className="group relative overflow-hidden rounded-3xl border border-[#009739]/40 bg-[#020f08]/80 hover:bg-[#020f08] border-[#FFDF00]/30 hover:border-[#FFDF00]/65 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl shadow-[0_0_15px_rgba(0,151,57,0.1)]">
          <div className="absolute inset-0 bg-gradient-to-br from-[#009739]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-16 h-16 bg-[#009739]/30 rounded-2xl flex items-center justify-center mb-6 border border-[#009739]/40 group-hover:scale-110 transition-transform">
            <Radio size={32} className="text-[#FFDF00]" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Rádio Craque 📻</h2>
          <p className="text-slate-300 text-xs font-semibold">Rádio inteligente com anúncios táticos, hinos e músicas automatizadas.</p>
        </button>

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.Avatar) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-[#009739]/30 bg-[#020f08]/60 hover:bg-[#020f08]/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-[#FFDF00]/60 hover:shadow-[0_0_25px_rgba(0,151,57,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#FFDF00]/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-[#FFDF00]/20 text-[#FFDF00] border border-[#FFDF00]/30 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVA
            </div>
          )}
          <div className="w-16 h-16 bg-[#FFDF00]/15 rounded-2xl flex items-center justify-center mb-6 border border-[#FFDF00]/35 group-hover:scale-110 group-hover:bg-[#FFDF00]/20 transition-all">
            <Crown size={32} className="text-[#FFDF00]" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Avatar do Hexa ⚽</h2>
          {isAdmin ? (
            <p className="text-slate-300 text-xs font-semibold">Crie avatares falantes realistas de torcedores ou comentaristas.</p>
          ) : (
            <p className="text-[#FFDF00] text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.SFX) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-[#009739]/30 bg-[#020f08]/60 hover:bg-[#020f08]/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-[#FFDF00]/60 hover:shadow-[0_0_25px_rgba(0,151,57,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-[#FFDF00]/20 text-[#FFDF00] border border-[#FFDF00]/30 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVA
            </div>
          )}
          <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6 border border-amber-500/30 group-hover:scale-110 transition-transform">
            <Volume2 size={32} className="text-emerald-400 group-hover:text-[#FFDF00]" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Efeitos de Estádio 🏟️</h2>
          {isAdmin ? (
            <p className="text-slate-300 text-xs font-semibold">Gere gritos de torcidas, vuvuzelas e apitos de alta fidelidade.</p>
          ) : (
            <p className="text-[#FFDF00] text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.Manga) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-[#009739]/30 bg-[#020f08]/60 hover:bg-[#020f08]/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-[#FFDF00]/60 hover:shadow-[0_0_25px_rgba(0,151,57,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#FFDF00]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-[#FFDF00]/20 text-[#FFDF00] border border-[#FFDF00]/30 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVA
            </div>
          )}
          <div className="w-16 h-16 bg-[#009739]/25 rounded-2xl flex items-center justify-center mb-6 border border-[#009739]/35 group-hover:scale-110 group-hover:bg-[#FFDF00]/20 transition-all">
            <Sparkles size={32} className="text-[#FFDF00]" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Gibis Narrados 📖</h2>
          {isAdmin ? (
            <p className="text-slate-300 text-xs font-semibold">Crie quadrinhos dinâmicos com as principais glórias da seleção canarinha.</p>
          ) : (
            <p className="text-[#FFDF00] text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
          )}
        </button>

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.PDFAudio) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-[#009739]/30 bg-[#020f08]/60 hover:bg-[#020f08]/90 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-85' : 'hover:border-[#FFDF00]/60 hover:shadow-[0_0_25px_rgba(0,151,57,0.15)]'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-[#FFDF00]/20 text-[#FFDF00] border border-[#FFDF00]/30 px-3 py-1 rounded-full text-[9px] font-black tracking-widest z-10 uppercase">
              RESERVA
            </div>
          )}
          <div className="w-16 h-16 bg-rose-500/20 rounded-2xl flex items-center justify-center mb-6 border border-rose-500/35 group-hover:scale-110 transition-transform">
            <BookOpen size={32} className="text-rose-400 group-hover:text-[#FFDF00]" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Táticas Imersivas 📃</h2>
          {isAdmin ? (
            <p className="text-slate-300 text-xs font-semibold">Leitura de PDF em voz alta com fundo de vídeos do YouTube e estádios.</p>
          ) : (
            <p className="text-[#FFDF00] text-xs font-bold italic">Disponível em breve para escalação de usuários comuns.</p>
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
