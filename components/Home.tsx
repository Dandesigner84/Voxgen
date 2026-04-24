
import React, { useState, useEffect } from 'react';
import { Mic, Music, Radio, Crown, Check, BookOpen, ShieldCheck, Volume2, Mic2, Users, Gift, Star, Sparkles } from 'lucide-react';
import { AppMode } from '../types';
import { getUserStatus, redeemCode, getFormatExpiryDate } from '../services/monetizationService';
import BluetoothConnect from './BluetoothConnect';

interface HomeProps {
  onSelectMode: (mode: AppMode) => void;
  userRole: 'user' | 'admin' | 'corporate-admin' | 'corporate-user';
}

const Home: React.FC<HomeProps> = ({ onSelectMode, userRole }) => {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState(getUserStatus());
  const [redeemMsg, setRedeemMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

  const isCorpTeam = userRole === 'corporate-user';
  const isAdmin = userRole === 'admin';

  useEffect(() => {
    setStatus(getUserStatus());
  }, []);

  const handleRedeem = () => {
    if (!code.trim()) return;
    const result = redeemCode(code.trim().toUpperCase());
    if (result.success) {
      setRedeemMsg({ type: 'success', text: result.message });
      setStatus(getUserStatus());
      setCode('');
    } else {
      setRedeemMsg({ type: 'error', text: result.message });
    }
    setTimeout(() => setRedeemMsg(null), 5000);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full animate-fade-in px-4 py-8">
      
      <div className="w-full max-w-4xl flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
        <div className="text-center md:text-left">
            <h1 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 tracking-tight">
            VoxGen AI
            </h1>
            <p className="text-slate-400 text-lg mt-2 font-medium">
            Sua oficina de som completa com Inteligência Artificial.
            </p>
            
            {userRole === 'admin' && (
                <button onClick={() => onSelectMode(AppMode.Admin)} className="mt-4 inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/50 text-indigo-300 px-4 py-2 rounded-full text-sm font-bold hover:bg-indigo-600 hover:text-white transition-all">
                    <ShieldCheck size={16} /> Painel Administrativo
                </button>
            )}

            {!isCorpTeam && userRole !== 'admin' && (
                <div className="mt-4 flex flex-wrap gap-3">
                    <button onClick={() => alert("Módulo de Equipe em breve!")} className="inline-flex items-center gap-2 bg-emerald-600/20 border border-emerald-500/50 text-emerald-300 px-4 py-2 rounded-full text-sm font-bold hover:bg-emerald-600 hover:text-white transition-all">
                        <Users size={16} /> Cadastrar Equipe
                    </button>
                    <button onClick={() => alert("Upgrade para Plano Ilimitado em breve!")} className="inline-flex items-center gap-2 bg-amber-600/20 border border-amber-500/50 text-amber-300 px-4 py-2 rounded-full text-sm font-bold hover:bg-amber-600 hover:text-white transition-all">
                        <Sparkles size={16} /> Cadastro Premium
                    </button>
                </div>
            )}
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 min-w-[300px] backdrop-blur-sm shadow-xl">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {status.plan === 'premium' ? (
                        <Crown size={20} className="text-yellow-400 fill-yellow-400" />
                    ) : (
                        <Star size={20} className="text-slate-500" />
                    )}
                    <span className={`font-bold ${status.plan === 'premium' ? 'text-yellow-400' : 'text-slate-300'}`}>
                        {status.plan === 'premium' ? 'PLANO PREMIUM' : 'PLANO FREE'}
                    </span>
                </div>
            </div>
            
            {status.plan === 'premium' ? (
                <div className="text-xs text-slate-400">
                    Acesso ilimitado até <span className="text-white font-bold">{getFormatExpiryDate()}</span>
                </div>
            ) : (
                <div className="text-xs text-slate-400 mb-2">
                    Uso hoje: <span className="text-white font-bold">{status.narrationsToday}/3</span> narrações
                </div>
            )}

            {!isCorpTeam && (
                <div className="mt-3 flex gap-2">
                    <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="INSERIR CÓDIGO" className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 flex-grow uppercase" />
                    <button onClick={handleRedeem} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-xs font-bold transition-colors">
                        RESGATAR
                    </button>
                </div>
            )}
            {redeemMsg && <p className={`text-[10px] mt-2 ${redeemMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>{redeemMsg.text}</p>}
        </div>
      </div>
      
      <div className="w-full max-w-4xl mb-12">
        <BluetoothConnect />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full">
        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.Narration) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-80' : 'hover:border-indigo-500/50'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded-full text-[10px] font-bold z-10">
              MANUTENÇÃO
            </div>
          )}
          <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Mic size={32} className="text-indigo-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Narração</h2>
          {isAdmin ? (
            <p className="text-slate-400 text-xs">Transforme textos em voz humana com alta fidelidade.</p>
          ) : (
            <p className="text-amber-500/70 text-xs font-medium italic">Desculpe, estamos indisponíveis para implantar melhorias.</p>
          )}
        </button>

        {!isCorpTeam && (
            <button 
              onClick={() => isAdmin ? onSelectMode(AppMode.Music) : null} 
              className={`group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-80' : 'hover:border-purple-500/50'}`}
            >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {!isAdmin && (
              <div className="absolute top-4 right-4 bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded-full text-[10px] font-bold z-10">
                MANUTENÇÃO
              </div>
            )}
            <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Music size={32} className="text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Música</h2>
            {isAdmin ? (
              <p className="text-slate-400 text-xs">Crie trilhas e músicas completas a partir de descrições.</p>
            ) : (
              <p className="text-amber-500/70 text-xs font-medium italic">Desculpe, estamos indisponíveis para implantar melhorias.</p>
            )}
            </button>
        )}

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.VoiceCloning) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-80' : 'hover:border-cyan-500/50'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded-full text-[10px] font-bold z-10">
              MANUTENÇÃO
            </div>
          )}
          <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Mic2 size={32} className="text-cyan-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Clone de Voz</h2>
          {isAdmin ? (
            <p className="text-slate-400 text-xs">Grave sua voz e crie um narrador digital personalizado.</p>
          ) : (
            <p className="text-amber-500/70 text-xs font-medium italic">Desculpe, estamos indisponíveis para implantar melhorias.</p>
          )}
        </button>

        <button onClick={() => onSelectMode(AppMode.SmartPlayer)} className="group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-emerald-500/50 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Radio size={32} className="text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Smart Player</h2>
          <p className="text-slate-400 text-xs">Rádio inteligente com anúncios e músicas automatizadas.</p>
        </button>

        <button 
          onClick={() => isAdmin ? onSelectMode(AppMode.PDFAudio) : null} 
          className={`group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all duration-300 h-80 flex flex-col items-center justify-center text-center p-6 shadow-xl ${!isAdmin ? 'cursor-not-allowed opacity-80' : 'hover:border-rose-500/50'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {!isAdmin && (
            <div className="absolute top-4 right-4 bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded-full text-[10px] font-bold z-10">
              MANUTENÇÃO
            </div>
          )}
          <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <BookOpen size={32} className="text-rose-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">PDF Imersivo</h2>
          {isAdmin ? (
            <p className="text-slate-400 text-xs">Leitura de PDF em voz alta com fundo de vídeo YouTube.</p>
          ) : (
            <p className="text-amber-500/70 text-xs font-medium italic">Desculpe, estamos indisponíveis para implantar melhorias.</p>
          )}
        </button>
      </div>
    </div>
  );
};

export default Home;
