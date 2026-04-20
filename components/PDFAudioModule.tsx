
import React, { useState, useRef, useEffect } from 'react';
import { FileText, Play, Pause, Square, Youtube, Volume2, Settings, AlertCircle, Loader2, FastForward, RotateCcw, Upload, Clock, CheckCircle, Sparkles, Wand2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { generateSpeech, refineText } from '../services/geminiService';
import { ToneType, VoiceName } from '../types';
import { decodeAudioData } from '../utils/audioUtils';

// Configuração do Worker do PDF.js via CDN (jsDelivr) com suporte a ESM (.mjs) para PDF.js v4+
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PDFModuleProps {
  onBack?: () => void;
}

const PDFAudioModule: React.FC<PDFModuleProps> = () => {
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [extractedText, setExtractedText] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  // TTS State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [rate, setRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [selectedVoice, setSelectedVoice] = useState<string>(VoiceName.Zephyr);
  const [readingStyle, setReadingStyle] = useState<ToneType>(ToneType.Neutral);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);

  // Audio Context and Source for Realistic playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentSentencesRef = useRef<string[]>([]);

  // Initialize Audio Context
  useEffect(() => {
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Sync YouTube Video ID
  useEffect(() => {
    if (youtubeUrl) {
      const id = extractYoutubeId(youtubeUrl);
      setVideoId(id);
    } else {
      setVideoId(null);
    }
  }, [youtubeUrl]);

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPdfFile(file);
      setPdfUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleProcessPdf = async () => {
    if (!pdfUrl && !pdfFile) return;
    setIsProcessing(true);
    setError(null);
    setExtractedText([]);
    setCountdown(null);
    
    try {
      let pdfSource: any;
      
      if (pdfFile) {
        const arrayBuffer = await pdfFile.arrayBuffer();
        // Usar Uint8Array é mais estável para o PDF.js em diversas versões
        pdfSource = { data: new Uint8Array(arrayBuffer) };
      } else {
        pdfSource = { url: pdfUrl };
      }

      const loadingTask = pdfjsLib.getDocument(pdfSource);
      const pdf = await loadingTask.promise;
      setTotalPages(pdf.numPages);
      
      const pagesText: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        pagesText.push(pageText);
        
        // Atualiza o estado incrementalmente para permitir leitura parcial
        setExtractedText([...pagesText]);
      }

      // Iniciar contagem regressiva para leitura automática
      setCountdown(5);
    } catch (err: any) {
      console.error(err);
      setError("Erro de Acesso (CORS) ou Arquivo Inválido. A maioria dos sites bloqueia a extração direta via link. DICA: Baixe o arquivo e use o botão de UPLOAD (nuvem) acima.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Countdown timer logic
  useEffect(() => {
    if (countdown === null) return;
    
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      handleStartPlayback();
      setCountdown(null);
    }
  }, [countdown]);

  const renderPdf = (url: string) => {
    // Para simplificar a renderização visual, usaremos um embed ou iframe
    // mas o texto já foi extraído pelo pdf.js para o áudio
  };

  const handleStartPlayback = async () => {
    if (extractedText.length === 0) return;
    
    const fullText = extractedText.join(' ');
    // Split into smaller parts, but ensure we don't have empty sentences and handle long ones
    let sentences = fullText.match(/[^\.!\?]+[\.!\?]+/g) || [fullText];
    
    // Safety check: ensure sentences aren't extremely long (over 1000 chars) as it can crash the API
    sentences = sentences.flatMap(s => {
      if (s.length < 1000) return [s];
      const subParts: string[] = [];
      let current = s;
      while (current.length > 0) {
        subParts.push(current.substring(0, 1000));
        current = current.substring(1000);
      }
      return subParts;
    }).filter(s => s.trim().length > 0);

    if (sentences.length === 0) return;
    currentSentencesRef.current = sentences;
    
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    playRealisticSentence(0);
  };

  const playRealisticSentence = async (index: number) => {
    const sentences = currentSentencesRef.current;
    if (index >= sentences.length) {
      setIsPlaying(false);
      setIsSynthesizing(false);
      return;
    }

    setIsPlaying(true);
    setIsPaused(false);
    setIsSynthesizing(true);
    setCurrentSentenceIndex(index);

    try {
      const originalText = sentences[index];
      
      // 1. Humanize/Refine the text based on selected style
      const refinedText = await refineText(originalText, readingStyle, false);
      
      // 2. Generate high-quality speech with VoxGen (Gemini)
      const audioBase64 = await generateSpeech(refinedText, selectedVoice);
      
      if (!audioBase64) throw new Error("Falha ao gerar voz");

      // 3. Decode and play
      const audioBuffer = await decodeAudioData(audioBase64, audioContextRef.current!);
      
      setIsSynthesizing(false);
      
      const source = audioContextRef.current!.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = rate;
      
      const gainNode = audioContextRef.current!.createGain();
      gainNode.gain.value = volume;
      
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current!.destination);
      
      audioSourceRef.current = source;
      
      source.onended = () => {
        if (isPlaying && !isPaused) {
          playRealisticSentence(index + 1);
        }
      };
      
      source.start();
    } catch (err: any) {
      console.error("Erro na leitura realista:", err);
      setIsPlaying(false);
      setIsSynthesizing(false);
      const errorMessage = err?.message || "Erro desconhecido";
      setError(`Erro na narração: ${errorMessage}. Verifique se sua chave API está correta ou tente um trecho menor.`);
    }
  };

  const handlePause = () => {
    if (audioContextRef.current) {
      audioContextRef.current.suspend();
      setIsPaused(true);
    }
  };

  const handleResume = () => {
    if (audioContextRef.current) {
      audioContextRef.current.resume();
      setIsPaused(false);
    }
  };

  const handleStop = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
    setIsSynthesizing(false);
    setCurrentSentenceIndex(0);
  };

  const progress = totalPages > 0 ? (extractedText.length / totalPages) * 100 : 0;
  const canStartReading = totalPages > 0 && progress >= 30;

  return (
    <div className="max-w-6xl mx-auto px-4 pb-12 animate-fade-in relative z-10">
      {/* Background Video (If active) */}
      {videoId && (
        <div className="fixed inset-0 -z-10 bg-black overflow-hidden pointer-events-none opacity-30">
          <iframe
            className="w-[150%] h-[150%] -translate-x-[15%] -translate-y-[15%] pointer-events-none"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&iv_load_policy=3&disablekb=1`}
            allow="autoplay; encrypted-media"
          />
        </div>
      )}

      <div className="flex flex-col gap-6">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-rose-600 rounded-lg flex items-center justify-center text-white">
              <FileText size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Leitura de PDF com Fundo de Vídeo</h2>
              <p className="text-slate-400 text-sm">Estudo imersivo ou relaxamento produtivo</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Upload de PDF ou URL</label>
                <div className="flex gap-2">
                  <div className="flex-grow relative group">
                    <input
                      type="text"
                      placeholder="https://exemplo.com/doc.pdf"
                      value={pdfUrl}
                      onChange={(e) => { setPdfUrl(e.target.value); setPdfFile(null); }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-4 pr-10 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <label className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-500 hover:text-indigo-400 p-1" title="Fazer upload de arquivo">
                      <Upload size={18} />
                      <input type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
                    </label>
                  </div>
                  <button
                    onClick={handleProcessPdf}
                    disabled={isProcessing || (!pdfUrl && !pdfFile)}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-bold transition-all shadow-lg flex items-center gap-2"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" size={16} /> : "Processar"}
                  </button>
                </div>
                {pdfFile && (
                  <p className="text-[10px] text-indigo-400 flex items-center gap-1">
                    <CheckCircle size={10} /> Arquivo selecionado: {pdfFile.name}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Link do YouTube (Opcional)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="YouTube URL (Lofi, Natureza, etc.)"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="flex-grow bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
                />
                <div className="bg-red-600/20 border border-red-500/30 w-10 h-10 rounded-lg flex items-center justify-center text-red-400">
                  <Youtube size={20} />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg flex items-center gap-3 text-red-400 text-sm mb-6">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {/* Preparation Countdown Overlay */}
          {countdown !== null && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-indigo-900/40 backdrop-blur-md animate-fade-in">
              <div className="bg-slate-900 border border-indigo-500 p-12 rounded-3xl shadow-2xl text-center scale-up">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                    <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="276" strokeDashoffset={276 - (276 * countdown / 5)} className="text-indigo-500 transition-all duration-1000 ease-linear" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-4xl font-black text-white">{countdown}</div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Preparando Sistema</h2>
                <p className="text-indigo-300 text-sm">Organizando vozes e efeitos imersivos...</p>
                <div className="mt-8 flex items-center justify-center gap-2 text-slate-400 text-xs">
                  <Clock size={12} /> Iniciando automaticamente
                </div>
              </div>
            </div>
          )}

          {/* Controls Panel */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                disabled={!isPlaying || !isPaused}
                onClick={handleResume}
                className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white disabled:opacity-30 transition-all shadow-lg"
                title="Continuar"
              >
                <Play size={20} fill="currentColor" />
              </button>
              <button
                disabled={!isPlaying || isPaused}
                onClick={handlePause}
                className="w-10 h-10 rounded-full bg-amber-600 hover:bg-amber-500 flex items-center justify-center text-white disabled:opacity-30 transition-all shadow-lg"
                title="Pausar"
              >
                <Pause size={20} fill="currentColor" />
              </button>
              <button
                disabled={!isPlaying}
                onClick={handleStop}
                className="w-10 h-10 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center text-white disabled:opacity-30 transition-all shadow-lg"
                title="Parar"
              >
                <Square size={20} fill="currentColor" />
              </button>
              {!isPlaying && (
                <div className="flex items-center gap-3">
                  <button
                    disabled={!canStartReading}
                    onClick={handleStartPlayback}
                    className="px-6 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    <Play size={16} /> Iniciar Leitura
                  </button>
                  {!canStartReading && isProcessing && (
                    <span className="text-[10px] text-slate-500 font-bold uppercase animate-pulse">
                      Aguarde {Math.round(30 - progress)}% para liberar
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
                <Sparkles size={16} className="text-amber-400" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-bold leading-none mb-1">Narração Realista</span>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="bg-transparent border-none text-xs text-white focus:outline-none p-0 cursor-pointer"
                  >
                    {Object.values(VoiceName).map(v => (
                      <option key={v} value={v} className="bg-slate-900">{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
                <Wand2 size={16} className="text-indigo-400" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-bold leading-none mb-1">Estilo de Leitura</span>
                  <select
                    value={readingStyle}
                    onChange={(e) => setReadingStyle(e.target.value as ToneType)}
                    className="bg-transparent border-none text-xs text-white focus:outline-none p-0 cursor-pointer"
                  >
                    {Object.values(ToneType).filter(t => t !== ToneType.Sales).map(style => (
                      <option key={style} value={style} className="bg-slate-900">{style}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4 border-l border-slate-800 pl-4">
                <div className="flex items-center gap-2">
                  <Volume2 size={16} className="text-slate-500" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-20 accent-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <FastForward size={16} className="text-slate-500" />
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={rate}
                    onChange={(e) => setRate(parseFloat(e.target.value))}
                    className="w-16 accent-indigo-500"
                  />
                  <span className="text-xs text-slate-400 w-8">{rate}x</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
          {/* PDF Viewer */}
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                <FileText size={14} /> Pré-visualização do PDF
              </h3>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-[10px] text-slate-500">
                    {extractedText.length}/{totalPages} Páginas carregadas
                  </div>
                  {isProcessing && (
                    <div className="w-24 h-1 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                      <div 
                        className="h-full bg-indigo-500 transition-all duration-300" 
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>
            </div>
            <div className="flex-grow bg-slate-950 p-2 overflow-auto custom-scrollbar">
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-full border-none rounded-lg"
                  title="PDF View"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-4">
                  <FileText size={48} className="opacity-20" />
                  <p className="text-sm">Insira uma URL de PDF para visualizar</p>
                </div>
              )}
            </div>
          </div>

          {/* Text/Transcription & Current Reading */}
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                <RotateCcw size={14} /> Texto Processado
              </h3>
                {isPlaying && !isPaused && (
                  <div className="text-[10px] text-indigo-400 flex items-center gap-2">
                    {isSynthesizing ? (
                      <>
                        <Loader2 size={10} className="animate-spin" />
                        Gerando áudio realista...
                      </>
                    ) : (
                      <>
                        <Sparkles size={10} className="animate-pulse" />
                        Lendo em voz alta...
                      </>
                    )}
                  </div>
                )}
            </div>
            <div className="flex-grow bg-slate-950 p-6 overflow-y-auto custom-scrollbar">
              {extractedText.length > 0 ? (
                <div className="space-y-4">
                  {extractedText.map((pageText, pIdx) => (
                    <div key={pIdx} className="relative group">
                      <div className="absolute -left-3 top-0 bottom-0 w-0.5 bg-slate-800 group-hover:bg-indigo-500 transition-colors"></div>
                      <span className="text-[10px] text-slate-600 font-mono mb-2 block uppercase">Página {pIdx + 1}</span>
                      <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
                        {pageText}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-4">
                  <Loader2 size={48} className={`opacity-20 ${isProcessing ? 'animate-spin' : ''}`} />
                  <p className="text-sm">O texto extraído aparecerá aqui</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PDFAudioModule;
