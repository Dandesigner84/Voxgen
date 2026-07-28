import React, { useState, useEffect, useRef } from 'react';
import { 
  Newspaper, 
  Settings, 
  Play, 
  Pause, 
  Sparkles, 
  Upload, 
  Youtube, 
  Music, 
  Clock, 
  MapPin, 
  Sliders, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  RefreshCw, 
  Volume2, 
  Download, 
  Send, 
  Trash2, 
  Radio, 
  Zap, 
  Info,
  Check
} from 'lucide-react';
import { 
  BulletinConfig, 
  BulletinBackgroundMusic, 
  BulletinHistoryItem, 
  VoiceName 
} from '../types';
import { 
  BULLETIN_NICHES, 
  VOXGEN_BG_LIBRARY, 
  getBulletinConfig, 
  saveBulletinConfig, 
  checkDailyBulletinLimit, 
  generateSmartBulletin, 
  getBulletinHistory, 
  saveBackgroundMusic, 
  getUserBackgroundMusic,
  exportBulletinToSmartPlay
} from '../services/bulletinService';
import { buscarYouTube, YouTubeSearchResult } from '../services/youtubeService';
import { audioBufferToMp3, decodeAudioData } from '../utils/audioUtils';

interface SmartBulletinStudioProps {
  audioContext: AudioContext | null;
  initAudioContext: () => AudioContext;
  userEmail?: string;
  userId?: string;
}

const SmartBulletinStudio: React.FC<SmartBulletinStudioProps> = ({
  audioContext,
  initAudioContext,
  userEmail,
  userId = 'guest_user'
}) => {
  const [config, setConfig] = useState<BulletinConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  // Daily Usage Limits
  const [usage, setUsage] = useState<{ allowed: boolean; count: number; dailyLimit: number; message?: string }>({
    allowed: true,
    count: 0,
    dailyLimit: 4
  });

  // Background Music Library & YouTube
  const [bgLibrary, setBgLibrary] = useState<BulletinBackgroundMusic[]>(VOXGEN_BG_LIBRARY);
  const [ytUrl, setYtUrl] = useState('');
  const [isFetchingYt, setIsFetchingYt] = useState(false);
  const [ytResult, setYtResult] = useState<YouTubeSearchResult | null>(null);
  const [ytError, setYtError] = useState<string | null>(null);
  const [sliceStartSec, setSliceStartSec] = useState(0);
  const [sliceEndSec, setSliceEndSec] = useState(60);

  // File Upload State for Background Music
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedAudioBuffer, setUploadedAudioBuffer] = useState<AudioBuffer | null>(null);

  // Generation State & Step Progress
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStep, setGenStep] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // History Log
  const [history, setHistory] = useState<BulletinHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Audio Playback
  const [playingId, setPlayingId] = useState<string | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Load initial configuration and user limits
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [userCfg, bgList, limitInfo, hist] = await Promise.all([
          getBulletinConfig(userId),
          getUserBackgroundMusic(userId),
          checkDailyBulletinLimit(userId),
          getBulletinHistory(userId)
        ]);

        if (isMounted) {
          setConfig(userCfg);
          setBgLibrary(bgList);
          setUsage(limitInfo);
          setHistory(hist);
        }
      } catch (e) {
        console.error("Erro ao carregar dados do Boletim Inteligente:", e);
      } finally {
        if (isMounted) setLoadingConfig(false);
        if (isMounted) setLoadingHistory(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [userId]);

  // Handle Save Configuration Changes
  const handleSaveConfig = async (updated: BulletinConfig) => {
    setConfig(updated);
    setSavingConfig(true);
    try {
      await saveBulletinConfig(updated);
    } catch (e) {
      console.error("Falha ao salvar configurações:", e);
    } finally {
      setSavingConfig(false);
    }
  };

  // YouTube Metadata Fetcher
  const handleFetchYtMetadata = async () => {
    if (!ytUrl.trim()) return;
    setIsFetchingYt(true);
    setYtError(null);
    setYtResult(null);

    try {
      const results = await buscarYouTube(ytUrl.trim());
      if (results && results.length > 0) {
        setYtResult(results[0]);
      } else {
        setYtError("Nenhum vídeo retornado para este link. Verifique a URL.");
      }
    } catch (err: any) {
      if (err.message === 'INVALID_API_KEY' || err.message === 'API_KEY_MISSING') {
        setYtError("Para buscas genéricas por termo, é necessária a chave de API. Cole a URL direta do vídeo do YouTube para carregar.");
      } else {
        setYtError("Não foi possível carregar os metadados do YouTube. Verifique a URL e tente novamente.");
      }
    } finally {
      setIsFetchingYt(false);
    }
  };

  // Save YouTube Reference to Background Library
  const handleSaveYtToLibrary = async () => {
    if (!ytResult || !config) return;

    const bgItem: Omit<BulletinBackgroundMusic, 'id' | 'createdAt'> = {
      userId,
      title: ytResult.title,
      type: 'youtube',
      sourceUrl: `https://www.youtube.com/watch?v=${ytResult.videoId}`,
      thumbnailUrl: ytResult.thumbnail,
      startSec: sliceStartSec,
      endSec: sliceEndSec
    };

    try {
      const saved = await saveBackgroundMusic(bgItem);
      setBgLibrary(prev => [saved, ...prev]);
      const newCfg: BulletinConfig = {
        ...config,
        bgMusicType: 'youtube',
        bgMusicId: saved.id,
        bgMusicTitle: saved.title,
        bgMusicUrl: saved.sourceUrl,
        bgMusicStartSec: sliceStartSec,
        bgMusicEndSec: sliceEndSec
      };
      await handleSaveConfig(newCfg);
      setSuccessMsg(`Fundo "${ytResult.title}" salvo na sua biblioteca com sucesso!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      alert("Erro ao salvar referência do YouTube.");
    }
  };

  // Handle Background File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ctx = initAudioContext();
    setUploadedFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setUploadedAudioBuffer(decoded);

      if (config) {
        const bgItem: Omit<BulletinBackgroundMusic, 'id' | 'createdAt'> = {
          userId,
          title: `Upload: ${file.name}`,
          type: 'upload',
          sourceUrl: URL.createObjectURL(file),
          duration: Math.round(decoded.duration)
        };
        const saved = await saveBackgroundMusic(bgItem);
        setBgLibrary(prev => [saved, ...prev]);

        const newCfg: BulletinConfig = {
          ...config,
          bgMusicType: 'upload',
          bgMusicId: saved.id,
          bgMusicTitle: saved.title,
          bgMusicUrl: bgItem.sourceUrl
        };
        await handleSaveConfig(newCfg);
      }
    } catch (err) {
      alert("Não foi possível processar este arquivo de áudio. Suportados: MP3, WAV, OGG.");
    }
  };

  // Trigger Immediate Bulletin Generation
  const handleGenerateNow = async () => {
    if (!config) return;

    // Check limit
    const limitCheck = await checkDailyBulletinLimit(userId);
    setUsage(limitCheck);
    if (!limitCheck.allowed) {
      setGenError(limitCheck.message || "Limite diário de boletins atingido.");
      return;
    }

    const ctx = initAudioContext();
    setIsGenerating(true);
    setGenError(null);
    setSuccessMsg(null);

    try {
      setGenStep("🔍 Pesquisando notícias recentes do nicho e localização via IA...");
      await new Promise(r => setTimeout(r, 600));

      setGenStep("📝 Criando roteiro de rádio com abertura e encerramento automáticos...");
      await new Promise(r => setTimeout(r, 800));

      setGenStep("🎙️ Sintetizando locução profissional no tom e voz selecionados...");
      await new Promise(r => setTimeout(r, 1000));

      setGenStep("🎵 Aplicando mixagem de fundo musical com Ducking automático...");
      const result = await generateSmartBulletin(config, userId, ctx, uploadedAudioBuffer || undefined);

      setGenStep("📡 Enviando boletim pronto para a fila do Smart Play (Categoria: 📰 Boletins IA)...");
      await new Promise(r => setTimeout(r, 500));

      // Refresh limits & history
      const [updatedUsage, updatedHist] = await Promise.all([
        checkDailyBulletinLimit(userId),
        getBulletinHistory(userId)
      ]);
      setUsage(updatedUsage);
      setHistory(updatedHist);

      setSuccessMsg(`✅ Boletim "${result.historyItem.title}" gerado e adicionado ao Smart Play com sucesso!`);
    } catch (err: any) {
      console.error("Erro na geração do boletim:", err);
      setGenError(err.message || "Falha ao gerar o Boletim Inteligente. Tente novamente.");
    } finally {
      setIsGenerating(false);
      setGenStep(null);
    }
  };

  // Audio Preview Controls
  const stopAudio = () => {
    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch (e) { void e; }
      activeSourceRef.current = null;
    }
    setPlayingId(null);
  };

  const handlePlayHistory = async (item: BulletinHistoryItem) => {
    if (playingId === item.id) {
      stopAudio();
      return;
    }

    if (!item.audioBase64) {
      alert("Áudio não disponível para reprodução instantânea.");
      return;
    }

    const ctx = initAudioContext();
    stopAudio();
    setPlayingId(item.id);

    try {
      const buffer = await decodeAudioData(item.audioBase64, ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setPlayingId(null);
        activeSourceRef.current = null;
      };
      source.start(0);
      activeSourceRef.current = source;
    } catch (e) {
      alert("Erro ao reproduzir áudio do histórico.");
      setPlayingId(null);
    }
  };

  // Re-export to Smart Play
  const handleReexportToSmartPlay = async (item: BulletinHistoryItem) => {
    if (!item.audioBase64) return;
    try {
      await exportBulletinToSmartPlay(item, item.audioBase64);
      setSuccessMsg(`Boletim "${item.title}" re-enviado para a fila do Smart Play!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      alert("Erro ao re-enviar para o Smart Play.");
    }
  };

  // Download MP3
  const handleDownloadMp3 = async (item: BulletinHistoryItem) => {
    if (!item.audioBase64) return;
    const ctx = initAudioContext();
    try {
      const buffer = await decodeAudioData(item.audioBase64, ctx);
      const mp3Blob = audioBufferToMp3(buffer);
      const url = URL.createObjectURL(mp3Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Boletim_VoxGen_${item.niche.replace(/\s+/g, '_')}_${Date.now()}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erro ao fazer download do MP3.");
    }
  };

  if (loadingConfig || !config) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm font-semibold">Carregando configurações do Boletim Inteligente IA...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-8 animate-fade-in">
      
      {/* HEADER BANNER & DAILY LIMIT BAR */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Newspaper className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-white tracking-wide">📰 Boletim Inteligente IA</h2>
                <span className="px-3 py-0.5 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase tracking-widest">
                  Voz do Narrador
                </span>
              </div>
              <p className="text-slate-400 text-xs md:text-sm mt-1">
                Pesquisa automática de notícias regionais, geração de roteiro de rádio e locução direta para o <strong className="text-indigo-300">Smart Play</strong>.
              </p>
            </div>
          </div>

          {/* ACTIVE TOGGLE & DAILY CREDIT BADGE */}
          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2 flex items-center gap-3">
              <span className="text-xs font-bold text-slate-300">Automação:</span>
              <button
                onClick={() => handleSaveConfig({ ...config, isActive: !config.isActive })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.isActive ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.isActive ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
              <span className={`text-xs font-extrabold ${config.isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                {config.isActive ? 'Ativado' : 'Desativado'}
              </span>
            </div>

            <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl px-4 py-2 flex items-center gap-3">
              <Zap size={16} className="text-yellow-400 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Boletins Hoje</span>
                <span className={`text-sm font-black ${usage.count >= usage.dailyLimit ? 'text-red-400' : 'text-emerald-400'}`}>
                  {usage.count} / {usage.dailyLimit} <span className="text-xs text-slate-500 font-semibold">(Créditos)</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* LIMIT ALERT BANNER WHEN REACHED */}
        {!usage.allowed && (
          <div className="mt-4 p-4 bg-red-950/60 border border-red-500/40 rounded-xl text-red-200 text-xs md:text-sm flex items-start gap-3 animate-pulse">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Limite Diário Atingido</p>
              <p className="mt-0.5 opacity-90">{usage.message}</p>
            </div>
          </div>
        )}
      </div>

      {/* SUCCESS OR ERROR FEEDBACK MESSAGES */}
      {successMsg && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-sm flex items-center gap-3 animate-fade-in shadow-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="font-bold">{successMsg}</p>
        </div>
      )}

      {genError && (
        <div className="p-4 bg-red-950/60 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-center gap-3 animate-fade-in shadow-lg">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="font-bold">{genError}</p>
        </div>
      )}

      {/* GENERATION PROGRESS INDICATOR OVERLAY */}
      {isGenerating && (
        <div className="bg-slate-900/90 border border-indigo-500/50 rounded-2xl p-6 text-center space-y-4 shadow-2xl animate-pulse">
          <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
          <h3 className="text-lg font-black text-white">Produzindo Boletim Inteligente com IA...</h3>
          <p className="text-sm font-bold text-cyan-300">{genStep}</p>
          <p className="text-xs text-slate-400">Pesquisando notícias, mixando voz e fundo musical com ducking automático...</p>
        </div>
      )}

      {/* MAIN CONFIGURATION GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: NICHO, LOCALIZAÇÃO & REGRAS DE GERAÇÃO */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* SECTION 1: NICHO E REGIONALIZAÇÃO */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 backdrop-blur-sm shadow-xl">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Radio size={18} className="text-indigo-400" />
              1. Nicho & Localização Prioritária
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Categorias de Nicho</label>
                <select
                  value={config.niche}
                  onChange={(e) => handleSaveConfig({ ...config, niche: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  {BULLETIN_NICHES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {config.niche === 'Personalizado' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Nicho Personalizado</label>
                  <input
                    type="text"
                    placeholder="Ex: Startups de FinTechs, Moda Sustentável..."
                    value={config.customNiche || ''}
                    onChange={(e) => handleSaveConfig({ ...config, customNiche: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* LOCATION INPUTS FOR REGIONAL PRIORITIZATION */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <MapPin size={14} className="text-cyan-400" />
                Filtros de Localização Regional
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Cidade</span>
                  <input
                    type="text"
                    value={config.city}
                    onChange={(e) => handleSaveConfig({ ...config, city: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Estado</span>
                  <input
                    type="text"
                    value={config.state}
                    onChange={(e) => handleSaveConfig({ ...config, state: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">País</span>
                  <input
                    type="text"
                    value={config.country}
                    onChange={(e) => handleSaveConfig({ ...config, country: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: CONFIGURAÇÕES DA GERAÇÃO */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 backdrop-blur-sm shadow-xl">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sliders size={18} className="text-cyan-400" />
              2. Parâmetros da Locução & Frequência
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                  <Clock size={12} className="text-indigo-400" />
                  Intervalo de Pesquisas
                </label>
                <select
                  value={config.intervalMinutes}
                  onChange={(e) => handleSaveConfig({ ...config, intervalMinutes: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"
                >
                  <option value={15}>A cada 15 minutos</option>
                  <option value={30}>A cada 30 minutos</option>
                  <option value={60}>A cada 60 minutos</option>
                  <option value={120}>A cada 2 horas</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Qtd. Notícias por Boletim</label>
                <select
                  value={config.newsCount}
                  onChange={(e) => handleSaveConfig({ ...config, newsCount: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"
                >
                  <option value={1}>1 notícia principal</option>
                  <option value={2}>2 notícias resumidas</option>
                  <option value={3}>3 notícias em destaque</option>
                  <option value={5}>5 notícias rápidas</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Duração Máxima</label>
                <select
                  value={config.maxDurationSeconds}
                  onChange={(e) => handleSaveConfig({ ...config, maxDurationSeconds: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"
                >
                  <option value={30}>30 segundos (Rápido)</option>
                  <option value={45}>45 segundos (Padrão Rádio)</option>
                  <option value={60}>60 segundos (1 minuto)</option>
                  <option value={90}>90 segundos (1m 30s)</option>
                  <option value={120}>120 segundos (2 minutos)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Voz Utilizada</label>
                <select
                  value={config.voice}
                  onChange={(e) => handleSaveConfig({ ...config, voice: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"
                >
                  {Object.values(VoiceName).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Estilo da Locução</label>
                <select
                  value={config.locutionStyle}
                  onChange={(e) => handleSaveConfig({ ...config, locutionStyle: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"
                >
                  <option value="Jornalístico (Âncora)">Jornalístico (Âncora de Rádio)</option>
                  <option value="Rádio FM Dinâmico">Rádio FM Dinâmico & Alto Astral</option>
                  <option value="Podcast Descontraído">Podcast Descontraído</option>
                  <option value="Jovem & Informal">Jovem & Informal</option>
                  <option value="Formal & Corporativo">Formal & Corporativo</option>
                  <option value="Institucional Sóbrio">Institucional Sóbrio</option>
                  <option value="Inspirador">Inspirador & Emocionante</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Idioma</label>
                <select
                  value={config.language}
                  onChange={(e) => handleSaveConfig({ ...config, language: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white"
                >
                  <option value="pt">Português (Brasil)</option>
                  <option value="en">Inglês (English)</option>
                  <option value="es">Espanhol (Español)</option>
                </select>
              </div>
            </div>

            {/* TEMPERATURE SLIDER */}
            <div className="pt-2">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-300">Temperatura da IA (Criatividade)</label>
                <span className="text-xs font-mono text-cyan-400 font-bold">{config.temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={config.temperature}
                onChange={(e) => handleSaveConfig({ ...config, temperature: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-semibold mt-1">
                <span>0.1 (Estritamente Factual)</span>
                <span>0.7 (Equilibrado)</span>
                <span>1.0 (Criativo)</span>
              </div>
            </div>
          </div>

          {/* ACTION BUTTON TO GENERATE IMMEDIATELY */}
          <div className="pt-2">
            <button
              onClick={handleGenerateNow}
              disabled={isGenerating || !usage.allowed}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(99,102,241,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01]"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Produzindo Boletim...
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  🚀 Gerar Boletim Inteligente Agora & Enviar ao Smart Play
                </>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: FUNDOS MUSICAIS E DUCKING AUTOMÁTICO */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-5 backdrop-blur-sm shadow-xl">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Music size={18} className="text-yellow-400" />
              Fundos Musicais para Boletins
            </h3>

            {/* SELECT MUSIC ORIGIN */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-300">Origem da Trilha de Fundo</label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveConfig({ ...config, bgMusicType: 'library' })}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    config.bgMusicType === 'library'
                      ? 'bg-indigo-600/30 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Music size={16} /> VoxGen Lib
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveConfig({ ...config, bgMusicType: 'upload' })}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    config.bgMusicType === 'upload'
                      ? 'bg-indigo-600/30 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Upload size={16} /> Upload
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveConfig({ ...config, bgMusicType: 'youtube' })}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                    config.bgMusicType === 'youtube'
                      ? 'bg-indigo-600/30 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Youtube size={16} /> YouTube
                </button>
              </div>
            </div>

            {/* PRESET LIBRARY CHOOSER */}
            {config.bgMusicType === 'library' && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-300 block">Escolha da Biblioteca VoxGen:</span>
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {bgLibrary.filter(b => b.type === 'library').map(track => (
                    <div
                      key={track.id}
                      onClick={() => handleSaveConfig({ ...config, bgMusicId: track.id, bgMusicTitle: track.title })}
                      className={`p-3 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                        config.bgMusicId === track.id
                          ? 'bg-indigo-950/60 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Music size={14} className={config.bgMusicId === track.id ? 'text-indigo-400' : 'text-slate-500'} />
                        <span className="font-semibold truncate max-w-[180px]">{track.title}</span>
                      </div>
                      {config.bgMusicId === track.id && <Check size={14} className="text-emerald-400" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* UPLOAD FILE SECTION */}
            {config.bgMusicType === 'upload' && (
              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs font-bold text-slate-300 block">Upload de Fundo Musical (MP3, WAV, OGG)</span>
                <input
                  type="file"
                  accept="audio/mp3,audio/wav,audio/ogg"
                  onChange={handleFileUpload}
                  className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                />
                {uploadedFileName && (
                  <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 size={12} /> {uploadedFileName}
                  </p>
                )}
              </div>
            )}

            {/* YOUTUBE SECTION */}
            {config.bgMusicType === 'youtube' && (
              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs font-bold text-slate-300 block">Link do YouTube</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Cole a URL do vídeo do YouTube..."
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                  />
                  <button
                    onClick={handleFetchYtMetadata}
                    disabled={isFetchingYt || !ytUrl.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                  >
                    {isFetchingYt ? <Loader2 size={12} className="animate-spin" /> : 'Buscar'}
                  </button>
                </div>

                {ytError && <p className="text-xs text-red-400 font-semibold">{ytError}</p>}

                {ytResult && (
                  <div className="p-3 bg-slate-900 rounded-xl border border-indigo-500/30 space-y-3">
                    <div className="flex items-center gap-3">
                      <img src={ytResult.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{ytResult.title}</p>
                        <p className="text-[10px] text-slate-400">{ytResult.channelTitle}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">Início (Seg)</span>
                        <input
                          type="number"
                          value={sliceStartSec}
                          onChange={(e) => setSliceStartSec(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">Fim (Seg)</span>
                        <input
                          type="number"
                          value={sliceEndSec}
                          onChange={(e) => setSliceEndSec(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleSaveYtToLibrary}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1"
                    >
                      <Check size={14} /> Salvar Fundo do YouTube
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* DUCKING AND MIX CONTROLS */}
            <div className="border-t border-slate-800 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Volume2 size={14} className="text-cyan-400" />
                Controle de Mixagem & Ducking Automático
              </h4>

              <div>
                <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1">
                  <span>Intensidade do Ducking (Atenuação da Música)</span>
                  <span className="text-cyan-400 font-bold">{Math.round((config.duckingIntensity || 0.7) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={config.duckingIntensity}
                  onChange={(e) => handleSaveConfig({ ...config, duckingIntensity: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500 bg-slate-950 h-2 rounded-lg cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block mb-1">Volume da Voz</span>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={config.voiceVolume}
                    onChange={(e) => handleSaveConfig({ ...config, voiceVolume: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 bg-slate-950 h-2 rounded-lg"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block mb-1">Volume da Música</span>
                  <input
                    type="range"
                    min={0.05}
                    max={0.8}
                    step={0.05}
                    value={config.bgMusicVolume}
                    onChange={(e) => handleSaveConfig({ ...config, bgMusicVolume: parseFloat(e.target.value) })}
                    className="w-full accent-yellow-500 bg-slate-950 h-2 rounded-lg"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* HISTÓRICO DE BOLETINS */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Clock size={18} className="text-cyan-400" />
            Histórico de Boletins Gerados
          </h3>
          <span className="text-xs text-slate-400 font-semibold">Total: {history.length}</span>
        </div>

        {loadingHistory ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
            Carregando histórico...
          </div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
            Nenhum boletim foi gerado ainda. Clique em "Gerar Boletim Inteligente Agora" acima para iniciar.
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-1">
            {history.map(item => (
              <div
                key={item.id}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 uppercase">
                      {item.niche}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                      <MapPin size={10} /> {item.city || 'Regional'}, {item.state}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(item.dateTime).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white">{item.title}</h4>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{item.script}</p>

                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
                    <span>Voz: <strong className="text-slate-200">{item.voiceUsed}</strong></span>
                    <span>Duração: <strong className="text-slate-200">{item.duration}s</strong></span>
                    <span className="flex items-center gap-1">
                      Status Geração: <strong className="text-emerald-400">{item.generationStatus}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      Fila Smart Play: <strong className="text-cyan-400">{item.playbackStatus}</strong>
                    </span>
                  </div>
                </div>

                {/* ACTION BUTTONS FOR EACH HISTORY ITEM */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handlePlayHistory(item)}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                      playingId === item.id
                        ? 'bg-red-500/20 border-red-500 text-red-300'
                        : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {playingId === item.id ? <Pause size={14} /> : <Play size={14} />}
                    {playingId === item.id ? 'Pausar' : 'Ouvir'}
                  </button>

                  <button
                    onClick={() => handleReexportToSmartPlay(item)}
                    title="Re-enviar áudio para o Smart Play"
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-cyan-300 hover:bg-slate-800 transition-colors"
                  >
                    <Send size={14} />
                  </button>

                  <button
                    onClick={() => handleDownloadMp3(item)}
                    title="Baixar em formato MP3"
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-emerald-300 hover:bg-slate-800 transition-colors"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default SmartBulletinStudio;
