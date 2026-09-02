
import React, { useState, useRef, useEffect } from 'react';
import { Radio, Upload, Play, Pause, SkipForward, Mic2, Clock, Youtube, Trash2, Link, Smartphone, Music, CheckSquare, Square, Lock, Sliders, Volume2, CloudUpload, Repeat, Repeat1, Shuffle, FileAudio, AlertCircle, Loader2, Search, Star } from 'lucide-react';
import { AudioItem, UserRole, UserFeedback } from '../types';
import { isSmartPlayerUnlocked, getUserStatus } from '../services/monetizationService';
import { usePlatformDetection } from '../hooks/usePlatformDetection';
import { getCorporatePlaylist, saveCorporatePlaylist } from '../services/corporateService';
import { generateSpeech } from '../services/geminiService';
import { buscarYouTube, YouTubeSearchResult, getYouTubeMetadata, extractYouTubeVideoId, extractYouTubePlaylistId } from '../services/youtubeService';
import { decodeAudioData, audioBufferToWav } from '../utils/audioUtils';
import { VIGNETTE_TEXT } from '../constants';
import { getAllFeedbacks } from '../services/analyticsService';

interface Track {
  id: string;
  type: 'file' | 'youtube' | 'spotify';
  name: string;
  src: string; 
  thumbnail?: string;
  isPlaylist?: boolean;
  playlistId?: string;
}

interface UploadedNarrationFile {
    id: string;
    name: string;
    buffer?: AudioBuffer;
    file?: File;
}

interface PendingFile {
    name: string;
    buffer?: AudioBuffer;
    file?: File;
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
  userEmail?: string;
  companyName?: string;
}

const SmartPlayer: React.FC<SmartPlayerProps> = ({ 
  audioContext, 
  initAudioContext, 
  narrationHistory, 
  userRole = 'user',
  userEmail,
  companyName
}) => {
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVignettePlaying, setIsVignettePlaying] = useState(false);
  const [isYtReady, setIsYtReady] = useState(false);
  const hasPlayedVignetteRef = useRef(false);
  const vignetteBufferRef = useRef<AudioBuffer | null>(null);

  // Buffer preload and state control additions
  const [isBuffering, setIsBuffering] = useState(false);
  const preloadedCacheRef = useRef<Record<string, { blobUrl?: string, buffer?: AudioBuffer, status: 'loading' | 'loaded' | 'error' }>>({});
  const lastLoadedSrcRef = useRef<string | null>(null);

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
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearchingYT, setIsSearchingYT] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [nextNarrationTimeDisplay, setNextNarrationTimeDisplay] = useState<string>('--:--');
  const [isNarratingUI, setIsNarratingUI] = useState(false);
  const [highlightedFeedbacks, setHighlightedFeedbacks] = useState<UserFeedback[]>([]);
  const [currentFeedbackIndex, setCurrentFeedbackIndex] = useState(0);
  
  const [isBackgroundPlayEnabled, setIsBackgroundPlayEnabled] = useState(true);
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);
  const [ytErrorMessage, setYtErrorMessage] = useState<string | null>(null);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const narrationAudioElRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerWrapperRef = useRef<HTMLDivElement | null>(null);
  const pendingYtTrackRef = useRef<Track | null>(null);
  const currentTrackRef = useRef<Track | null>(null);
  const currentYtVideoIdRef = useRef<string | null>(null);
  const trackGainNodeRef = useRef<GainNode | null>(null); // Renamed from gainNodeRef for clarity
  const masterBusGainRef = useRef<GainNode | null>(null);
  const limiterNodeRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isNarratingRef = useRef(false);
  const nextNarrationTimeRef = useRef<number>(0);
  const hasFadedOutRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const narrationSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const fadeAudioElementIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const narrationsSinceVignetteRef = useRef(0);
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.warn("[WakeLock] Lock de tela não suportado ou bloqueado", err);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch (e) { void e; }
      wakeLockRef.current = null;
    }
  };

  const { isIOS } = usePlatformDetection();
  const [isPremium, setIsPremium] = useState(false);
  const isSmartEqEnabledRef = useRef(isSmartEqEnabled);
  const isSuperAdmin = userEmail === 'limadan389@gmail.com';
  const isCorpAdmin = userRole === 'corporate-admin';
  const isCorpUser = userRole === 'corporate-user';
  const isCorporateMode = isCorpAdmin || isCorpUser;
  const hasActivePlan = isPremium || isCorporateMode || userRole === 'admin' || isSuperAdmin;
  const currentTrack = playlist[currentTrackIndex];

  async function loadFeedbacks() {
    try {
      const all = await getAllFeedbacks();
      setHighlightedFeedbacks(all.filter(f => f.isHighlighted));
    } catch (e) { console.warn("Failed to load feedbacks for player", e); }
  }

  const isPlayingRef = useRef(isPlaying);
  const isVignettePlayingRef = useRef(isVignettePlaying);
  const intervalSecondsRef = useRef(intervalSeconds);

  isPlayingRef.current = isPlaying;
  isVignettePlayingRef.current = isVignettePlaying;
  intervalSecondsRef.current = intervalSeconds;
  currentTrackRef.current = currentTrack;



 

  useEffect(() => {
    if (!canvasRef.current || !analyserRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let animationId: number;
    
    const draw = () => {
        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            
            // Create gradient based on mood/state
            const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
            if (isNarratingRef.current) {
                gradient.addColorStop(0, '#0891b2'); // cyan-600
                gradient.addColorStop(1, '#67e8f9'); // cyan-300
            } else {
                gradient.addColorStop(0, '#4f46e5'); // indigo-600
                gradient.addColorStop(1, '#818cf8'); // indigo-400
            }
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
    };
    
    draw();
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying]);

  async function syncCorporatePlaylist(companyId: string) {
      const corpTracks = await getCorporatePlaylist(companyId);
      if (corpTracks.length > 0) setPlaylist(corpTracks);
  }

  function initYoutubePlayer() {
    console.log("[YouTube] Tentando inicializar player...");
    if (typeof window === 'undefined') return;
    if (!window.YT || !window.YT.Player) {
        console.log(`[YouTube] API do YouTube ainda não carregada.`);
        return;
    }
    if (ytPlayerRef.current) {
        return;
    }

    try {
        let playerElement = document.getElementById('youtube-player-hidden');
        if (!playerElement && ytContainerWrapperRef.current) {
            ytContainerWrapperRef.current.innerHTML = '';
            playerElement = document.createElement('div');
            playerElement.id = 'youtube-player-hidden';
            playerElement.className = 'w-full h-full';
            ytContainerWrapperRef.current.appendChild(playerElement);
        }

        if (!playerElement) {
            console.error("[YouTube] Elemento placeholder não encontrado!");
            return;
        }

        ytPlayerRef.current = new window.YT.Player('youtube-player-hidden', {
            height: '100%', 
            width: '100%',
            playerVars: { 
                autoplay: 1, 
                controls: 1, 
                disablekb: 0,
                enablejsapi: 1,
                modestbranding: 1,
                iv_load_policy: 3,
                playsinline: 1,
                rel: 0,
                origin: window.location.origin
            },
            events: { 
                onReady: () => { 
                    console.log("[YouTube] OnReady disparado com sucesso!");
                    setIsYtReady(true);
                    setYtErrorMessage(null);
                    if (pendingYtTrackRef.current) {
                        const queued = pendingYtTrackRef.current;
                        pendingYtTrackRef.current = null;
                        playTrack(queued);
                    } else if (isPlayingRef.current && currentTrackRef.current?.type === 'youtube') {
                        playTrack(currentTrackRef.current);
                    }
                },
                onStateChange: onPlayerStateChange,
                onError: (e: any) => {
                    console.error("[YouTube] Erro no player:", e.data);
                    setIsBuffering(false);
                    let msg = "Falha ao reproduzir faixa do YouTube.";
                    if (e.data === 101 || e.data === 150) {
                        msg = "Este vídeo do YouTube não permite reprodução incorporada em apps externos.";
                    } else if (e.data === 100) {
                        msg = "Vídeo do YouTube não encontrado ou excluído.";
                    } else if (e.data === 2) {
                        msg = "Parâmetro ou ID do YouTube inválido.";
                    }
                    setYtErrorMessage(msg);
                    setTimeout(() => {
                        setYtErrorMessage(null);
                        handleNextTrack();
                    }, 2500);
                }
            }
        });
    } catch(e) { 
        console.error("[YouTube] Erro na construção do player:", e); 
    }
  }

  const onPlayerStateChange = (event: any) => {
      if (!window.YT) return;
      if (event.data === window.YT.PlayerState.PLAYING) {
          setIsBuffering(false);
          setYtErrorMessage(null);
      } else if (event.data === window.YT.PlayerState.BUFFERING) {
          setIsBuffering(true);
      } else if (event.data === window.YT.PlayerState.ENDED) {
          setIsBuffering(false);
          handleNextTrack();
      }
  };



  const getRandomFloat = () => {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] / 4294967296;
  };

  function handleMainPlay() {
      const ctx = initAudioContext();

      if (isPlaying) {
          setIsPlaying(false);
          
          if (narrationSourceNodeRef.current) {
              try { narrationSourceNodeRef.current.stop(); } catch (e) { void e; }
              narrationSourceNodeRef.current = null;
          }
          isNarratingRef.current = false;
          setIsNarratingUI(false);
          
          restoreVolume(0.1);

          if (ctx.state === 'running') ctx.suspend();
          pauseTrack();
          stopScheduler();
          releaseWakeLock();
          if ('mediaSession' in navigator) {
              navigator.mediaSession.playbackState = 'paused';
          }
          return;
      }

      if (ctx.state === 'suspended') ctx.resume();

      // Desbloqueia ambos os elementos de áudio no gesto do usuário para execução sem restrição em segundo plano
      if (narrationAudioElRef.current) {
          narrationAudioElRef.current.play().then(() => {
              narrationAudioElRef.current?.pause();
          }).catch(() => {});
      }

      setIsPlaying(true);
      requestWakeLock();
      if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
      }

      // Lógica de Vinheta Aleatória: Toca apenas para usuários Free
      const shouldPlayVignette = !hasActivePlan && (getRandomFloat() > 0.7 || !hasPlayedVignetteRef.current);
      
      if (shouldPlayVignette) {
          playVignette().catch(err => {
              console.error("Vignette play error:", err);
          });
      } else {
          if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
          startScheduler();
      }
  }

  const playVignetteWebAudio = (ctx: AudioContext) => {
      if (!vignetteBufferRef.current) return;
      const source = ctx.createBufferSource();
      source.buffer = vignetteBufferRef.current;
      
      if (masterBusGainRef.current) {
          source.connect(masterBusGainRef.current);
      } else {
          source.connect(ctx.destination);
      }

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

  async function playVignette() {
      // Never play vignette for active plans, premium members, or admins
      if (hasActivePlan) {
          console.log("[SmartPlayer] Vinheta ignorada: Membro com plano ativo / Premium / Admin.");
          setIsVignettePlaying(false);
          if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
          startScheduler();
          return;
      }

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
              if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
              startScheduler();
              return;
          }
      }

      console.log("[SmartPlayer] Iniciando reprodução da vinheta...");
      setIsVignettePlaying(true);
      
      if (isBackgroundPlayEnabled) {
          if (narrationAudioElRef.current && vignetteBufferRef.current) {
              try {
                  const blob = audioBufferToWav(vignetteBufferRef.current);
                  const url = URL.createObjectURL(blob);
                  
                  narrationAudioElRef.current.src = url;
                  narrationAudioElRef.current.onended = () => {
                      console.log("[SmartPlayer] Vinheta em segundo plano finalizada.");
                      setIsVignettePlaying(false);
                      hasPlayedVignetteRef.current = true;
                      if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
                      startScheduler();
                      URL.revokeObjectURL(url);
                  };
                  narrationAudioElRef.current.onerror = () => {
                      setIsVignettePlaying(false);
                      if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
                      URL.revokeObjectURL(url);
                  };
                  narrationAudioElRef.current.play().catch(e => {
                      console.error("Vignette direct play error:", e);
                      setIsVignettePlaying(false);
                      if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
                      URL.revokeObjectURL(url);
                  });
              } catch (e) {
                  console.error("Failed to convert vignette buffer", e);
                  playVignetteWebAudio(ctx);
              }
          } else {
              setIsVignettePlaying(false);
              if (playlist[currentTrackIndex]) playTrack(playlist[currentTrackIndex]);
          }
      } else {
          playVignetteWebAudio(ctx);
      }
  }

  const preloadTrack = async (track: Track) => {
      if (!track || track.type !== 'file' || !track.src) return;
      if (track.src.startsWith('blob:') || track.src.startsWith('data:')) return;
      
      const cache = preloadedCacheRef.current;
      if (cache[track.src]) return;
      
      cache[track.src] = { status: 'loading' };
      console.log(`[SmartPlayer] [Preload] Começando pré-carregamento em background para: ${track.name}`);
      
      try {
          const response = await fetch(track.src);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          
          // 1. Cria Blob URL para compatibilidade nativa de segundo plano (HTML5 Audio)
          const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
          const blobUrl = URL.createObjectURL(blob);
          
          // 2. Tenta decodificar como AudioBuffer para modo Web Audio (se suportado e ativo)
          let buffer: AudioBuffer | undefined = undefined;
          try {
              const ctx = initAudioContext();
              const bufferCopy = arrayBuffer.slice(0);
              buffer = await ctx.decodeAudioData(bufferCopy);
          } catch (decodeErr) {
              console.warn(`[SmartPlayer] [Preload] Não pôde decodificar AudioBuffer para ${track.name}`, decodeErr);
          }
          
          cache[track.src] = {
              blobUrl,
              buffer,
              status: 'loaded'
          };
          console.log(`[SmartPlayer] [Preload] Pré-carregamento concluído com sucesso para: ${track.name}`);
      } catch (err) {
          console.error(`[SmartPlayer] [Preload] Erro ao pré-carregar trilha ${track.name}:`, err);
          cache[track.src] = { status: 'error' };
      }
  };

  const preloadNextTracks = () => {
      if (playlist.length === 0) return;
      
      // Pré-carrega a próxima faixa
      const nextIndex = (currentTrackIndex + 1) % playlist.length;
      const nextTrack = playlist[nextIndex];
      if (nextTrack) {
          preloadTrack(nextTrack);
      }
      
      // Pré-carrega a faixa subsequente para maior robustez
      const thirdIndex = (currentTrackIndex + 2) % playlist.length;
      const thirdTrack = playlist[thirdIndex];
      if (thirdTrack) {
          preloadTrack(thirdTrack);
      }
  };

  function playTrack(track: Track) {
      if (!track || !track.src || isVignettePlaying) return;
      
      // Se realmente trocou de faixa, reinicia o cronômetro para dar espaço para o início da nova música!
      if (lastLoadedSrcRef.current !== track.src) {
          const now = Date.now();
          nextNarrationTimeRef.current = now + (intervalSecondsRef.current * 1000);
          hasFadedOutRef.current = false;
          // Garante que o volume comece no máximo
          if (audioElRef.current) audioElRef.current.volume = 0.7;
          if (trackGainNodeRef.current) {
              const ctx = initAudioContext();
              trackGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
              trackGainNodeRef.current.gain.setValueAtTime(0.7, ctx.currentTime);
          }
      }
      
      // Pausar outros meios para evitar sobreposição
      if (track.type !== 'file') {
          audioElRef.current?.pause();
          lastLoadedSrcRef.current = null;
      }
      if (track.type !== 'youtube') {
          try { ytPlayerRef.current?.pauseVideo(); } catch (e) { void e; }
      }
      
      if (isCorpUser && isIOS && track.type === 'youtube') {
          setIsPlaying(false);
          alert("Aviso iOS: YouTube não suporta autoplay em modo oculto. Use Spotify ou Arquivos de Áudio.");
          return;
      }
      
      if (track.type === 'file') {
          if (audioElRef.current) {
              const cached = preloadedCacheRef.current[track.src];
              const playSrc = (cached && cached.status === 'loaded' && cached.blobUrl) ? cached.blobUrl : track.src;
              
              if (lastLoadedSrcRef.current !== track.src) {
                  audioElRef.current.src = playSrc;
                  lastLoadedSrcRef.current = track.src;
                  audioElRef.current.load();
              }
              
              if (trackGainNodeRef.current) {
                  // Respeita se houver uma narração em curso
                  audioElRef.current.volume = 1.0; // Web Audio controlará o ganho real
                  trackGainNodeRef.current.gain.value = isNarratingRef.current ? 0.04 : 0.7;
              } else {
                  // Direct background mode
                  audioElRef.current.volume = isNarratingRef.current ? 0.04 : 0.7;
              }
              
              // Estado de buffering/carregamento robusto
              audioElRef.current.onwaiting = () => {
                  setIsBuffering(true);
              };
              audioElRef.current.onplaying = () => {
                  setIsBuffering(false);
              };
              audioElRef.current.oncanplay = () => {
                  setIsBuffering(false);
              };
              
              audioElRef.current.onerror = () => {
                  console.error("Erro no arquivo de áudio, pulando...");
                  setIsBuffering(false);
                  handleNextTrack();
              };
              
              audioElRef.current.play().then(() => {
                  setIsBuffering(false);
                  preloadNextTracks();
              }).catch(e => {
                  console.error("Can't play audio file", e);
                  setIsBuffering(false);
                  handleNextTrack();
              });
              
              audioElRef.current.onended = () => {
                  setIsBuffering(false);
                  handleNextTrack();
              };
          }
      } else if (track.type === 'youtube') {
          setIsBuffering(true);
          setYtErrorMessage(null);

          if (!ytPlayerRef.current || !isYtReady) {
              console.log(`[YouTube] Player ainda não inicializado. Enfileirando faixa ${track.name}`);
              pendingYtTrackRef.current = track;
              initYoutubePlayer();
              return;
          }

          try {
              const player = ytPlayerRef.current;
              const isPlaylistTrack = track.isPlaylist || !!track.playlistId || track.src.startsWith('PL');
              const targetPlaylistId = track.playlistId || (track.src.startsWith('PL') ? track.src : null);

              console.log(`[YouTube] playTrack: id=${track.src}, isPlaylist=${isPlaylistTrack}, playlistId=${targetPlaylistId}`);

              if (isPlaylistTrack && targetPlaylistId) {
                  if (currentYtVideoIdRef.current !== targetPlaylistId) {
                      currentYtVideoIdRef.current = targetPlaylistId;
                      if (typeof player.loadPlaylist === 'function') {
                          player.loadPlaylist({
                              list: targetPlaylistId,
                              listType: 'playlist',
                              index: 0,
                              suggestedQuality: 'small'
                          });
                      } else if (typeof player.cuePlaylist === 'function') {
                          player.cuePlaylist({
                              list: targetPlaylistId,
                              listType: 'playlist',
                              index: 0,
                              suggestedQuality: 'small'
                          });
                          setTimeout(() => {
                              try { 
                                  player.setPlaybackQuality?.('small');
                                  player.playVideo?.(); 
                              } catch (e) { void e; }
                          }, 300);
                      }
                  } else {
                      const state = player.getPlayerState?.();
                      if (state !== 1 && state !== 3 && typeof player.playVideo === 'function') {
                          player.playVideo();
                      }
                  }
              } else {
                  if (currentYtVideoIdRef.current !== track.src) {
                      currentYtVideoIdRef.current = track.src;
                      if (typeof player.loadVideoById === 'function') {
                          player.loadVideoById({
                              videoId: track.src,
                              suggestedQuality: 'small'
                          });
                      } else if (typeof player.cueVideoById === 'function') {
                          player.cueVideoById({
                              videoId: track.src,
                              suggestedQuality: 'small'
                          });
                          setTimeout(() => {
                              try { 
                                  player.setPlaybackQuality?.('small');
                                  player.playVideo?.(); 
                              } catch (e) { void e; }
                          }, 300);
                      }
                  } else {
                      const state = player.getPlayerState?.();
                      if (state !== 1 && state !== 3 && typeof player.playVideo === 'function') {
                          player.playVideo();
                      }
                  }
              }

              try {
                  player.setPlaybackQuality?.('small');
              } catch (e) { void e; }

              if (player.setVolume) {
                  player.setVolume(isNarratingRef.current ? 10 : 100);
              }
              if (player.unMute) player.unMute();
          } catch(e) {
              console.error("Erro ao reproduzir YouTube", e);
              setIsBuffering(false);
          }
      }
  }

  const pauseTrack = () => {
      audioElRef.current?.pause();
      narrationAudioElRef.current?.pause();
      try { ytPlayerRef.current?.pauseVideo(); } catch (e) { void e; }
  };

  function handleNextTrack() {
      if (playlist.length === 0) return;

      // Sorteia vinheta aleatória entre faixas apenas para usuários Free (20% de chance)
      const shouldPlayVignette = !hasActivePlan && getRandomFloat() > 0.8;
      if (shouldPlayVignette && !isVignettePlaying) {
          playVignette().catch(err => {
              console.error("Vignette next error:", err);
          });
          return;
      }

      if (loopMode === 'one') {
          if (currentTrack) {
            if (currentTrack.type === 'file' && audioElRef.current) {
                audioElRef.current.currentTime = 0;
                audioElRef.current.play().catch(e => { console.error(e); });
            } else if (currentTrack.type === 'youtube' && ytPlayerRef.current) {
                try {
                    ytPlayerRef.current.seekTo(0);
                    ytPlayerRef.current.playVideo();
                } catch (e) { void e; }
            } else {
                playTrack(currentTrack);
            }
          }
          return;
      }

      if (isShuffle) {
          const rand = Math.floor(getRandomFloat() * playlist.length);
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
  }

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
                      let buffer: AudioBuffer | undefined = undefined;
                      try {
                          buffer = await ctx.decodeAudioData(await file.arrayBuffer());
                      } catch (decodeErr) {
                          console.warn(`[SmartPlayer] decodeAudioData falhou para ${file.name}, usando fallback nativo de arquivo.`, decodeErr);
                      }
                      newPendingFiles.push({ 
                          name: file.name.replace(/\.[^/.]+$/, ""), 
                          buffer, 
                          file 
                      });
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
          const newTracks: Track[] = pendingUploads.map(fileItem => {
              if (fileItem.file) {
                  const url = URL.createObjectURL(fileItem.file);
                  return { id: crypto.randomUUID(), type: 'file', name: fileItem.name, src: url };
              } else if (fileItem.buffer) {
                  const blob = audioBufferToWav(fileItem.buffer);
                  const url = URL.createObjectURL(blob);
                  return { id: crypto.randomUUID(), type: 'file', name: fileItem.name, src: url };
              }
              return { id: crypto.randomUUID(), type: 'file', name: fileItem.name, src: '' };
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
          const newNarrations: UploadedNarrationFile[] = filesToAdd.map(fileItem => ({
              id: crypto.randomUUID(), name: fileItem.name, buffer: fileItem.buffer, file: fileItem.file
          }));
          setUploadedNarrations(prev => [...prev, ...newNarrations]);
          setSelectedNarrationIds(prev => [...prev, ...newNarrations.map(n => n.id)]);
          setNarrationSource('upload');
      }
      setPendingUploads([]);
  };

  useEffect(() => {
    // Media Session API for background media control & OS lockscreen integration
    if (!('mediaSession' in navigator)) return;

    if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.name || 'VoxGen Radio',
        artist: 'VoxGen AI Player',
        album: isCorporateMode ? (companyName || 'Corporate Player') : 'Radio AI Studio',
        artwork: [
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' }
        ]
      });
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    const handlePlay = () => {
      if (!isPlayingRef.current) handleMainPlay();
    };
    const handlePause = () => {
      if (isPlayingRef.current) handleMainPlay();
    };
    const handleNext = () => {
      handleNextTrack();
    };
    const handlePrev = () => {
      if (currentTrackIndex > 0) setCurrentTrackIndex(prev => prev - 1);
      else if (playlist.length > 0) setCurrentTrackIndex(playlist.length - 1);
    };
    const handleSeekTo = (details: MediaSessionActionDetails) => {
      if (details.seekTime !== undefined && audioElRef.current) {
        audioElRef.current.currentTime = details.seekTime;
      }
    };
    const handleSeekBackward = (details: MediaSessionActionDetails) => {
      const skipTime = details.seekOffset || 10;
      if (audioElRef.current) {
        audioElRef.current.currentTime = Math.max(audioElRef.current.currentTime - skipTime, 0);
      }
    };
    const handleSeekForward = (details: MediaSessionActionDetails) => {
      const skipTime = details.seekOffset || 10;
      if (audioElRef.current) {
        audioElRef.current.currentTime = Math.min(
          audioElRef.current.currentTime + skipTime,
          audioElRef.current.duration || 0
        );
      }
    };

    try { navigator.mediaSession.setActionHandler('play', handlePlay); } catch (e) { void e; }
    try { navigator.mediaSession.setActionHandler('pause', handlePause); } catch (e) { void e; }
    try { navigator.mediaSession.setActionHandler('stop', handlePause); } catch (e) { void e; }
    try { navigator.mediaSession.setActionHandler('previoustrack', handlePrev); } catch (e) { void e; }
    try { navigator.mediaSession.setActionHandler('nexttrack', handleNext); } catch (e) { void e; }
    try { navigator.mediaSession.setActionHandler('seekto', handleSeekTo); } catch (e) { void e; }
    try { navigator.mediaSession.setActionHandler('seekbackward', handleSeekBackward); } catch (e) { void e; }
    try { navigator.mediaSession.setActionHandler('seekforward', handleSeekForward); } catch (e) { void e; }
  }, [currentTrack, isPlaying, currentTrackIndex, playlist.length]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (isPlayingRef.current) {
          requestWakeLock();
          try {
            const ctx = initAudioContext();
            if (ctx.state === 'suspended') ctx.resume();
          } catch (e) { void e; }

          if (audioElRef.current && audioElRef.current.paused && currentTrack?.type === 'file') {
            audioElRef.current.play().catch(() => {});
          }
        }
      } else {
        if (isPlayingRef.current) {
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentTrack]);

  function startScheduler() {
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
              const fadeDuration = intervalSecondsRef.current < 15 ? 0.8 : 3.0;
              const preDelayMs = intervalSecondsRef.current < 15 ? 1000 : 3500;
              
              if (remainingMs <= preDelayMs && remainingMs > 0 && !hasFadedOutRef.current) {
                   lowerVolume(fadeDuration);
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
  }

  function stopScheduler() { 
    if (workerRef.current) {
        workerRef.current.postMessage({ action: 'stop' });
        workerRef.current.terminate();
        workerRef.current = null;
    }
    if (fadeAudioElementIntervalRef.current) {
        window.clearInterval(fadeAudioElementIntervalRef.current);
        fadeAudioElementIntervalRef.current = null;
    }
  }

  const playNarrationWebAudio = (ctx: AudioContext, buffer: AudioBuffer | null) => {
      if (!buffer) {
          nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
          hasFadedOutRef.current = false;
          restoreVolume(1.0);
          return;
      }
      
      isNarratingRef.current = true;
      setIsNarratingUI(true); 
      console.log("[SmartPlayer] Iniciando narração (Web Audio), abaixando volume...");
      if (!hasFadedOutRef.current) lowerVolume(0.5);
      
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const voiceGain = ctx.createGain();
      
      // Volume da narração - O limiter agora cuida de não estourar. Aumentado para 1.8x
      voiceGain.gain.value = isSmartEqEnabledRef.current ? 1.8 : 1.0; 

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

      // Conecta ao Master Bus (com Limiter)
      if (masterBusGainRef.current) {
          voiceGain.connect(masterBusGainRef.current);
      } else {
          voiceGain.connect(ctx.destination);
      }

      narrationSourceNodeRef.current = source;
      
      source.onended = () => {
          console.log("[SmartPlayer] Narração (Web Audio) finalizada. Restaurando volume...");
          isNarratingRef.current = false;
          setIsNarratingUI(false); 
          restoreVolume(2.5); // Restaura um pouco mais rápido
          nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
          hasFadedOutRef.current = false;
      };
      
      try {
          source.start(0);
      } catch (e) {
          console.error("[SmartPlayer] Erro ao iniciar narração (Web Audio):", e);
          isNarratingRef.current = false;
          setIsNarratingUI(false);
          restoreVolume(1.0);
          nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
          hasFadedOutRef.current = false;
      }
  };

  const playNarration = () => {
      const ctx = initAudioContext(); 
      let buffer: AudioBuffer | null = null;
      let narrationFile: File | undefined = undefined;

      if (!hasActivePlan && narrationsSinceVignetteRef.current >= 4 && vignetteBufferRef.current) {
          buffer = vignetteBufferRef.current;
          narrationsSinceVignetteRef.current = 0;
      } else {
          // Fallback: If no selected narrations match history, use ANY available narration
          const targetIds = selectedNarrationIds;
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
                  if (uploadItem) {
                      buffer = uploadItem.buffer || null;
                      narrationFile = uploadItem.file;
                  }
              }
              if ((buffer || narrationFile) && !hasActivePlan) narrationsSinceVignetteRef.current += 1;
          }
      }
      
      if (!buffer && !narrationFile) {
          nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
          hasFadedOutRef.current = false;
          restoreVolume(1.0);
          return;
      }

      if (isBackgroundPlayEnabled || narrationFile) {
          if (narrationAudioElRef.current) {
              try {
                  console.log("[SmartPlayer] Preparando narração...");
                  let url = '';
                  if (narrationFile) {
                      url = URL.createObjectURL(narrationFile);
                  } else if (buffer) {
                      const blob = audioBufferToWav(buffer);
                      url = URL.createObjectURL(blob);
                  }
                  
                  if (!url) {
                      throw new Error("Não foi possível gerar URL de áudio.");
                  }

                  isNarratingRef.current = true;
                  setIsNarratingUI(true);
                  
                  if (!hasFadedOutRef.current) lowerVolume(0.5);
                  
                  narrationAudioElRef.current.src = url;
                  
                  narrationAudioElRef.current.onended = () => {
                      console.log("[SmartPlayer] Narração finalizada. Restaurando volume...");
                      isNarratingRef.current = false;
                      setIsNarratingUI(false);
                      restoreVolume(2.5);
                      nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
                      hasFadedOutRef.current = false;
                      URL.revokeObjectURL(url);
                  };
                  
                  narrationAudioElRef.current.onerror = (e) => {
                      console.error("[SmartPlayer] Erro ao reproduzir áudio de narração:", e);
                      isNarratingRef.current = false;
                      setIsNarratingUI(false);
                      restoreVolume(1.0);
                      nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
                      hasFadedOutRef.current = false;
                      URL.revokeObjectURL(url);
                  };
                  
                  narrationAudioElRef.current.play().catch(e => {
                      console.error("[SmartPlayer] Erro no play da narração:", e);
                      isNarratingRef.current = false;
                      setIsNarratingUI(false);
                      restoreVolume(1.0);
                      nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
                      hasFadedOutRef.current = false;
                      URL.revokeObjectURL(url);
                  });
              } catch (e) {
                  console.error("[SmartPlayer] Falha ao reproduzir áudio diretamente:", e);
                  if (buffer) {
                      playNarrationWebAudio(ctx, buffer);
                  } else {
                      nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
                      hasFadedOutRef.current = false;
                      restoreVolume(1.0);
                  }
              }
          } else {
              if (buffer) {
                  playNarrationWebAudio(ctx, buffer);
              } else {
                  nextNarrationTimeRef.current = Date.now() + (intervalSecondsRef.current * 1000);
                  hasFadedOutRef.current = false;
                  restoreVolume(1.0);
              }
          }
      } else {
          playNarrationWebAudio(ctx, buffer);
      }
  };

  const fadeAudioElementVolume = (audio: HTMLAudioElement, endVol: number, durationMs: number) => {
      if (!audio) return;
      if (fadeAudioElementIntervalRef.current) {
          window.clearInterval(fadeAudioElementIntervalRef.current);
          fadeAudioElementIntervalRef.current = null;
      }
      
      const startVol = audio.volume;
      const steps = 20;
      const stepTime = durationMs / steps;
      const volStep = (endVol - startVol) / steps;
      let currentVol = startVol;
      
      const intervalId = window.setInterval(() => {
          if (!audio) {
              if (fadeAudioElementIntervalRef.current === intervalId) {
                  fadeAudioElementIntervalRef.current = null;
              }
              window.clearInterval(intervalId);
              return;
          }
          currentVol += volStep;
          if ((volStep > 0 && currentVol >= endVol) || (volStep < 0 && currentVol <= endVol)) {
              currentVol = endVol;
              window.clearInterval(intervalId);
              if (fadeAudioElementIntervalRef.current === intervalId) {
                  fadeAudioElementIntervalRef.current = null;
              }
          }
          audio.volume = Math.max(0, Math.min(1, currentVol));
      }, stepTime);
      
      fadeAudioElementIntervalRef.current = intervalId;
  };

  const lowerVolume = (duration: number = 3.0) => {
      console.log(`[SmartPlayer] Ducking: baixando playlist para 10% em ${duration}s`);
      if (!isSmartEqEnabledRef.current) return;
      
      if (trackGainNodeRef.current) {
          const ctx = initAudioContext();
          trackGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
          trackGainNodeRef.current.gain.setValueAtTime(trackGainNodeRef.current.gain.value, ctx.currentTime);
          trackGainNodeRef.current.gain.linearRampToValueAtTime(0.04, ctx.currentTime + duration);
          
          if (audioElRef.current) audioElRef.current.volume = 1.0; // Mantém o volume do elemento em 1.0 quando há ganho WebAudio
      } else if (audioElRef.current) {
          fadeAudioElementVolume(audioElRef.current, 0.04, duration * 1000);
      }
      
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getVolume === 'function') {
          try {
            const currentVol = ytPlayerRef.current.getVolume();
            fadeYouTubeVolume(currentVol, 4, duration * 1000);
          } catch (e) { void e; }
      }
  };

  const restoreVolume = (duration: number = 2.5) => {
      console.log(`[SmartPlayer] Ducking: restaurando playlist para 100% em ${duration}s`);
      if (!isSmartEqEnabledRef.current) return;
      
      if (trackGainNodeRef.current) {
          const ctx = initAudioContext();
          trackGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
          trackGainNodeRef.current.gain.setValueAtTime(trackGainNodeRef.current.gain.value, ctx.currentTime);
          trackGainNodeRef.current.gain.linearRampToValueAtTime(0.7, ctx.currentTime + duration);
          
          if (audioElRef.current) audioElRef.current.volume = 1.0; // Mantém o volume do elemento em 1.0 quando há ganho WebAudio
      } else if (audioElRef.current) {
          fadeAudioElementVolume(audioElRef.current, 0.7, duration * 1000);
      }
      
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getVolume === 'function') {
          try {
            const currentVol = ytPlayerRef.current.getVolume();
            fadeYouTubeVolume(currentVol, 70, duration * 1000);
          } catch (e) { void e; }
      }
  };

  const fadeYouTubeVolume = (startVol: number, endVol: number, durationMs: number) => {
      if (!ytPlayerRef.current?.setVolume) return;
      if (fadeIntervalRef.current) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
      }
      const steps = 8;
      const stepTime = Math.max(75, durationMs / steps);
      const volStep = (endVol - startVol) / steps;
      let currentVol = startVol;
      fadeIntervalRef.current = window.setInterval(() => {
          currentVol += volStep;
          if ((volStep > 0 && currentVol >= endVol) || (volStep < 0 && currentVol <= endVol)) {
              currentVol = endVol;
              if (fadeIntervalRef.current) {
                  clearInterval(fadeIntervalRef.current);
                  fadeIntervalRef.current = null;
              }
          }
          try {
              ytPlayerRef.current?.setVolume?.(Math.round(currentVol));
          } catch (e) { void e; }
      }, stepTime);
  };

  const addWebLink = async () => {
      const trimmedInput = webInput.trim();
      if (!trimmedInput) return;

      const playlistId = extractYouTubePlaylistId(trimmedInput);
      const videoId = extractYouTubeVideoId(trimmedInput);
      const spotifyRegExp = /open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/;

      if (playlistId && !videoId) {
          const trackId = crypto.randomUUID();
          const placeholderName = `Playlist YouTube (${playlistId.substring(0, 8)}...)`;
          setPlaylist(prev => [...prev, { 
              id: trackId, 
              type: 'youtube', 
              name: placeholderName, 
              src: playlistId, 
              isPlaylist: true,
              playlistId: playlistId,
              thumbnail: 'https://img.youtube.com/vi/default/hqdefault.jpg' 
          }]);
          setWebInput('');

          try {
              const meta = await getYouTubeMetadata(trimmedInput);
              if (meta && meta.title) {
                  setPlaylist(prev => prev.map(t => t.id === trackId ? { ...t, name: meta.title, thumbnail: meta.thumbnail } : t));
              }
          } catch (e) { void e; }
      } else if (videoId) {
          const trackId = crypto.randomUUID();
          setPlaylist(prev => [...prev, { 
              id: trackId, 
              type: 'youtube', 
              name: `YouTube Faixa (${videoId})`, 
              src: videoId, 
              isPlaylist: !!playlistId,
              playlistId: playlistId || undefined,
              thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` 
          }]);
          setWebInput('');

          try {
              const meta = await getYouTubeMetadata(trimmedInput);
              if (meta && meta.title) {
                  setPlaylist(prev => prev.map(t => t.id === trackId ? { ...t, name: meta.title, thumbnail: meta.thumbnail } : t));
              }
          } catch (e) { void e; }
      } else if (trimmedInput.match(spotifyRegExp)) {
          const match = trimmedInput.match(spotifyRegExp)!;
          setPlaylist(prev => [...prev, { id: crypto.randomUUID(), type: 'spotify', name: `Spotify ${match[1]}`, src: `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`, thumbnail: '' }]);
          setWebInput('');
      } else { 
          alert("Link inválido ou não suportado. Cole links de vídeos ou playlists do YouTube, ou faixas do Spotify."); 
      }
  };

  const handleSearchYT = async () => {
      if (!searchQuery.trim()) return;
      setIsSearchingYT(true);
      setSearchResults([]);
      setSearchError(null);
      try {
          const results = await buscarYouTube(searchQuery);
          setSearchResults(results);
          if (results.length === 0) setSearchError("Nenhum resultado encontrado.");
      } catch (e: any) {
          console.error("Erro ao buscar no YouTube:", e);
          if (e.message === 'INVALID_API_KEY') setSearchError("Chave de API do YouTube inválida.");
          else if (e.message === 'LIMIT_EXCEEDED') setSearchError("Limite de buscas excedido. Tente amanhã.");
          else if (e.message === 'API_KEY_MISSING') setSearchError("Configure a VITE_YOUTUBE_API_KEY.");
          else setSearchError("Erro ao pesquisar no YouTube. Verifique sua conexão.");
      } finally {
          setIsSearchingYT(false);
      }
  };

  const addYTSearchTrack = (video: YouTubeSearchResult) => {
      const newTrack: Track = { 
          id: crypto.randomUUID(), 
          type: 'youtube', 
          name: video.title, 
          src: video.videoId || video.playlistId || '', 
          isPlaylist: video.isPlaylist,
          playlistId: video.playlistId,
          thumbnail: video.thumbnail 
      };
      setPlaylist(prev => [...prev, newTrack]);
      setSearchResults([]);
      setSearchQuery('');
  };

  const playNowYT = (video: YouTubeSearchResult) => {
    const newTrack: Track = { 
        id: crypto.randomUUID(), 
        type: 'youtube', 
        name: video.title, 
        src: video.videoId || video.playlistId || '', 
        isPlaylist: video.isPlaylist,
        playlistId: video.playlistId,
        thumbnail: video.thumbnail 
    };
    
    setPlaylist(prev => {
        const newPlaylist = [...prev];
        newPlaylist.splice(currentTrackIndex + 1, 0, newTrack);
        return newPlaylist;
    });
    
    setSearchResults([]);
    setSearchQuery('');
    
    // Avançar para a nova trilha
    setTimeout(() => {
        handleSkipForward();
    }, 100);
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
          const limitValue = (isPremium || isCorporateMode) ? 20 : 10;
          if (selectedNarrationIds.length >= limitValue) {
               alert(`Limite de seleção de ${limitValue} narrações atingido.`);
               return;
          }
          setSelectedNarrationIds(prev => [...prev, id]);
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

  useEffect(() => {
    const checkPremium = async () => {
      const isSuper = userEmail === 'limadan389@gmail.com';
      const status = await getUserStatus(userEmail);
      const isUnlocked = (status.plan === 'premium') || (await isSmartPlayerUnlocked(userEmail)) || (userRole === 'admin') || isSuper;
      setIsPremium(isUnlocked);
    };
    checkPremium();

    const handlePlanUpdated = () => {
      setIsPremium(true);
    };
    window.addEventListener('voxgen_plan_updated', handlePlanUpdated);

    setTimeout(() => {
      loadFeedbacks().catch(err => console.warn(err));
    }, 0);

    return () => {
      window.removeEventListener('voxgen_plan_updated', handlePlanUpdated);
    };
  }, [userEmail, userRole]);

  useEffect(() => {
    if (highlightedFeedbacks.length > 1) {
      const interval = setInterval(() => {
        setCurrentFeedbackIndex(prev => (prev + 1) % highlightedFeedbacks.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [highlightedFeedbacks]);

  useEffect(() => {
    isSmartEqEnabledRef.current = isSmartEqEnabled;
  }, [isSmartEqEnabled]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isVignettePlayingRef.current = isVignettePlaying;
  }, [isVignettePlaying]);

  useEffect(() => {
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

    const narrationAudio = new Audio();
    narrationAudio.crossOrigin = "anonymous";
    narrationAudioElRef.current = narrationAudio;

    audio.ontimeupdate = () => {
      if (!isPlayingRef.current || isVignettePlayingRef.current) return;
      
      const currentTime = Date.now();
      const remainingMs = nextNarrationTimeRef.current - currentTime;
      
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setNextNarrationTimeDisplay(remainingSec > 60 
        ? `${Math.floor(remainingSec/60)}m ${remainingSec%60}s` 
        : `${remainingSec}s`
      );
      
      const fadeDuration = intervalSecondsRef.current < 15 ? 0.8 : 3.0;
      const preDelayMs = intervalSecondsRef.current < 15 ? 1000 : 3500;
      
      if (remainingMs <= preDelayMs && remainingMs > 0 && !hasFadedOutRef.current) {
        lowerVolume(fadeDuration);
        hasFadedOutRef.current = true;
      }
      
      if (currentTime >= nextNarrationTimeRef.current && !isNarratingRef.current) {
        playNarration();
      }

      if ('mediaSession' in navigator && audio.duration) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration || 0,
            playbackRate: audio.playbackRate || 1,
            position: audio.currentTime || 0
          });
        } catch (e) { void e; }
      }
    };

    if (!isBackgroundPlayEnabled) {
        try {
            const trackSource = ctx.createMediaElementSource(audio);
            const trackGain = ctx.createGain();
            const masterBus = ctx.createGain();
            const limiter = ctx.createDynamicsCompressor();
            const analyser = ctx.createAnalyser();
            
            // Configura Limiter (Previne Estouro/Clipping)
            limiter.threshold.setValueAtTime(-2.0, ctx.currentTime); // Começa a limitar em -2.0dB
            limiter.knee.setValueAtTime(40, ctx.currentTime); // Curva suave
            limiter.ratio.setValueAtTime(20, ctx.currentTime); // Compressão forte (Hard Limiter)
            limiter.attack.setValueAtTime(0.003, ctx.currentTime); // Rápido
            limiter.release.setValueAtTime(0.25, ctx.currentTime);
            
            analyser.fftSize = 256;
            trackGain.gain.value = 0.7; // Volume base da playlist reduzido para dar espaço à narração
            masterBus.gain.value = 1.0;

            // Conexões
            trackSource.connect(trackGain);
            trackGain.connect(masterBus);
            
            masterBus.connect(limiter);
            limiter.connect(analyser);
            analyser.connect(ctx.destination);
            
            trackGainNodeRef.current = trackGain;
            masterBusGainRef.current = masterBus;
            limiterNodeRef.current = limiter;
            analyserRef.current = analyser;
        } catch (err) {
            console.error("Failed to connect audio elements to Web Audio context:", err);
        }
    } else {
        // Direct playback mode: reset Web Audio node refs
        trackGainNodeRef.current = null;
        masterBusGainRef.current = null;
        limiterNodeRef.current = null;
        analyserRef.current = null;
    }

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
      narrationAudio.pause();
      if (ytPlayerRef.current) {
          try { ytPlayerRef.current.destroy(); } catch (e) { void e; }
          ytPlayerRef.current = null;
      }
      setIsYtReady(false);
      stopScheduler();
      window.removeEventListener('voxgen-play', onVoicePlay);
      window.removeEventListener('voxgen-pause', onVoicePause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBackgroundPlayEnabled]);

  useEffect(() => {
    if (isCorporateMode && playlist.length === 0) {
        const companyId = companyName || userEmail || 'default_corp';
        setTimeout(() => {
            syncCorporatePlaylist(companyId);
        }, 0);
    }
  }, [isCorporateMode, companyName, userEmail, playlist.length]);

  useEffect(() => {
    const loadVignette = async () => {
        if (hasActivePlan) return;
        if (vignetteBufferRef.current) return;
        try {
            const ctx = initAudioContext();
            const base64 = await generateSpeech(VIGNETTE_TEXT, 'Kore');
            const buffer = await decodeAudioData(base64, ctx);
            vignetteBufferRef.current = buffer;
        } catch (e) { console.warn("Failed to preload vignette", e); }
    };
    loadVignette();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActivePlan]);

  // Pré-carrega a próxima faixa automaticamente ao mudar de faixa ou alterar playlist
  useEffect(() => {
    if (playlist.length > 0) {
      preloadNextTracks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackIndex, playlist]);

  useEffect(() => {
    if (!currentTrack) return;
    if (isPlaying && !isVignettePlaying) {
        playTrack(currentTrack);
        startScheduler();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackIndex]); 

  useEffect(() => {
    if (isYtReady && isPlaying && currentTrack?.type === 'youtube' && !isVignettePlaying) {
        console.log("[YouTube] Sincronização reativa: Play");
        playTrack(currentTrack);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYtReady, isPlaying, currentTrackIndex, isVignettePlaying]);

  return (
    <div className="max-w-6xl mx-auto w-full px-4 animate-fade-in pb-20 relative">
        <input ref={fileInputRef} type="file" accept=".mp3,.wav,.m4a,.aac,audio/*,audio/mpeg,audio/mp3,audio/x-mpeg,audio/x-mp3" multiple className="hidden" onChange={handleFileSelect} />
        
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
            <div className="flex items-center justify-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Segundo Plano Ativo (PWA / Tela Bloqueada)
                </span>
            </div>
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
                        <div 
                            ref={ytContainerWrapperRef}
                            style={showMiniPlayer && currentTrack?.type === 'youtube' && isPlaying ? {
                                position: 'fixed',
                                bottom: '24px',
                                right: '24px',
                                width: '320px',
                                height: '180px',
                                opacity: 1,
                                borderRadius: '12px',
                                overflow: 'hidden',
                                border: '2px solid rgba(99, 102, 241, 0.5)',
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                                zIndex: 50,
                                transition: 'all 0.3s ease-in-out',
                                pointerEvents: 'auto',
                            } : {
                                position: 'fixed',
                                bottom: '0px',
                                right: '0px',
                                width: '200px',
                                height: '200px',
                                opacity: 0.0001,
                                overflow: 'hidden',
                                zIndex: -50,
                                pointerEvents: 'none',
                                transition: 'all 0.3s ease-in-out',
                            }}
                        >
                            <div id="youtube-player-hidden" className="w-full h-full"></div>
                        </div>

                        <div className="w-64 h-64 rounded-full border-4 border-slate-700/50 shadow-2xl mb-6 overflow-hidden bg-black flex items-center justify-center relative group">
                            {currentTrack ? (
                                currentTrack.type === 'youtube' ? (
                                    <img 
                                        src={currentTrack.thumbnail || `https://img.youtube.com/vi/${currentTrack.src}/hqdefault.jpg`} 
                                        alt={currentTrack.name}
                                        className="w-full h-full object-cover" 
                                    />
                                ) : (
                                    <div className="bg-gradient-to-br from-slate-700 to-slate-800 w-full h-full flex items-center justify-center">
                                        <Mic2 size={64} className="text-slate-500 opacity-50" />
                                    </div>
                                )
                            ) : (
                                <div className="text-slate-600">Sem Faixa</div>
                            )}
                            {currentTrack?.type === 'youtube' && (
                                <div className="absolute top-3 right-3 bg-red-600/90 text-white p-1.5 rounded-full shadow-md">
                                    <Youtube size={14} />
                                </div>
                            )}
                            {isNarratingRef.current && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                    <Mic2 size={48} className="text-cyan-400 animate-pulse" />
                                </div>
                            )}
                        </div>

                        <h3 className="text-xl font-bold text-white mb-1 text-center line-clamp-1 max-w-md">{isBuffering ? "Carregando / Bufferizando..." : (currentTrack?.name || (isPlaying ? "Carregando..." : "Aguardando..."))}</h3>
                         {ytErrorMessage && (
                             <div className="mt-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs rounded-xl flex items-center gap-2 max-w-md text-center">
                                 <AlertCircle size={14} className="shrink-0 text-amber-400" />
                                 <span>{ytErrorMessage}</span>
                             </div>
                         )}
                         {currentTrack?.type === 'youtube' && isPlaying && (
                            <button 
                                onClick={() => setShowMiniPlayer(!showMiniPlayer)}
                                className={`mt-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border hover:scale-105 active:scale-95 shadow-sm ${
                                    showMiniPlayer 
                                        ? 'bg-red-500/20 text-red-300 border-red-500/30' 
                                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                }`}
                            >
                                <Youtube size={12} />
                                {showMiniPlayer ? 'Ocultar Mini-Player' : 'Mostrar Mini-Player'}
                            </button>
                         )}
                        
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
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-white font-bold flex items-center gap-2">
                        <Upload size={18} className="text-purple-400" /> Playlist
                        {isCorpUser && (
                            <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Lock size={10} /> Corporativa (Apenas Leitura)
                            </span>
                        )}
                    </h4>
                </div>

                {!isCorpUser && (
                    <div className="space-y-4 mb-6">
                        <div className="flex gap-2">
                            <input type="text" value={webInput} onChange={(e) => setWebInput(e.target.value)} placeholder="Link Direto (YouTube/Spotify)..." className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-4 text-sm text-white outline-none" />
                            <button onClick={addWebLink} className="bg-indigo-600 text-white px-4 rounded-lg" title="Adicionar por Link"><Link size={18} /></button>
                            <button onClick={triggerUpload} className="bg-slate-700 text-white px-4 rounded-lg h-full flex items-center justify-center" title="Upload de Arquivo"><FileAudio size={18} /></button>
                        </div>

                        <div className="relative">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Youtube size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input 
                                        type="text" 
                                        value={searchQuery} 
                                        onChange={(e) => setSearchQuery(e.target.value)} 
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearchYT()}
                                        placeholder="Pesquisar música no YouTube..." 
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white outline-none focus:border-red-500/50 transition-colors" 
                                    />
                                </div>
                                <button 
                                    onClick={handleSearchYT} 
                                    disabled={isSearchingYT}
                                    className="bg-red-600 hover:bg-red-500 text-white px-4 rounded-lg flex items-center justify-center disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                                    title="Pesquisar YouTube"
                                >
                                    {isSearchingYT ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                                </button>
                            </div>

                            {searchError && (
                                <div className="mt-2 text-[10px] text-red-400 flex items-center gap-1 bg-red-400/10 p-2 rounded-lg border border-red-400/20 animate-in fade-in slide-in-from-top-1">
                                    <AlertCircle size={10} /> {searchError}
                                </div>
                            )}

                            {/* Testimonials Banner */}
                            {highlightedFeedbacks.length > 0 && (
                                <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl animate-fade-in relative overflow-hidden">
                                    <div className="flex items-center gap-2 mb-2 relative z-10">
                                        <Star size={12} className="text-amber-500 fill-amber-500" />
                                        <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">O que dizem os usuários</span>
                                    </div>
                                    <div className="relative h-12 overflow-hidden z-10">
                                        {highlightedFeedbacks.map((f, i) => (
                                            <div 
                                                key={f.id} 
                                                className={`absolute inset-0 transition-all duration-1000 flex flex-col justify-center ${i === currentFeedbackIndex ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                                            >
                                                <p className="text-[11px] text-slate-200 font-medium line-clamp-2 italic leading-tight">"{f.comment}"</p>
                                                <p className="text-[9px] text-indigo-300 font-bold mt-1">— {f.userName}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="absolute -right-4 -bottom-4 opacity-10">
                                        <Star size={64} className="text-indigo-500" />
                                    </div>
                                </div>
                            )}

                            {searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 z-30 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                                    <div className="p-2 bg-slate-800/50 border-b border-slate-700 font-bold text-[10px] text-slate-400 uppercase tracking-wider flex justify-between items-center">
                                        Resultados do YouTube
                                        <button onClick={() => setSearchResults([])} className="text-slate-500 hover:text-white">Limpar</button>
                                    </div>
                                    {searchResults.map(result => (
                                        <div 
                                            key={result.videoId}
                                            className="w-full flex items-center gap-3 p-3 hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0 group"
                                        >
                                            <div className="relative shrink-0 w-16 h-10 shadow-sm rounded overflow-hidden">
                                                <img src={result.thumbnail} className="w-full h-full object-cover" alt="" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <Music size={12} className="text-white" />
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0 pr-4">
                                                <p className="text-xs text-white font-medium line-clamp-1 leading-tight group-hover:text-red-400 transition-colors" title={result.title}>{result.title}</p>
                                                <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{result.channelTitle}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                <button 
                                                    onClick={() => playNowYT(result)}
                                                    className="p-1.5 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white rounded transition-all"
                                                    title="Reproduzir Agora"
                                                >
                                                    <Play size={12} fill="currentColor" />
                                                </button>
                                                <button 
                                                    onClick={() => addYTSearchTrack(result)}
                                                    className="p-1.5 bg-slate-700 text-slate-300 hover:bg-indigo-600 hover:text-white rounded transition-all"
                                                    title="Adicionar à Fila"
                                                >
                                                    <Link size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="h-64 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                    {playlist.map((track, idx) => (
                        <div key={track.id} className={`flex items-center justify-between p-3 rounded-lg text-sm transition-colors ${idx === currentTrackIndex ? 'bg-cyan-900/20 border border-cyan-500/30 text-cyan-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-750'}`}>
                            <div 
                                className="flex items-center gap-3 truncate cursor-pointer flex-1 mr-2"
                                onClick={() => {
                                    setCurrentTrackIndex(idx);
                                    if (!isPlaying) setIsPlaying(true);
                                }}
                            >
                                {track.type === 'youtube' ? <Youtube size={14} className="text-red-400 shrink-0" /> : <Music size={14} className="text-green-400 shrink-0" />}
                                <span className="truncate">{track.name}</span>
                                {track.isPlaylist && (
                                    <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded uppercase font-semibold shrink-0">
                                        Playlist
                                    </span>
                                )}
                            </div>
                            {!isCorpUser && (
                                <button onClick={() => setPlaylist(prev => prev.filter(t => t.id !== track.id))} className="text-slate-500 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                            )}
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
                    <div className="bg-slate-950 rounded-xl p-4 overflow-hidden h-24 flex items-end">
                        <canvas ref={canvasRef} width={400} height={100} className="w-full h-full" />
                    </div>
                </div>
            </div>
        </div>

        {/* Evaluation button */}
        <div className="flex justify-center mt-12 gap-4">
            <button 
                onClick={() => {
                   const comment = prompt("O que você está achando do VoxGen? Deixe sua avaliação:");
                   if (comment) {
                       const rating = parseInt(prompt("De 1 a 5, qual sua nota?") || "5");
                       import('../services/analyticsService').then(service => {
                           service.submitFeedback({
                               userId: userEmail || 'guest',
                               userName: userEmail?.split('@')[0] || 'Usuário',
                               userEmail: userEmail || 'anonimo@voxgen.ai',
                               rating: Math.min(5, Math.max(1, rating)),
                               comment
                           });
                           alert("Obrigado pelo seu feedback! Sua avaliação foi enviada para moderação.");
                       });
                   }
                }}
                className="px-6 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs font-black uppercase tracking-widest hover:text-white hover:border-indigo-500 transition-all flex items-center gap-2 group"
            >
                <Star size={16} className="group-hover:text-amber-500 group-hover:fill-amber-500 transition-colors" /> Avaliar VoxGen
            </button>
        </div>
    </div>
  );
};

export default SmartPlayer;
