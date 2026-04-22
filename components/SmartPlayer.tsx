
import React, { useState, useRef, useEffect } from 'react';
import { Radio, Upload, Play, Pause, SkipForward, Mic2, Clock, Youtube, Trash2, Link, Smartphone, Music, CheckSquare, Square, Lock, Sliders, Volume2, CloudUpload, Repeat, Repeat1, Shuffle, FileAudio, Check, AlertCircle, Loader2 } from 'lucide-react';
import { AudioItem, UserRole } from '../types';
import { isSmartPlayerUnlocked } from '../services/monetizationService';
import { usePlatformDetection } from '../hooks/usePlatformDetection';
import { getCorporatePlaylist, saveCorporatePlaylist } from '../services/corporateService';
import { generateSpeech } from '../services/geminiService';
import { decodeAudioData, audioBufferToWav } from '../utils/audioUtils';
import { VIGNETTE_TEXT } from '../constants';

interface Track {
  id: string;
  type: 'file' | 'youtube' | 'spotify';
  name: string;
  src: string; 
  thumbnail?: string;
}

interface UploadedNarrationFile {
    id: string;
    name: string;
    buffer: AudioBuffer;
}

interface PendingFile {
    name: string;
    buffer: AudioBuffer;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

import { createTimerWorker } from '../utils/workerUtils';

interface SmartPlayerProps {
  audioContext: AudioContext | null;
  initAudioContext: () => AudioContext;
  narrationHistory: AudioItem[];
  userRole?: UserRole;
}

const SmartPlayer: React.FC<SmartPlayerProps> = ({ audioContext, initAudioContext, narrationHistory, userRole = 'user' }) => {
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVignettePlaying, setIsVignettePlaying] = useState(false);
  const [isYtReady, setIsYtReady] = useState(false);
  const hasPlayedVignetteRef = useRef(false);
  const vignetteBufferRef = useRef<AudioBuffer | null>(null);

  const [loopMode, setLoopMode] = useState<'off' | 'all' | 'one'>('all');
  const [isShuffle, setIsShuffle] = useState(false);
  const [webInput, setWebInput] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(60); 
  const [isSmartEqEnabled, setIsSmartEqEnabled] = useState(true);
  const [narrationSource, setNarrationSource] = useState<'history' | 'upload'>('history');
  const [uploadedNarrations, setUploadedNarrations] = useState<UploadedNarrationFile[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingFile[]>([]);
  const [isProcessingUploads, setIsProcessingUploads] = useState(false);
  const [selectedNarrationIds, setSelectedNarrationIds] = useState<string[]>([]);
  const [nextNarrationTimeDisplay, setNextNarrationTimeDisplay] = useState<string>('--:--');
  const [isNarratingUI, setIsNarratingUI] = useState(false);
  
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isNarratingRef = useRef(false);
  const nextNarrationTimeRef = useRef<number>(0);
  const hasFadedOutRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const narrationSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const narrationsSinceVignetteRef = useRef(0);

  const { isIOS } = usePlatformDetection();
  const isPremium = isSmartPlayerUnlocked();
  const isSmartEqEnabledRef = useRef(isSmartEqEnabled);
  const isCorpAdmin = userRole === 'corporate-admin';
  const isCorpUser = userRole === 'corporate-user';
  const isCorporateMode = isCorpAdmin || isCorpUser;
  const currentTrack = playlist[currentTrackIndex];

  useEffect(() => {
    isSmartEqEnabledRef.current = isSmartEqEnabled;
  }, [isSmartEqEnabled]);

  const isPlayingRef = useRef(isPlaying);
  const isVignettePlayingRef = useRef(isVignettePlaying);
  const intervalSecondsRef = useRef(intervalSeconds);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isVignettePlayingRef.current = isVignettePlaying;
  }, [isVignettePlaying]);

  useEffect(() => {
    const oldInterval = intervalSecondsRef.current;
    intervalSecondsRef.current = intervalSeconds;
    
    // Se o novo intervalo for menor que o tempo restante, antecipa a próxima narração
    const now = Date.now();
    const remainingMs = nextNarrationTimeRef.current - now;
    if (remainingMs > intervalSeconds * 1000) {
        nextNarrationTimeRef.current = now + (intervalSeconds * 1000);
        hasFadedOutRef.current = false;
    }
  }, [intervalSeconds]);

  useEffect(() => {
    if (isPlaying && !workerRef.current && !isVignettePlaying) {
        startScheduler();
    } else if (!isPlaying && workerRef.current) {
        stopScheduler();
    }
  }, [isPlaying, isVignettePlaying]);

  useEffect(() => {
    const ctx = initAudioContext();
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audioElRef.current = audio;

    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = 1.2; 
    source.connect(gain);
    gain.connect(ctx.destination);
    gainNodeRef.current = gain;

    // Inicialização segura da API do YouTube
    (window as any).onYouTubeIframeAPIReady = () => {
        initYoutubePlayer();
    };

    if (!(window as any).YT || !(window as any).YT.Player) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    } else {
        initYoutubePlayer();
    }
    
    if (isCorporateMode) syncCorporatePlaylist();

    // Voice Command Listeners
    const onVoicePlay = () => {
        if (!isPlayingRef.current) handleMainPlay();
    };
    const onVoicePause = () => {
        if (isPlayingRef.current) handleMainPlay();
    };

    window.addEventListener('voxgen-play', onVoicePlay);
    window.addEventListener('voxgen-pause', onVoicePause);

    return () => {
      audio.pause();
      if (ytPlayerRef.current) {
          try { ytPlayerRef.current.destroy(); } catch(e){}
          ytPlayerRef.current = null;
      }
      setIsYtReady(false);
      stopScheduler();
      window.removeEventListener('voxgen-play', onVoicePlay);
      window.removeEventListener('voxgen-pause', onVoicePause);
    };
  }, []); // Run only once on mount

  useEffect(() => {
    const loadVignette = async () => {
        if (vignetteBufferRef.current) return;
        try {
            const ctx = initAudioContext();
            const base64 = await generateSpeech(VIGNETTE_TEXT, 'Kore');
            const buffer = await decodeAudioData(base64, ctx);
            vignetteBufferRef.current = buffer;
        } catch (e) { console.warn("Failed to preload vignette", e); }
    };
    loadVignette();
  }, []); 

  const syncCorporatePlaylist = () => {
      const corpTracks = getCorporatePlaylist();
      if (corpTracks.length > 0) setPlaylist(corpTracks);
  };

    const initYoutubePlayer = () => {
    console.log("[YouTube] Tentando inicializar player...");
    if (window.YT && window.YT.Player && !ytPlayerRef.current) {
        try {
            const playerElement = document.getElementById('youtube-player-hidden');
            if (!playerElement) {
                console.error("[YouTube] Elemento placeholder não encontrado!");
                return;
            }

            ytPlayerRef.current = new window.YT.Player('youtube-player-hidden', {
                height: '64', width: '64', // Pequeno mas não invisível para evitar bloqueios
                playerVars: { 
                    'autoplay': 1, 
                    'controls': 0, 
                    'disablekb': 1,
                    'modestbranding': 1,
                    'iv_load_policy': 3,
                    'rel': 0
                },
                events: { 
                    'onReady': () => { 
                        console.log("[YouTube] OnReady disparado!");
                        setIsYtReady(true);
                    },
                    'onStateChange': onPlayerStateChange,
                    'onError': (e: any) => {
                        console.error("[YouTube] Erro no player:", e.data);
                        // Se falhou o carregamento, pula para a próxima
                        handleNextTrack();
                    }
                }
            });
        } catch(e) { 
            console.error("[YouTube] Erro na construção do player:", e); 
        }
    } else {
        console.log(`[YouTube] Condições não atendidas: YT=${!!window.YT}, Player=${!!window.YT?.Player}, active=${!!ytPlayerRef.current}`);
    }
  };

  const onPlayerStateChange = (event: any) => {
      if (event.data === window.YT.PlayerState.ENDED) {
          handleNextTrack();
      }
  };

  useEffect(() => {
    if (!currentTrack) return;
    if (isPlaying && !isVignettePlaying) {
        playTrack(currentTrack);
        startScheduler();
    }
  }, [currentTrackIndex]); 

    useEffect(() => {
      if (isYtReady && isPlaying && currentTrack?.type === 'youtube' && !isVignettePlaying) {
          console.log("[YouTube] Sincronização reativa: Play");
          playTrack(currentTrack);
      }
    }, [isYtReady, isPlaying, currentTrackIndex, isVignettePlaying]);

  const handleMainPlay = async () => {
      const ctx = initAudioContext();

      if (isPlaying) {
          setIsPlaying(false);
          
          if (narrationSourceNodeRef.current) {
              try {
                  narrationSourceNodeRef.current.stop();
              } catch (e) {
                  console.warn("Erro ao parar narração:", e);
              }
              narrationSourceNodeRef.current = null;
          }
          isNarratingRef.current = false;
          setIsNarratingUI(false);
          
          restoreVolume(0.1);

          if (ctx.state === 'running') await ctx.suspend();
          pauseTrack();
          stopScheduler();
          return;
      }

      if (ctx.state === 'suspended') await ctx.resume();

      // Lógica de Vinheta Aleatória no Início ou sequência
      const shouldPlayVignette = Math.random() > 0.7 || !hasPlayedVignetteRef.current;
      
      if (shouldPlayVignette) {
          playVignette();
      } else {
          setIsPlaying(true);
          if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
          startScheduler();
      }
  };

  const playVignette = async () => {
      const ctx = initAudioContext();
      
      // Se não temos a vinheta carregada, tentamos carregar agora
      if (!vignetteBufferRef.current) {
          console.log("[SmartPlayer] Vinheta não encontrada em cache. Tentando carregar...");
          try {
              const base64 = await generateSpeech(VIGNETTE_TEXT, 'Kore');
              const buffer = await decodeAudioData(base64, ctx);
              vignetteBufferRef.current = buffer;
          } catch (e) {
              console.error("[SmartPlayer] Falha ao carregar vinheta sob demanda", e);
              setIsPlaying(true); 
              if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
              return;
          }
      }

      console.log("[SmartPlayer] Iniciando reprodução da vinheta...");
      setIsPlaying(true);
      setIsVignettePlaying(true);
      
      const source = ctx.createBufferSource();
      source.buffer = vignetteBufferRef.current;
      source.connect(ctx.destination);
      source.onended = () => {
          console.log("[SmartPlayer] Vinheta finalizada.");
          setIsVignettePlaying(false);
          hasPlayedVignetteRef.current = true;
          if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
          startScheduler();
      };
      
      try {
        source.start(0);
      } catch(e) {
        console.error("[SmartPlayer] Erro fatal na reprodução da vinheta", e);
        setIsVignettePlaying(false);
        if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
      }
  };

  const playTrack = (track: Track) => {
      if (!track || !track.src || isVignettePlaying) return;
      
      // Pausar outros meios para evitar sobreposição
      if (track.type !== 'file') {
          audioElRef.current?.pause();
      }
      if (track.type !== 'youtube') {
          try { ytPlayerRef.current?.pauseVideo(); } catch(e){}
      }
      
      if (isCorpUser && isIOS && track.type === 'youtube') {
          setIsPlaying(false);
          alert("Aviso iOS: YouTube não suporta autoplay em modo oculto. Use Spotify ou Arquivos de Áudio.");
          return;
      }
      
      if (track.type === 'file') {
          if (audioElRef.current) {
              if (audioElRef.current.src !== track.src) audioElRef.current.src = track.src;
              if (gainNodeRef.current) {
                  // Respeita se houver uma narração em curso
                  gainNodeRef.current.gain.value = isNarratingRef.current ? 0.15 : 1.2;
              }
              
              audioElRef.current.onerror = () => {
                  console.error("Erro no arquivo de áudio, pulando...");
                  handleNextTrack();
              };
              
              audioElRef.current.play().catch(e => {
                  console.error("Can't play audio file", e);
                  handleNextTrack();
              });
              audioElRef.current.onended = handleNextTrack;
          }
      } else if (track.type === 'youtube') {
          if (ytPlayerRef.current && isYtReady) {
               try {
                   const player = ytPlayerRef.current;
                   console.log(`[YouTube] playTrack: id=${track.src}, isReady=${isYtReady}`);

                   if (typeof player.loadVideoById !== 'function') {
                       console.warn("[YouTube] API carregada mas loadVideoById não é função.");
                       return;
                   }

                   const currentVideoUrl = player.getVideoUrl?.() || "";
                   if (!currentVideoUrl.includes(track.src)) {
                       player.loadVideoById(track.src);
                   } else {
                       const state = player.getPlayerState?.();
                       if (state !== 1) player.playVideo();
                   }
                   if (player.setVolume) {
                       player.setVolume(isNarratingRef.current ? 15 : 100);
                   }
                   if (player.unMute) player.unMute();
               } catch(e) {
                   console.error("Erro ao reproduzir YouTube", e);
               }
          }
      }
  };

  const pauseTrack = () => {
      audioElRef.current?.pause();
      try { ytPlayerRef.current?.pauseVideo(); } catch(e){}
  };

  const handleNextTrack = () => {
      if (playlist.length === 0) return;

      // Sorteia vinheta aleatória entre faixas (20% de chance)
      const shouldPlayVignette = Math.random() > 0.8;
      if (shouldPlayVignette && !isVignettePlaying) {
          playVignette();
          return;
      }

      if (loopMode === 'one') {
          if (currentTrack) {
            if (currentTrack.type === 'file' && audioElRef.current) {
                audioElRef.current.currentTime = 0;
                audioElRef.current.play();
            } else if (currentTrack.type === 'youtube' && ytPlayerRef.current) {
                ytPlayerRef.current.seekTo(0);
                ytPlayerRef.current.playVideo();
            } else {
                playTrack(currentTrack);
            }
          }
          return;
      }

      if (isShuffle) {
          const rand = Math.floor(Math.random() * playlist.length);
          setCurrentTrackIndex(rand);
          return;
      }

      if (currentTrackIndex < playlist.length - 1) {
          setCurrentTrackIndex(prev => prev + 1);
      } else {
          if (loopMode === 'all') {
              setCurrentTrackIndex(0);
          } else {
              setIsPlaying(false);
          }
      }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const files: File[] = Array.from(e.target.files);
          if (files.length > 10) {
              alert("Por favor, selecione no máximo 10 arquivos de uma vez.");
              return;
          }
          setIsProcessingUploads(true);
          const ctx = initAudioContext();
          const newPendingFiles: PendingFile[] = [];
          try {
              for (const file of files) {
                  try {
                      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
                      newPendingFiles.push({ name: file.name.replace(/\.[^/.]+$/, ""), buffer });
                  } catch(err) { console.error(`Erro ao processar ${file.name}`, err); }
              }
              if (newPendingFiles.length > 0) setPendingUploads(newPendingFiles);
              else alert("Não foi possível processar os arquivos de áudio.");
          } catch (error) { alert("Erro durante o upload múltiplo."); } finally { setIsProcessingUploads(false); }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmUpload = (target: 'playlist' | 'narration') => {
      if (pendingUploads.length === 0) return;
      if (target === 'playlist') {
          const newTracks: Track[] = pendingUploads.map(file => {
              const blob = audioBufferToWav(file.buffer);
              const url = URL.createObjectURL(blob);
              return { id: crypto.randomUUID(), type: 'file', name: file.name, src: url };
          });
          setPlaylist(prev => [...prev, ...newTracks]);
      } else {
          const remainingSlots = 10 - uploadedNarrations.length;
          if (remainingSlots <= 0) {
               alert("Limite de 10 narrações atingido.");
               setPendingUploads([]);
               return;
          }
          let filesToAdd = pendingUploads;
          if (pendingUploads.length > remainingSlots) {
              alert(`Adicionando apenas ${remainingSlots}.`);
              filesToAdd = pendingUploads.slice(0, remainingSlots);
          }
          const newNarrations: UploadedNarrationFile[] = filesToAdd.map(file => ({
              id: crypto.randomUUID(), name: file.name, buffer: file.buffer
          }));
          setUploadedNarrations(prev => [...prev, ...newNarrations]);
          setSelectedNarrationIds(prev => [...prev, ...newNarrations.map(n => n.id)]);
          setNarrationSource('upload');
      }
      setPendingUploads([]);
  };

  useEffect(() => {
    // Media Session API for background media display
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.name,
        artist: 'VoxGen AI Player',
        album: 'Radio Studio',
        artwork: [
          { src: 'https://ais-pre-22xne2xutkbprprvr3s6kr-207718158227.us-east1.run.app/icon.svg', sizes: '512x512', type: 'image/svg+xml' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', handleMainPlay);
      navigator.mediaSession.setActionHandler('pause', handleMainPlay);
      navigator.mediaSession.setActionHandler('nexttrack', handleNextTrack);
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (currentTrackIndex > 0) setCurrentTrackIndex(prev => prev - 1);
      });
    }
  }, [currentTrack]);

  const startScheduler = () => {
      if (workerRef.current) workerRef.current.terminate();
      workerRef.current = createTimerWorker();
      
      const now = Date.now();
      // Se o tempo da próxima narração for inválido ou já passou, define um novo
      if (!nextNarrationTimeRef.current || nextNarrationTimeRef.current < now) {
           nextNarrationTimeRef.current = now + (intervalSecondsRef.current * 1000);
           hasFadedOutRef.current = false;
      }

      workerRef.current.onmessage = () => {
          const currentTime = Date.now();
          const remainingMs = nextNarrationTimeRef.current - currentTime;
          const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
          
          setNextNarrationTimeDisplay(remainingSec > 60 
            ? `${Math.floor(remainingSec/60)}m ${remainingSec%60}s` 
            : `${remainingSec}s`
          );
          
          // Só processa ducking e play se estiver tocando e não estiver em vinheta
          if (isPlayingRef.current && !isVignettePlayingRef.current) {
              if (remainingMs <= 3500 && remainingMs > 0 && !hasFadedOutRef.current) {
                   lowerVolume(3.0);
                   hasFadedOutRef.current = true;
              }
              
              if (currentTime >= nextNarrationTimeRef.current && !isNarratingRef.current) {
                  playNarration();
              }

              // Watchdog: Se por algum motivo o tempo passou de 10 segundos da narração e nada aconteceu
              // Reinicia o ciclo para não ficar travado em 0s
              if (currentTime > nextNarrationTimeRef.current + 10000 && !isNarratingRef.current) {
                  console.warn("[SmartPlayer] Watchdog: Narração atrasada, reiniciando timer.");
                  nextNarrationTimeRef.current = currentTime + (intervalSecondsRef.current * 1000);
                  hasFadedOutRef.current = false;
              }
          }
      };

      workerRef.current.postMessage({ action: 'start', ms: 500 });
  };

  const stopScheduler = () => { 
    if (workerRef.current) {
        workerRef.current.postMessage({ action: 'stop' });
        workerRef.current.terminate();
        workerRef.current = null;
    }
  };

  const playNarration = () => {
      const ctx = initAudioContext(); 
      let buffer: AudioBuffer | null = null;
      if (!isPremium && narrationsSinceVignetteRef.current >= 4 && vignetteBufferRef.current) {
          buffer = vignetteBufferRef.current;
          narrationsSinceVignetteRef.current = 0;
      } else {
          // Fallback: If no selected narrations match history, use ANY available narration
          let targetIds = selectedNarrationIds;
          let availableIds = targetIds.filter(id => 
            narrationHistory.some(n => n.id === id) || 
            uploadedNarrations.some(u => u.id === id)
          );

          if (availableIds.length === 0) {
            // Pick everything available as a recovery mechanism
            availableIds = [
                ...narrationHistory.map(n => n.id),
                ...uploadedNarrations.map(u => u.id)
            ];
          }
          
          if (availableIds.length > 0) {
              const randomId = availableIds[Math.floor(Math.random() * availableIds.length)];
              const historyItem = narrationHistory.find(n => n.id === randomId);
              if (historyItem) {
                  buffer = historyItem.audioData;
              } else {
                  const uploadItem = uploadedNarrations.find(u => u.id === randomId);
                  if (uploadItem) buffer = uploadItem.buffer;
              }
              if (buffer && !isPremium) narrationsSinceVignetteRef.current += 1;
          }
      }
      if (!buffer) {
          nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
          hasFadedOutRef.current = false;
          restoreVolume(1.0);
          return;
      }
      isNarratingRef.current = true;
      setIsNarratingUI(true); 
      console.log("[SmartPlayer] Iniciando narração, abaixando volume...");
      if (!hasFadedOutRef.current) lowerVolume(0.5);
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const voiceGain = ctx.createGain();
      
      // Aumentar narração para destaque
      voiceGain.gain.value = isSmartEqEnabledRef.current ? 1.6 : 1.0; 

      if (isSmartEqEnabledRef.current) {
          // Efeito Stereo Widening (Haas Effect)
          const splitter = ctx.createChannelSplitter(2);
          const merger = ctx.createChannelMerger(2);
          const delay = ctx.createDelay();
          delay.delayTime.value = 0.020; // 20ms de atraso para o canal direito

          source.connect(splitter);
          splitter.connect(merger, 0, 0); // Canal Esquerdo (Direto)
          splitter.connect(delay, 0);    // Canal Direito (via Delay)
          delay.connect(merger, 0, 1);
          merger.connect(voiceGain);
      } else {
          source.connect(voiceGain);
      }

      voiceGain.connect(ctx.destination);
      narrationSourceNodeRef.current = source;
      
      source.onended = () => {
          console.log("[SmartPlayer] Narração finalizada. Restaurando volume...");
          isNarratingRef.current = false;
          setIsNarratingUI(false); 
          restoreVolume(2.5); // Restaura um pouco mais rápido
          nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
          hasFadedOutRef.current = false;
      };
      
      try {
          source.start(0);
      } catch (e) {
          console.error("[SmartPlayer] Erro ao iniciar narração:", e);
          isNarratingRef.current = false;
          setIsNarratingUI(false);
          restoreVolume(1.0);
          nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
          hasFadedOutRef.current = false;
      }
  };

  const lowerVolume = (duration: number = 3.0) => {
      if (!isSmartEqEnabledRef.current) return;
      const ctx = initAudioContext();
      console.log(`[SmartPlayer] Ducking: baixando playlist para 15% em ${duration}s`);
      
      if (gainNodeRef.current) {
          gainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
          gainNodeRef.current.gain.setValueAtTime(gainNodeRef.current.gain.value, ctx.currentTime);
          gainNodeRef.current.gain.linearRampToValueAtTime(0.15, ctx.currentTime + duration);
      }
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getVolume === 'function') {
          const currentVol = ytPlayerRef.current.getVolume();
          fadeYouTubeVolume(currentVol, 15, duration * 1000);
      }
  };

  const restoreVolume = (duration: number = 2.5) => {
      if (!isSmartEqEnabledRef.current) return;
      const ctx = initAudioContext();
      console.log(`[SmartPlayer] Ducking: restaurando playlist para 100% em ${duration}s`);
      
      if (gainNodeRef.current) {
          gainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
          gainNodeRef.current.gain.setValueAtTime(gainNodeRef.current.gain.value, ctx.currentTime);
          gainNodeRef.current.gain.linearRampToValueAtTime(1.2, ctx.currentTime + duration);
      }
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getVolume === 'function') {
          const currentVol = ytPlayerRef.current.getVolume();
          fadeYouTubeVolume(currentVol, 100, duration * 1000);
      }
  };

  const fadeYouTubeVolume = (startVol: number, endVol: number, durationMs: number) => {
      if (!ytPlayerRef.current?.setVolume) return;
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      const steps = 20; const stepTime = durationMs / steps; const volStep = (endVol - startVol) / steps;
      let currentVol = startVol;
      fadeIntervalRef.current = window.setInterval(() => {
          currentVol += volStep;
          if ((volStep > 0 && currentVol >= endVol) || (volStep < 0 && currentVol <= endVol)) {
              currentVol = endVol; clearInterval(fadeIntervalRef.current!);
          }
          try { ytPlayerRef.current.setVolume(currentVol); } catch(e){}
      }, stepTime);
  };

  const addWebLink = () => {
      const trimmedInput = webInput.trim();
      const ytRegExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/|live\/)|youtu\.be\/)([^"&?\/\s]{11})/;
      const spotifyRegExp = /open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/;
      if (trimmedInput.match(ytRegExp)) {
          const id = trimmedInput.match(ytRegExp)![1];
          setPlaylist(prev => [...prev, { id: crypto.randomUUID(), type: 'youtube', name: `YouTube Faixa (${id})`, src: id, thumbnail: `https://img.youtube.com/vi/${id}/0.jpg` }]);
          setWebInput('');
      } else if (trimmedInput.match(spotifyRegExp)) {
          const match = trimmedInput.match(spotifyRegExp)!;
          setPlaylist(prev => [...prev, { id: crypto.randomUUID(), type: 'spotify', name: `Spotify ${match[1]}`, src: `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`, thumbnail: '' }]);
          setWebInput('');
      } else { alert("Link inválido ou não suportado. Use links diretos de vídeo do YouTube ou faixas do Spotify."); }
  };

  const getSpotifySrc = () => {
      if (currentTrack?.type !== 'spotify') return '';
      // No modo embed do Spotify, o autoplay via URL é restrito, mas tentamos habilitar
      return isPlaying && !isVignettePlaying ? `${currentTrack.src}&autoplay=1` : currentTrack.src;
  };

  const handleToggleNarration = (id: string) => {
      if (selectedNarrationIds.includes(id)) {
          setSelectedNarrationIds(prev => prev.filter(item => item !== id));
      } else {
          if (isPremium || isCorporateMode) {
               if (selectedNarrationIds.length >= 20) { alert("Limite de seleção atingido."); return; }
               setSelectedNarrationIds(prev => [...prev, id]);
          } else {
               setSelectedNarrationIds([id]);
          }
      }
  };

  const handleRemoveNarration = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setUploadedNarrations(prev => prev.filter(n => n.id !== id));
      setSelectedNarrationIds(prev => prev.filter(sid => sid !== id));
  };

  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        recordedChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        
        mediaRecorder.onstop = async () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
            const arrayBuffer = await blob.arrayBuffer();
            const ctx = initAudioContext();
            try {
                const buffer = await ctx.decodeAudioData(arrayBuffer);
                const newNarration: UploadedNarrationFile = {
                    id: crypto.randomUUID(),
                    name: `Gravação ${new Date().toLocaleTimeString()}`,
                    buffer: buffer
                };
                setUploadedNarrations(prev => [...prev, newNarration]);
                setSelectedNarrationIds(prev => [...prev, newNarration.id]);
                setNarrationSource('upload');
            } catch (err) {
                console.error("Erro ao processar gravação", err);
                alert("Erro ao processar o áudio gravado.");
            }
            
            // Stop all tracks in stream
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecordingMic(true);
    } catch (err) {
        console.error("Microfone não acessível", err);
        alert("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecordingMic) {
        mediaRecorderRef.current.stop();
        setIsRecordingMic(false);
    }
  };

  const triggerUpload = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 animate-fade-in pb-20 relative">
        <div id="youtube-player-hidden" className="fixed top-[-9999px] left-[-9999px] opacity-0 pointer-events-none"></div>
        <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleFileSelect} />
        
        {pendingUploads.length > 0 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
                <div className="bg-slate-900 border border-indigo-500 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative">
                    <button onClick={() => setPendingUploads([])} className="absolute top-4 right-4 text-slate-500 hover:text-white"><AlertCircle size={20} /></button>
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Upload size={24} className="text-indigo-400" /> Upload de Áudio</h3>
                    <div className="bg-slate-800 p-3 rounded-lg mb-6 text-sm text-slate-300">
                        <p className="font-bold text-white mb-1">{pendingUploads.length > 1 ? `${pendingUploads.length} arquivos` : pendingUploads[0].name}</p>
                        <p>Onde deseja adicionar?</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => confirmUpload('playlist')} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white py-4 rounded-xl flex flex-col items-center gap-2 transition-all hover:scale-105 group">
                            <Music size={24} className="text-green-400 group-hover:scale-110" /><span className="text-xs font-bold">Playlist</span>
                        </button>
                        <button onClick={() => confirmUpload('narration')} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white py-4 rounded-xl flex flex-col items-center gap-2 transition-all hover:scale-105 group">
                            <Mic2 size={24} className="text-cyan-400 group-hover:scale-110" /><span className="text-xs font-bold">Narrações</span>
                        </button>
                    </div>
                </div>
            </div>
        )}

        {isProcessingUploads && (
             <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                 <div className="bg-slate-900 p-6 rounded-2xl flex flex-col items-center border border-slate-700">
                     <Loader2 size={48} className="text-cyan-500 animate-spin mb-4" /><p className="text-white font-bold">Processando...</p>
                 </div>
             </div>
        )}

        <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-2">
                <Radio className="text-cyan-400" /> Smart Player
                {isCorporateMode && <span className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-full uppercase ml-2">Modo Empresa</span>}
            </h2>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 mb-8 relative overflow-hidden min-h-[400px] flex flex-col items-center justify-center transition-all duration-500 group">
             <div className={`absolute inset-0 opacity-20 blur-3xl transition-colors duration-700 ${isNarratingRef.current ? 'bg-cyan-600' : 'bg-gradient-to-br from-cyan-500 to-blue-600'}`} />
             
             <div className="relative z-10 flex flex-col items-center w-full">
                 {currentTrack?.type === 'spotify' ? (
                     <div className="w-full max-w-md relative flex flex-col items-center">
                         <div className="relative w-full rounded-xl overflow-hidden shadow-2xl bg-black md:h-[352px]">
                             <iframe 
                                src={getSpotifySrc()} 
                                width="100%" 
                                height="100%" 
                                frameBorder="0" 
                                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                                loading="lazy" 
                                className="w-full h-full min-h-[152px]"
                             ></iframe>
                             {!isPlaying && (
                                 <div className="absolute inset-0 z-20 bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center">
                                      <button onClick={handleMainPlay} className="w-20 h-20 bg-cyan-500 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all mb-4 animate-pulse"><Play size={32} fill="black" className="ml-2" /></button>
                                      <h3 className="text-white font-bold text-lg">Iniciar Sistema</h3>
                                 </div>
                             )}
                             {isNarratingRef.current && (
                                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"><div className="bg-black/80 backdrop-blur-md rounded-2xl p-4 flex flex-col items-center border border-cyan-500/30"><Mic2 size={32} className="text-cyan-400 animate-pulse mb-2" /><span className="text-cyan-400 font-bold text-xs">Narrando...</span></div></div>
                             )}
                         </div>
                         {isPlaying && (
                            <div className="mt-6 flex items-center gap-4">
                                 <button onClick={handleMainPlay} className="px-6 py-2 bg-slate-800 text-slate-300 rounded-full text-xs font-bold border border-slate-700 flex items-center gap-2"><Pause size={14} /> Pausar Tudo</button>
                                 <button onClick={handleNextTrack} className="p-2 bg-slate-800 rounded-full text-slate-400 border border-slate-700"><SkipForward size={16} /></button>
                            </div>
                         )}
                     </div>
                 ) : (
                     <>
                        <div className="w-64 h-64 rounded-full border-4 border-slate-700/50 shadow-2xl mb-6 overflow-hidden bg-black flex items-center justify-center relative">
                             {currentTrack ? (
                                 currentTrack.type === 'youtube' ? <img src={currentTrack.thumbnail} className="w-full h-full object-cover" /> : <div className="bg-gradient-to-br from-slate-700 to-slate-800 w-full h-full flex items-center justify-center"><Mic2 size={64} className="text-slate-500 opacity-50" /></div>
                             ) : <div className="text-slate-600">Sem Faixa</div>}
                             {isNarratingRef.current && <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm"><Mic2 size={48} className="text-cyan-400 animate-pulse" /></div>}
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1 text-center line-clamp-1 max-w-md">{currentTrack?.name || (isPlaying ? "Carregando..." : "Aguardando...")}</h3>
                        
                        <div className="flex items-center gap-6 mt-6">
                             <button onClick={() => setLoopMode(prev => prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off')} className={`p-3 rounded-full transition-all ${loopMode !== 'off' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                                 {loopMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                             </button>
                             <button onClick={handleMainPlay} disabled={playlist.length === 0} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-cyan-500 text-black shadow-lg scale-105' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>
                                 {isPlaying ? <Pause size={32} fill="black" /> : <Play size={32} fill="white" className="ml-2" />}
                             </button>
                             <button onClick={handleNextTrack} className="p-4 rounded-full bg-slate-800 text-slate-400 hover:text-white"><SkipForward size={24} /></button>
                             <button onClick={() => setIsShuffle(!isShuffle)} className={`p-3 rounded-full transition-all ${isShuffle ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                                 <Shuffle size={18} />
                             </button>
                         </div>
                     </>
                 )}
                 <div className="mt-8 bg-black/30 px-6 py-2 rounded-full border border-white/5 flex items-center gap-3">
                     <Clock size={14} className="text-cyan-400" />
                     <span className="text-xs text-slate-400">Próxima Narração:</span>
                     <span className="text-sm font-mono font-bold text-white w-16 text-center">{isPlaying ? nextNarrationTimeDisplay : '--:--'}</span>
                 </div>
             </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative">
                {isCorpUser && <div className="absolute inset-0 z-10 bg-slate-900/80 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-2xl border border-indigo-500/30"><Lock className="text-indigo-400 mb-2" size={32} /><p className="text-indigo-200 font-bold">Playlist da Empresa</p></div>}
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-white font-bold flex items-center gap-2"><Upload size={18} className="text-purple-400" /> Playlist</h4>
                </div>
                <div className="space-y-4 mb-6">
                    <div className="flex gap-2">
                        <input type="text" value={webInput} onChange={(e) => setWebInput(e.target.value)} placeholder="YouTube / Spotify Link..." className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-4 text-sm text-white outline-none" />
                        <button onClick={addWebLink} className="bg-indigo-600 text-white px-4 rounded-lg"><Link size={18} /></button>
                        <button onClick={triggerUpload} className="bg-slate-700 text-white px-4 rounded-lg h-full flex items-center justify-center"><FileAudio size={18} /></button>
                    </div>
                </div>
                <div className="h-64 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                    {playlist.map((track, idx) => (
                        <div key={track.id} className={`flex items-center justify-between p-3 rounded-lg text-sm ${idx === currentTrackIndex ? 'bg-cyan-900/20 border border-cyan-500/30 text-cyan-200' : 'bg-slate-800 text-slate-300'}`}>
                            <div className="flex items-center gap-3 truncate">
                                {track.type === 'youtube' ? <Youtube size={14} className="text-red-400" /> : <Music size={14} className="text-green-400" />}
                                <span className="truncate">{track.name}</span>
                            </div>
                            <button onClick={() => setPlaylist(prev => prev.filter(t => t.id !== track.id))} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                    ))}
                    {playlist.length === 0 && (
                        <div className="text-center py-10 text-slate-500 text-xs italic">
                            Adicione links do YouTube ou Spotify acima.
                        </div>
                    )}
                </div>
            </div>
            
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative">
                 {isCorpUser && !isPremium && <div className="absolute inset-0 z-10 bg-slate-900/80 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-2xl border border-indigo-500/30"><Lock className="text-indigo-400 mb-2" size={32} /><p className="text-indigo-200 font-bold">Narração Bloqueada</p></div>}
                 <div className="flex justify-between items-center mb-4">
                     <h4 className="text-white font-bold flex items-center gap-2"><Mic2 size={18} className="text-cyan-400" /> Narração</h4>
                     <div className="flex gap-2">
                       <button 
                           onClick={isRecordingMic ? stopRecording : startRecording} 
                           className={`p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border ${isRecordingMic ? 'bg-red-500/20 text-red-500 border-red-500/50 animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border-slate-700'}`}
                       >
                           {isRecordingMic ? <Square size={16} fill="currentColor" /> : <Mic2 size={16} />}
                           {isRecordingMic ? 'Parar' : 'Gravar'}
                       </button>
                       <button onClick={triggerUpload} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-cyan-400 transition-colors flex items-center gap-2 text-xs font-bold border border-slate-700">
                           <CloudUpload size={16} /> Upload
                       </button>
                     </div>
                 </div>
                 <div className="flex bg-slate-800 p-1 rounded-lg mb-6">
                     <button onClick={() => setNarrationSource('history')} className={`flex-1 py-2 text-xs font-bold rounded-md ${narrationSource === 'history' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-400'}`}>Histórico</button>
                     <button onClick={() => setNarrationSource('upload')} className={`flex-1 py-2 text-xs font-bold rounded-md ${narrationSource === 'upload' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-400'}`}>Uploads</button>
                 </div>
                 <div className="w-full bg-slate-800 border border-slate-700 rounded-lg max-h-48 overflow-y-auto custom-scrollbar p-2 space-y-1">
                     {(narrationSource === 'history' ? narrationHistory : uploadedNarrations).map(n => { 
                         const isSelected = selectedNarrationIds.includes(n.id); 
                         const name = (n as any).text || (n as any).name || "Sem Nome";
                         return (
                             <div key={n.id} onClick={() => handleToggleNarration(n.id)} className={`flex items-start gap-3 p-2 rounded cursor-pointer text-xs group/item ${isSelected ? 'bg-cyan-900/30 border border-cyan-500/30' : 'hover:bg-slate-700 border border-transparent'}`}>
                                 <div className={`mt-0.5 ${isSelected ? 'text-cyan-400' : 'text-slate-600'}`}>{isSelected ? <CheckSquare size={14} /> : <Square size={14} />}</div>
                                 <div className="flex-grow truncate text-slate-300">{name}</div>
                                 {narrationSource === 'upload' && (
                                     <button onClick={(e) => handleRemoveNarration(n.id, e)} className="opacity-0 group-hover/item:opacity-100 p-1 text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
                                 )}
                             </div>
                         ); 
                     })}
                     {(narrationSource === 'upload' && uploadedNarrations.length === 0) && (
                         <div className="flex flex-col items-center justify-center py-6 text-slate-500 text-xs text-center px-4">
                             <CloudUpload size={24} className="mb-2 opacity-30" />
                             <p className="italic mb-3">Nenhum upload realizado.</p>
                             <button onClick={triggerUpload} className="bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/50 px-4 py-2 rounded-lg font-bold transition-all">
                                 Clique aqui para carregar
                             </button>
                         </div>
                     )}
                 </div>
                 <div className="mt-6"><div className="flex justify-between mb-2"><label className="text-xs text-slate-400">Intervalo</label><span className="text-xs font-bold text-cyan-400">{intervalSeconds}s</span></div><input type="range" min="5" max="180" step="5" value={intervalSeconds} onChange={(e) => setIntervalSeconds(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" /></div>
                 <div className="mt-6 border-t border-slate-800 pt-4">
                    <div className="flex items-center justify-between mb-2"><label className="text-xs font-bold text-slate-400 flex items-center gap-2"><Sliders size={14} /> Equalizador & Fader</label>
                        <button onClick={() => setIsSmartEqEnabled(!isSmartEqEnabled)} className={`text-[10px] px-2 py-1 rounded-full font-bold ${isSmartEqEnabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}>{isSmartEqEnabled ? 'ON' : 'OFF'}</button>
                    </div>
                    <div className="bg-slate-950 rounded-lg p-3 space-y-3">
                        <div className="flex items-center gap-3"><Music size={12} className="text-slate-500" />
                            <div className="flex-grow h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-[3000ms] ${isNarratingUI && isSmartEqEnabled ? 'w-[15%] bg-yellow-600' : 'w-[100%] bg-green-500'}`} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default SmartPlayer;
