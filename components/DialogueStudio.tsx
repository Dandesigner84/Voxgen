import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Sparkles, 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Loader2, 
  Download, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Radio, 
  Zap
} from 'lucide-react';
import { 
  DialogueSpeaker, 
  DialogueLine, 
  DialogueHistoryItem, 
  VoiceName
} from '../types';
import { 
  generateDialogueScript, 
  synthesizeDialogueAudio, 
  saveDialogueHistoryItem, 
  getDialogueHistory, 
  exportDialogueToSmartPlay 
} from '../services/dialogueService';
import { generateSpeech } from '../services/geminiService';
import { decodeAudioData, audioBufferToMp3 } from '../utils/audioUtils';

interface DialogueStudioProps {
  audioContext: AudioContext | null;
  initAudioContext: () => AudioContext;
  userEmail?: string;
  userId?: string;
}

// Preset Duos for quick configuration
const PRESET_DUOS = [
  {
    title: "📻 Âncora & Repórter de Rádio",
    speakerA: { name: "Carlos (Âncora)", voice: VoiceName.Kore, tone: "Jornalístico, Sóbrio e Seguro", avatarColor: "from-blue-600 to-indigo-600" },
    speakerB: { name: "Mariana (Repórter)", voice: VoiceName.Aoede, tone: "Dinâmica, Entusiasmada e Direta", avatarColor: "from-purple-600 to-pink-600" },
    defaultSituation: "Âncora no estúdio chama a repórter nas ruas para informar o trânsito e o clima no centro da cidade."
  },
  {
    title: "🎧 Podcast & Entrevista",
    speakerA: { name: "Apresentador Leo", voice: VoiceName.Puck, tone: "Descontraído, Curioso e Animado", avatarColor: "from-cyan-600 to-blue-600" },
    speakerB: { name: "Dra. Renata (Especialista)", voice: VoiceName.Kore, tone: "Especialista, Didática e Calma", avatarColor: "from-emerald-600 to-teal-600" },
    defaultSituation: "Entrevista rápida de podcast discutindo dicas práticas de saúde mental e bem-estar no trabalho."
  },
  {
    title: "🛍️ Comercial de Rádio Divertido",
    speakerA: { name: "Locutor Vendedor", voice: VoiceName.Fenrir, tone: "Vendedor Impactante, Agitado", avatarColor: "from-amber-600 to-red-600" },
    speakerB: { name: "Cliente Surpreso", voice: VoiceName.Charon, tone: "Divertido, Espantado com a Promoção", avatarColor: "from-violet-600 to-indigo-600" },
    defaultSituation: "Cliente surpreso descobre o desconto imperdível do Feirão do Consumidor e o locutor anuncia as ofertas."
  },
  {
    title: "🤝 Atendimento ao Cliente",
    speakerA: { name: "Cliente com Dúvida", voice: VoiceName.Charon, tone: "Preocupado, Buscando Solução", avatarColor: "from-orange-600 to-amber-600" },
    speakerB: { name: "Atendente Solícito", voice: VoiceName.Aoede, tone: "Atencioso, Polido e Resolutivo", avatarColor: "from-teal-600 to-emerald-600" },
    defaultSituation: "Cliente liga tirando dúvida sobre um pedido e o atendente resolve com rapidez e simpatia."
  }
];

const DialogueStudio: React.FC<DialogueStudioProps> = ({
  audioContext,
  initAudioContext,
  userId = 'guest_user'
}) => {
  // Speakers State
  const [speakerA, setSpeakerA] = useState<DialogueSpeaker>({
    id: 'A',
    name: 'Carlos (Locutor 1)',
    voice: VoiceName.Kore,
    tone: 'Jornalístico, Seguro e Impactante',
    avatarColor: 'from-blue-600 to-indigo-600'
  });

  const [speakerB, setSpeakerB] = useState<DialogueSpeaker>({
    id: 'B',
    name: 'Mariana (Locutor 2)',
    voice: VoiceName.Aoede,
    tone: 'Descontraída, Entusiasmada e Amigável',
    avatarColor: 'from-purple-600 to-pink-600'
  });

  // Situation & Generator State
  const [situationPrompt, setSituationPrompt] = useState('Uma conversa bem-humorada de rádio entre dois locutores comentando os destaques das novidades da semana e convidando os ouvintes.');
  const [turnsCount, setTurnsCount] = useState<number>(6);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Script lines state
  const [dialogueTitle, setDialogueTitle] = useState('Diálogo de Rádio & Podcast');
  const [lines, setLines] = useState<DialogueLine[]>([
    { id: '1', speakerId: 'A', text: 'Fala, pessoal! Sejam muito bem-vindos ao programa de hoje no Smart Play!', emotion: 'Animado', pauseAfterSec: 0.4 },
    { id: '2', speakerId: 'B', text: 'É isso aí! Hoje temos novidades incríveis pra você que nos acompanha no rádio e nas redes.', emotion: 'Entusiasmada', pauseAfterSec: 0.4 },
    { id: '3', speakerId: 'A', text: 'Exatamente! Vamos trazer dicas práticas e o melhor do boletim informativo.', emotion: 'Empolgado', pauseAfterSec: 0.4 },
    { id: '4', speakerId: 'B', text: 'Não saia daí! Fique ligado que o nosso show está apenas começando.', emotion: 'Convidativa', pauseAfterSec: 0.4 }
  ]);

  // Audio Synthesis & Playback
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthProgress, setSynthProgress] = useState<{ current: number; total: number; speakerName: string } | null>(null);
  const [generatedBuffer, setGeneratedBuffer] = useState<AudioBuffer | null>(null);
  const [generatedBase64, setGeneratedBase64] = useState<string | null>(null);
  const [isPlayingFull, setIsPlayingFull] = useState(false);
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);

  // Messages & History
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<DialogueHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Load Dialogue History on Mount
  useEffect(() => {
    let isMounted = true;
    async function loadHist() {
      try {
        const list = await getDialogueHistory(userId);
        if (isMounted) setHistory(list);
      } catch (e) {
        console.warn("Erro ao carregar histórico de diálogos:", e);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }
    loadHist();
    return () => { isMounted = false; };
  }, [userId]);

  // Apply Preset Duo
  const handleApplyPreset = (preset: typeof PRESET_DUOS[0]) => {
    setSpeakerA({ ...preset.speakerA, id: 'A' });
    setSpeakerB({ ...preset.speakerB, id: 'B' });
    setSituationPrompt(preset.defaultSituation);
    setStatusMsg(`Duo "${preset.title}" aplicado com sucesso!`);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // Generate Script via AI
  const handleGenerateAIScript = async () => {
    if (!situationPrompt.trim()) {
      setErrMsg("Digite uma situação ou tema para a IA criar o diálogo.");
      return;
    }

    setIsGeneratingScript(true);
    setErrMsg(null);
    setStatusMsg(null);

    try {
      const res = await generateDialogueScript({
        situation: situationPrompt,
        speakerA,
        speakerB,
        turnsCount
      });

      setDialogueTitle(res.title);
      setLines(res.lines);
      setStatusMsg(`✨ Roteiro com ${res.lines.length} falas criado com sucesso pela IA!`);
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err: any) {
      console.error("Erro na geração de roteiro por IA:", err);
      setErrMsg(err.message || "Falha ao gerar o roteiro do diálogo por IA.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // Add line manually
  const handleAddLine = (speakerId: 'A' | 'B') => {
    const newLine: DialogueLine = {
      id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      speakerId,
      text: '',
      emotion: 'Normal',
      pauseAfterSec: 0.4
    };
    setLines([...lines, newLine]);
  };

  // Update line text or parameters
  const handleUpdateLine = (id: string, updates: Partial<DialogueLine>) => {
    setLines(lines.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  // Delete line
  const handleDeleteLine = (id: string) => {
    if (lines.length <= 1) {
      setErrMsg("O diálogo deve conter pelo menos uma fala.");
      return;
    }
    setLines(lines.filter(l => l.id !== id));
  };

  // Move line up/down
  const handleMoveLine = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === lines.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const copy = [...lines];
    const temp = copy[index];
    copy[index] = copy[newIndex];
    copy[newIndex] = temp;
    setLines(copy);
  };

  // Play single turn preview
  const handlePlaySingleLine = async (line: DialogueLine) => {
    if (playingLineId === line.id) {
      stopAudio();
      return;
    }

    if (!line.text.trim()) return;

    const ctx = initAudioContext();
    stopAudio();
    setPlayingLineId(line.id);

    try {
      const voice = line.speakerId === 'A' ? speakerA.voice : speakerB.voice;
      const base64 = await generateSpeech(line.text.trim(), voice);
      const buffer = await decodeAudioData(base64, ctx);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setPlayingLineId(null);
        activeSourceRef.current = null;
      };
      source.start(0);
      activeSourceRef.current = source;
    } catch (e) {
      alert("Erro ao reproduzir fala individual.");
      setPlayingLineId(null);
    }
  };

  // Synthesize Full Dialogue Audio
  const handleSynthesizeFullDialogue = async () => {
    if (lines.length === 0) return;

    const validLines = lines.filter(l => l.text.trim().length > 0);
    if (validLines.length === 0) {
      setErrMsg("Preencha ao menos uma fala com texto antes de gerar o áudio.");
      return;
    }

    const ctx = initAudioContext();
    setIsSynthesizing(true);
    setErrMsg(null);
    setStatusMsg(null);
    stopAudio();

    try {
      const result = await synthesizeDialogueAudio(
        validLines,
        speakerA,
        speakerB,
        ctx,
        (current, total, speakerName) => {
          setSynthProgress({ current, total, speakerName });
        }
      );

      setGeneratedBuffer(result.audioBuffer);

      // Convert full buffer to mp3/wav base64
      const mp3Blob = audioBufferToMp3(result.audioBuffer);
      const reader = new FileReader();
      reader.readAsDataURL(mp3Blob);
      reader.onloadend = async () => {
        const fullBase64 = reader.result as string;
        setGeneratedBase64(fullBase64);

        // Save to Firestore History
        const histItem: Omit<DialogueHistoryItem, 'id'> = {
          userId,
          title: dialogueTitle,
          situation: situationPrompt,
          speakerA: { name: speakerA.name, voice: speakerA.voice },
          speakerB: { name: speakerB.name, voice: speakerB.voice },
          linesCount: validLines.length,
          duration: Math.round(result.duration),
          createdAt: Date.now(),
          audioBase64: fullBase64
        };

        const histId = await saveDialogueHistoryItem(histItem);
        setHistory(prev => [{ id: histId, ...histItem }, ...prev]);

        // Auto export to Smart Play
        await exportDialogueToSmartPlay({ id: histId, ...histItem }, fullBase64);

        setStatusMsg(`🎉 Diálogo "${dialogueTitle}" sintetizado e exportado para o Smart Play com sucesso!`);
      };
    } catch (err: any) {
      console.error("Erro na sintetização do diálogo:", err);
      setErrMsg(err.message || "Erro ao sintetizar o áudio do diálogo.");
    } finally {
      setIsSynthesizing(false);
      setSynthProgress(null);
    }
  };

  // Stop current playing audio
  const stopAudio = () => {
    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch (e) { void e; }
      activeSourceRef.current = null;
    }
    setIsPlayingFull(false);
    setPlayingLineId(null);
  };

  // Play full audio buffer
  const handlePlayFullAudio = () => {
    if (!generatedBuffer) return;

    if (isPlayingFull) {
      stopAudio();
      return;
    }

    const ctx = initAudioContext();
    stopAudio();
    setIsPlayingFull(true);

    const source = ctx.createBufferSource();
    source.buffer = generatedBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
      setIsPlayingFull(false);
      activeSourceRef.current = null;
    };
    source.start(0);
    activeSourceRef.current = source;
  };

  // Download full dialogue MP3
  const handleDownloadFullMp3 = () => {
    if (!generatedBuffer) return;
    try {
      const mp3Blob = audioBufferToMp3(generatedBuffer);
      const url = URL.createObjectURL(mp3Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Dialogo_${dialogueTitle.replace(/\s+/g, '_')}_${Date.now()}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erro ao baixar o arquivo MP3.");
    }
  };

  // Play history item
  const handlePlayHistoryItem = async (item: DialogueHistoryItem) => {
    if (!item.audioBase64) return;
    const ctx = initAudioContext();
    stopAudio();

    try {
      const buffer = await decodeAudioData(item.audioBase64, ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      activeSourceRef.current = source;
    } catch (e) {
      alert("Erro ao reproduzir diálogo do histórico.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-8 animate-fade-in">
      
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950/80 to-slate-900 border border-purple-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-600 via-indigo-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Users className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-white tracking-wide">👥 Diálogo entre Vozes (Dupla Locução)</h2>
                <span className="px-3 py-0.5 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase tracking-widest">
                  Simulação IA
                </span>
              </div>
              <p className="text-slate-400 text-xs md:text-sm mt-1">
                Combine duas vozes diferentes da plataforma para simular entrevistas, conversas de rádio, comerciais e esquetes.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* STATUS & ERROR FEEDBACK */}
      {statusMsg && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-sm flex items-center gap-3 animate-fade-in shadow-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="font-bold">{statusMsg}</p>
        </div>
      )}

      {errMsg && (
        <div className="p-4 bg-red-950/60 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-center gap-3 animate-fade-in shadow-lg">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="font-bold">{errMsg}</p>
        </div>
      )}

      {/* PRESET DUOS SELECTOR */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm space-y-3">
        <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Zap size={14} className="text-yellow-400" /> Duplas Prontas (Presets Rápidos)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESET_DUOS.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleApplyPreset(p)}
              className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-left transition-all hover:scale-[1.01] group"
            >
              <h4 className="text-xs font-bold text-white group-hover:text-purple-300">{p.title}</h4>
              <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{p.defaultSituation}</p>
            </button>
          ))}
        </div>
      </div>

      {/* SPEAKERS CONFIGURATION GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* SPEAKER A */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 backdrop-blur-sm shadow-xl relative overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-r ${speakerA.avatarColor} flex items-center justify-center text-white font-black text-sm`}>
              A
            </div>
            <h3 className="text-base font-extrabold text-white">Locutor / Personagem A</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Nome do Personagem / Papel</label>
              <input
                type="text"
                value={speakerA.name}
                onChange={(e) => setSpeakerA({ ...speakerA, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Voz do Narrador</label>
              <select
                value={speakerA.voice}
                onChange={(e) => setSpeakerA({ ...speakerA, voice: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              >
                {Object.values(VoiceName).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Estilo & Personalidade</label>
              <input
                type="text"
                placeholder="Ex: Jornalístico, Entusiasmado, Calmo..."
                value={speakerA.tone}
                onChange={(e) => setSpeakerA({ ...speakerA, tone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>
          </div>
        </div>

        {/* SPEAKER B */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 backdrop-blur-sm shadow-xl relative overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-r ${speakerB.avatarColor} flex items-center justify-center text-white font-black text-sm`}>
              B
            </div>
            <h3 className="text-base font-extrabold text-white">Locutor / Personagem B</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Nome do Personagem / Papel</label>
              <input
                type="text"
                value={speakerB.name}
                onChange={(e) => setSpeakerB({ ...speakerB, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Voz do Narrador</label>
              <select
                value={speakerB.voice}
                onChange={(e) => setSpeakerB({ ...speakerB, voice: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              >
                {Object.values(VoiceName).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Estilo & Personalidade</label>
              <input
                type="text"
                placeholder="Ex: Descontraído, Amigável, Didático..."
                value={speakerB.tone}
                onChange={(e) => setSpeakerB({ ...speakerB, tone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* AI SCRIPT GENERATOR BOX */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl space-y-4">
        <h3 className="text-base font-extrabold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <Sparkles className="w-5 h-5 text-purple-400" />
          Gerador de Roteiro de Diálogo por IA
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Situação, Tema ou Contexto do Diálogo</label>
            <textarea
              rows={3}
              value={situationPrompt}
              onChange={(e) => setSituationPrompt(e.target.value)}
              placeholder="Descreva a situação que deseja simular. Ex: Dois apresentadores de podcast entrevistando um convidado sobre inteligência artificial no marketing..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:border-purple-500 focus:outline-none leading-relaxed"
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-300">Qtd. de Falas:</label>
              <select
                value={turnsCount}
                onChange={(e) => setTurnsCount(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              >
                <option value={4}>4 falas (Curto / Vinheta)</option>
                <option value={6}>6 falas (Padrão Rádio)</option>
                <option value={8}>8 falas (Podcast Rápido)</option>
                <option value={10}>10 falas (Conversa Detalhada)</option>
              </select>
            </div>

            <button
              onClick={handleGenerateAIScript}
              disabled={isGeneratingScript || !situationPrompt.trim()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              {isGeneratingScript ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando Roteiro com IA...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Criar Roteiro do Diálogo
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* SCRIPT LINES EDITOR */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">Título do Diálogo</span>
            <input
              type="text"
              value={dialogueTitle}
              onChange={(e) => setDialogueTitle(e.target.value)}
              className="block bg-transparent text-lg font-black text-white focus:outline-none w-full border-b border-dashed border-slate-700 pb-1"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddLine('A')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1"
            >
              <Plus size={14} /> + Fala {speakerA.name}
            </button>
            <button
              onClick={() => handleAddLine('B')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1"
            >
              <Plus size={14} /> + Fala {speakerB.name}
            </button>
          </div>
        </div>

        {/* LINES LIST */}
        <div className="space-y-3">
          {lines.map((line, idx) => {
            const isA = line.speakerId === 'A';
            const speaker = isA ? speakerA : speakerB;

            return (
              <div
                key={line.id}
                className={`p-4 rounded-xl border transition-all ${
                  isA 
                    ? 'bg-slate-950/80 border-indigo-500/30' 
                    : 'bg-slate-950/80 border-purple-500/30'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateLine(line.id, { speakerId: isA ? 'B' : 'A' })}
                      className={`px-3 py-1 rounded-lg text-xs font-black text-white flex items-center gap-1.5 bg-gradient-to-r ${speaker.avatarColor}`}
                      title="Clique para alternar o locutor desta fala"
                    >
                      <Users size={12} /> {speaker.name} ({speaker.voice})
                    </button>

                    <span className="text-[10px] text-slate-400 font-semibold">
                      Fala #{idx + 1}
                    </span>
                  </div>

                  {/* LINE CONTROLS */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handlePlaySingleLine(line)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${
                        playingLineId === line.id
                          ? 'bg-red-500/20 border-red-500 text-red-300'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {playingLineId === line.id ? <Pause size={12} /> : <Play size={12} />} Ouvir Fala
                    </button>

                    <button
                      onClick={() => handleMoveLine(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 bg-slate-900 text-slate-400 hover:text-white rounded-lg disabled:opacity-30"
                      title="Mover para cima"
                    >
                      <ArrowUp size={14} />
                    </button>

                    <button
                      onClick={() => handleMoveLine(idx, 'down')}
                      disabled={idx === lines.length - 1}
                      className="p-1.5 bg-slate-900 text-slate-400 hover:text-white rounded-lg disabled:opacity-30"
                      title="Mover para baixo"
                    >
                      <ArrowDown size={14} />
                    </button>

                    <button
                      onClick={() => handleDeleteLine(line.id)}
                      className="p-1.5 bg-slate-900 text-red-400 hover:text-red-300 rounded-lg"
                      title="Excluir fala"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={line.text}
                  onChange={(e) => handleUpdateLine(line.id, { text: e.target.value })}
                  placeholder={`Digite a fala de ${speaker.name}...`}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-slate-600 leading-relaxed"
                />

                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                  <div className="flex items-center gap-2">
                    <span>Pausa após a fala:</span>
                    <select
                      value={line.pauseAfterSec ?? 0.4}
                      onChange={(e) => handleUpdateLine(line.id, { pauseAfterSec: Number(e.target.value) })}
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[10px] text-white"
                    >
                      <option value={0.2}>0.2s (Rápida)</option>
                      <option value={0.4}>0.4s (Natural)</option>
                      <option value={0.8}>0.8s (Média)</option>
                      <option value={1.2}>1.2s (Pausa Longa)</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* FULL SYNTHESIS BUTTON & PROGRESS */}
        <div className="pt-4 space-y-4">
          {synthProgress && (
            <div className="bg-purple-950/60 border border-purple-500/40 rounded-xl p-4 text-center space-y-2 animate-pulse">
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
              <p className="text-xs font-bold text-purple-200">
                Sintetizando fala {synthProgress.current} de {synthProgress.total} (Locutor: {synthProgress.speakerName})...
              </p>
            </div>
          )}

          <button
            onClick={handleSynthesizeFullDialogue}
            disabled={isSynthesizing || lines.length === 0}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-extrabold text-sm md:text-base flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(168,85,247,0.4)] transition-all disabled:opacity-50 hover:scale-[1.01]"
          >
            {isSynthesizing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Sintetizando Áudio das Vozes...
              </>
            ) : (
              <>
                <Radio size={20} />
                🎙️ Sintetizar Áudio Completo do Diálogo & Enviar ao Smart Play
              </>
            )}
          </button>
        </div>

        {/* GENERATED MASTER AUDIO PLAYER */}
        {generatedBuffer && (
          <div className="bg-slate-950 border border-purple-500/50 rounded-xl p-5 space-y-4 animate-fade-in shadow-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider">Áudio Final do Diálogo</span>
                <h4 className="text-sm font-bold text-white">{dialogueTitle}</h4>
                <p className="text-xs text-slate-400">
                  Duração total: <strong className="text-cyan-300">{Math.round(generatedBuffer.duration)}s</strong> | Dupla: {speakerA.voice} & {speakerB.voice}
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handlePlayFullAudio}
                  className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                    isPlayingFull
                      ? 'bg-red-500 text-white'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                  }`}
                >
                  {isPlayingFull ? <Pause size={16} /> : <Play size={16} />}
                  {isPlayingFull ? 'Pausar Áudio' : 'Ouvir Diálogo Completo'}
                </button>

                <button
                  onClick={handleDownloadFullMp3}
                  className="px-4 py-2.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Download size={16} /> MP3
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* DIALOGUE HISTORY */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Clock size={18} className="text-purple-400" />
            Histórico de Diálogos Gerados
          </h3>
          <span className="text-xs text-slate-400 font-semibold">Total: {history.length}</span>
        </div>

        {loadingHistory ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
            Carregando histórico...
          </div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
            Nenhum diálogo foi sintetizado ainda. Crie o seu primeiro diálogo acima!
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
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-500/20 text-purple-300 uppercase">
                      💬 Diálogo
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(item.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white">{item.title}</h4>
                  <p className="text-xs text-slate-400 line-clamp-1">{item.situation}</p>

                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
                    <span>Voz A: <strong className="text-indigo-300">{item.speakerA.name} ({item.speakerA.voice})</strong></span>
                    <span>Voz B: <strong className="text-purple-300">{item.speakerB.name} ({item.speakerB.voice})</strong></span>
                    <span>Falas: <strong className="text-slate-200">{item.linesCount}</strong></span>
                    <span>Duração: <strong className="text-cyan-300">{item.duration}s</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handlePlayHistoryItem(item)}
                    className="p-2.5 bg-slate-900 border border-slate-700 text-purple-300 hover:bg-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Play size={14} /> Ouvir
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

export default DialogueStudio;
