
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Sparkles, Loader2, PlayCircle, ArrowLeft, Heart, Smartphone, Play, Square, Volume2, LogOut, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import VoiceControls from './components/VoiceControls';
import TextInput from './components/TextInput';
import AudioList from './components/AudioList';
import Home from './components/Home';
import MusicStudio from './components/MusicStudio';
import AvatarStudio from './components/AvatarStudio';
import SFXStudio from './components/SFXStudio';
import SmartPlayer from './components/SmartPlayer';
import MangaStudio from './components/MangaStudio';
import VoiceCloningStudio from './components/VoiceCloningStudio';
import PDFAudioModule from './components/PDFAudioModule';
import AdminPanel from './components/AdminPanel';
import ErrorBoundary from './components/ErrorBoundary';
import ReloadPrompt from './components/ReloadPrompt';
import Login from './components/Login';
import Onboarding from './components/Onboarding';
import VoiceAssistant from './components/VoiceAssistant';
import { AudioItem, ProcessingState, ToneType, VoiceName, AppMode, UserRole, UserSession } from './types';
import { DEFAULT_TEXT, VIGNETTE_TEXT } from './constants';
import { refineText, generateSpeech, addAutomaticSFX } from './services/geminiService';
import { decodeAudioData, addBackgroundMusic } from './utils/audioUtils';
import { canGenerateNarration, incrementUsage } from './services/monetizationService';
import { saveNarration, getUserNarrations } from './services/narrationService';
import { auth, db } from './services/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { startSession, updateSessionToolUsage, endSession } from './services/analyticsService';

const AppContent: React.FC = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mode, setMode] = useState<AppMode>(AppMode.Home);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const lastModeChangeTimeRef = useRef<number>(Date.now());
  const activeModeRef = useRef<AppMode>(AppMode.Home);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Start tracking session if not already started
        if (!sessionId) {
            const sid = await startSession(firebaseUser.uid);
            setSessionId(sid);
        }

        // Define initial basic user info from Auth
        const initialRole: UserRole = (firebaseUser.email === 'limadan389@gmail.com') ? 'admin' : 'user';
        setUser({
            email: firebaseUser.email || '',
            role: initialRole,
            isProfileComplete: undefined // Undefined until doc check
        });

        // Restore mode based on role on first load
        setMode((prev) => {
            if (prev === AppMode.Home) {
                return (initialRole === 'admin' || firebaseUser.email === 'limadan389@gmail.com') ? AppMode.Admin : AppMode.Narration;
            }
            return prev;
        });

        try {
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                const actualRole = data.role as UserRole;
                setUser({
                    email: firebaseUser.email || '',
                    role: actualRole,
                    companyName: data.companyName,
                    isProfileComplete: data.isProfileComplete === true // Force false if it's anything else
                });

                // Update mode if it was decided based on initialRole and it changed
                if (actualRole === 'admin' || firebaseUser.email === 'limadan389@gmail.com') {
                    setMode(AppMode.Admin);
                }

                // Load History
                if (audioContextRef.current) {
                  const savedHistory = await getUserNarrations(firebaseUser.uid, audioContextRef.current);
                  setHistory(savedHistory);
                } else {
                   const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                   const savedHistory = await getUserNarrations(firebaseUser.uid, tempCtx);
                   setHistory(savedHistory);
                   tempCtx.close();
                }
            } else {
                // Create user doc if missing
                const role: UserRole = (firebaseUser.email === 'limadan389@gmail.com') ? 'admin' : 'user';
                const newUser = {
                    email: firebaseUser.email || '',
                    phoneNumber: firebaseUser.phoneNumber || '',
                    role: role,
                    plan: 'free',
                    narrationsToday: 0,
                    createdAt: Date.now(),
                    isProfileComplete: false
                };
                await setDoc(doc(db, 'users', firebaseUser.uid), newUser, { merge: true });
                setUser({
                    email: firebaseUser.email || '',
                    role: role,
                    isProfileComplete: false
                });
            }
        } catch (e) {
            console.error("Auth sync warning:", e);
        }
      } else {
        setUser(null);
        // Only reset mode to home if we just logged out, 
        // helping to keep state during initial load.
        if (!authLoading) setMode(AppMode.Home);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const [selectedVoice, setSelectedVoice] = useState<VoiceName | string>(VoiceName.Kore);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [selectedTone, setSelectedTone] = useState<ToneType | string>(ToneType.Neutral);
  const [useMusic, setUseMusic] = useState(false);
  const [history, setHistory] = useState<AudioItem[]>([]);
  const [processing, setProcessing] = useState<ProcessingState>({
    isEnhancing: false, isGeneratingAudio: false, error: null,
  });

  const [suggestedText, setSuggestedText] = useState<string | null>(null);
  const [isAddingSFX, setIsAddingSFX] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [globalGain, setGlobalGain] = useState(1.0);
  
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainNodeRef = useRef<GainNode | null>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleLogin = (role: UserRole, email: string) => {
     // The setUser is already handled via onAuthStateChanged with full data
     if (role === 'admin' || email === 'limadan389@gmail.com') {
         setMode(AppMode.Admin);
     } else {
         setMode(AppMode.Narration); // Direct to generator if logged in via Login.tsx
     }
  };

  const handleLogout = async () => {
    if (sessionId) {
        await endSession(sessionId);
        setSessionId(null);
    }
    await signOut(auth);
    setMode(AppMode.Home);
  };

  // Track tool usage duration
  useEffect(() => {
    if (!sessionId) return;

    const previousMode = activeModeRef.current;
    const now = Date.now();
    const durationSeconds = Math.floor((now - lastModeChangeTimeRef.current) / 1000);

    if (durationSeconds > 1) {
        updateSessionToolUsage(sessionId, previousMode, durationSeconds);
    }

    lastModeChangeTimeRef.current = now;
    activeModeRef.current = mode;
  }, [mode, sessionId]);

  // Handle window close
  useEffect(() => {
      const handleUnload = () => {
          if (sessionId) {
            // We can't await here reliably, but we can try a beacon or fire-and-forget
            // endSession(sessionId);
          }
      };
      window.addEventListener('beforeunload', handleUnload);
      return () => window.removeEventListener('beforeunload', handleUnload);
  }, [sessionId]);

  const handleInstallClick = () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    }
  };

  const initAudioContext = (): AudioContext => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 24000 });
      
      const masterGain = ctx.createGain();
      masterGain.gain.value = globalGain;
      masterGain.connect(ctx.destination);
      
      audioContextRef.current = ctx;
      masterGainNodeRef.current = masterGain;
    }
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
    return audioContextRef.current;
  };

  const stopPreview = () => {
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch (e) {}
      previewSourceRef.current = null;
    }
    setIsPlayingPreview(false);
  };

  const handlePreviewNarration = async () => {
    if (isPlayingPreview) { stopPreview(); return; }
    if (!text.trim()) return;
    const ctx = initAudioContext();
    setIsPlayingPreview(true);
    try {
      let previewText = text;
      if (text.length > 150) {
        const truncated = text.slice(0, 150);
        const lastSpace = truncated.lastIndexOf(' ');
        previewText = (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "...";
      }
      const base64Data = await generateSpeech(previewText, selectedVoice);
      const buffer = await decodeAudioData(base64Data, ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(masterGainNodeRef.current || ctx.destination);
      source.onended = () => {
        setIsPlayingPreview(false);
        previewSourceRef.current = null;
      };
      source.start(0);
      previewSourceRef.current = source;
    } catch (err: any) {
      alert("Erro no preview: " + (err.message || "Tente novamente"));
      setIsPlayingPreview(false);
    }
  };

  const handleVoiceCommand = (command: 'play' | 'pause' | 'volume_down' | 'volume_up') => {
    console.log(`[VoxGen Voice] Executando comando: ${command}`);
    
    switch (command) {
        case 'play':
            if (mode === AppMode.Narration && text.trim()) {
                handlePreviewNarration();
            } else if (mode === AppMode.SmartPlayer) {
                window.dispatchEvent(new CustomEvent('voxgen-play'));
            }
            break;
        case 'pause':
            stopPreview();
            window.dispatchEvent(new CustomEvent('voxgen-pause'));
            if (audioContextRef.current) audioContextRef.current.suspend();
            break;
        case 'volume_down':
            const newVolDown = Math.max(0, globalGain - 0.3);
            setGlobalGain(newVolDown);
            if (masterGainNodeRef.current) masterGainNodeRef.current.gain.setTargetAtTime(newVolDown, audioContextRef.current!.currentTime, 0.2);
            break;
        case 'volume_up':
            const newVolUp = Math.min(1.5, globalGain + 0.3);
            setGlobalGain(newVolUp);
            if (masterGainNodeRef.current) masterGainNodeRef.current.gain.setTargetAtTime(newVolUp, audioContextRef.current!.currentTime, 0.2);
            break;
    }
  };

  const handleOptimizeText = async () => {
      if (!text.trim()) return;
      setProcessing(prev => ({ ...prev, isEnhancing: true }));
      try {
          const refined = await refineText(text, selectedTone, useMusic);
          setSuggestedText(refined);
      } catch (e) { alert("Não foi possível otimizar o texto."); } finally { setProcessing(prev => ({ ...prev, isEnhancing: false })); }
  };

  const handleAutoSFX = async () => {
      if (!text.trim()) return;
      setIsAddingSFX(true);
      try {
          const textWithSFX = await addAutomaticSFX(text);
          setText(textWithSFX);
      } catch (e) { alert("Não foi possível inserir efeitos automáticos."); } finally { setIsAddingSFX(false); }
  };

  const confirmSuggestion = () => {
      if (suggestedText) { setText(suggestedText); setSuggestedText(null); }
  };

  const handleGenerateNarration = async () => {
    stopPreview();
    const isSuperAdmin = user?.email === 'limadan389@gmail.com';
    if (user?.role !== 'admin' && !isSuperAdmin && user?.role !== 'corporate-admin') {
        const limitCheck = await canGenerateNarration();
        if (!limitCheck.allowed) { alert(limitCheck.message); return; }
    }
    const ctx = initAudioContext();
    setProcessing({ isEnhancing: false, isGeneratingAudio: false, error: null });
    try {
      setProcessing({ isEnhancing: false, isGeneratingAudio: true, error: null });
      const base64Data = await generateSpeech(text, selectedVoice);
      if (ctx) {
        const speechBuffer = await decodeAudioData(base64Data, ctx);
        let finalBuffer = speechBuffer;
        if (useMusic) { finalBuffer = await addBackgroundMusic(speechBuffer, selectedTone, ctx); }
        const newItem: AudioItem = { id: crypto.randomUUID(), text: text, voice: selectedVoice, audioData: finalBuffer, createdAt: new Date(), duration: finalBuffer.duration };
        setHistory(prev => [newItem, ...prev]);

        // Persist to DB
        if (auth.currentUser) {
            saveNarration(auth.currentUser.uid, newItem, base64Data, selectedTone as string);
        }
        
        // Monetization & Vignette Trigger
        let currentCount = 0;
        if (user?.role !== 'admin' && !isSuperAdmin && user?.role !== 'corporate-admin') { 
            currentCount = await incrementUsage(); 
        }

        // Trigger CTA Vignette every 5th narration
        if (currentCount > 0 && currentCount % 5 === 0) {
            console.log(`[VoxGen CTA] Triggering vignette for narration #${currentCount}`);
            setTimeout(async () => {
                try {
                    const vignetteBase64 = await generateSpeech(VIGNETTE_TEXT, VoiceName.Aoede); 
                    const vBuffer = await decodeAudioData(vignetteBase64, ctx);
                    const newItem: AudioItem = { id: `cta-${currentCount}`, text: "[VINHETA CTA] " + VIGNETTE_TEXT, voice: VoiceName.Aoede, audioData: vBuffer, createdAt: new Date(), duration: vBuffer.duration };
                    setHistory(prev => [newItem, ...prev]);
                    
                    const source = ctx.createBufferSource();
                    source.buffer = vBuffer;
                    source.connect(masterGainNodeRef.current || ctx.destination);
                    source.start(0);
                } catch (e) { console.error("Erro ao reproduzir vinheta CTA", e); }
            }, 2000);
        }
      }
    } catch (err: any) {
      const msg = err.message || "Erro desconhecido ao gerar áudio.";
      setProcessing(prev => ({ ...prev, error: msg }));
      alert("FALHA NA GERAÇÃO: " + msg);
    } finally { setProcessing(prev => ({ ...prev, isEnhancing: false, isGeneratingAudio: false })); }
  };

  if (authLoading) {
    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        </div>
    );
  }

  if (!user) return <Login onLogin={handleLogin} />;

  if (user && user.isProfileComplete === false && mode !== AppMode.Admin) {
    return (
      <Onboarding 
        uid={auth.currentUser?.uid || ''} 
        onComplete={() => {
          setUser(prev => prev ? { ...prev, isProfileComplete: true } : null);
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0f172a] text-slate-200 font-sans relative">
      <VoiceAssistant onCommand={handleVoiceCommand} />
      
      {suggestedText && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl p-6 max-w-4xl w-full shadow-2xl">
                  <div className="text-center mb-6">
                      <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-3"><Sparkles size={24} className="text-indigo-400" /></div>
                      <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Versão Humanizada Disponível</h2>
                      <p className="text-slate-400 text-sm">A IA sugeriu melhorias para o texto original.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                      <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                          <h4 className="text-slate-400 font-bold text-xs uppercase mb-3 flex items-center gap-2">Original</h4>
                          <div className="text-sm text-slate-300 h-48 overflow-y-auto custom-scrollbar p-2 bg-slate-900/50 rounded whitespace-pre-wrap">{text}</div>
                          <button onClick={() => setSuggestedText(null)} className="mt-4 w-full py-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-sm flex items-center justify-center gap-2"><XCircle size={16} /> Manter Original</button>
                      </div>
                      <div className="bg-indigo-900/10 rounded-xl p-4 border border-indigo-500/30">
                          <h4 className="text-indigo-400 font-bold text-xs uppercase mb-3 flex items-center gap-2">Sugestão IA</h4>
                          <div className="text-sm text-white h-48 overflow-y-auto custom-scrollbar p-2 bg-indigo-900/20 rounded whitespace-pre-wrap border border-indigo-500/10">{suggestedText}</div>
                          <button onClick={confirmSuggestion} className="mt-4 w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg"><CheckCircle size={16} /> Usar Sugestão</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <header className="bg-slate-900/50 backdrop-blur-lg sticky top-0 z-50 p-4 border-b border-slate-800 flex justify-between items-center">
          <div onClick={() => setMode(AppMode.Home)} className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center"><Mic size={20}/></div>
              <h1 className="font-bold text-lg hidden md:block">VoxGen AI</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setMode(AppMode.Home)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)]">CADASTRO</button>
            <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
            {isInstallable && (
                <button onClick={handleInstallClick} className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full text-xs flex items-center gap-2 transition-colors"><Smartphone size={14}/> <span className="hidden sm:inline">Instalar App</span></button>
            )}
            <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
            {mode !== AppMode.Home && (
                <button onClick={() => setMode(AppMode.Home)} className="text-slate-400 hover:text-white text-sm flex items-center gap-1 transition-colors"><ArrowLeft size={16}/> Voltar</button>
            )}
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 text-sm flex items-center gap-1 transition-colors ml-2" title="Sair"><LogOut size={18}/></button>
          </div>
      </header>
      
      <main className="flex-grow py-8">
         <div className={mode === AppMode.SmartPlayer ? 'block' : 'hidden'}>
            <SmartPlayer 
                audioContext={audioContextRef.current} 
                initAudioContext={initAudioContext} 
                narrationHistory={history} 
                userRole={user.role} 
                userEmail={user.email} 
                companyName={user.companyName}
            />
         </div>

         {mode === AppMode.Home && <Home onSelectMode={setMode} userRole={user.role} userEmail={user.email} />}
         {mode === AppMode.Admin && <AdminPanel userRole={user.role} userEmail={user.email} />}
         {mode === AppMode.Narration && (
            <div className="max-w-6xl mx-auto px-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-7 space-y-6">
                        <VoiceControls selectedVoice={selectedVoice} onVoiceChange={setSelectedVoice} selectedTone={selectedTone} onToneChange={setSelectedTone} useMusic={useMusic} onMusicChange={setUseMusic} userEmail={user.email} />
                        <div className="min-h-[200px]">
                            <TextInput value={text} onChange={setText} disabled={processing.isGeneratingAudio} selectedTone={selectedTone} onOptimize={handleOptimizeText} isOptimizing={processing.isEnhancing} onAutoSFX={handleAutoSFX} isAddingSFX={isAddingSFX} />
                        </div>
                        <div className="flex gap-4">
                            <button onClick={handlePreviewNarration} disabled={processing.isGeneratingAudio || !text.trim()} className={`flex-1 py-4 rounded-xl font-bold flex justify-center items-center gap-2 border transition-all ${isPlayingPreview ? 'bg-red-500/20 border-red-500 text-red-200' : 'bg-slate-800 border-slate-700 text-indigo-300'}`}>
                                {isPlayingPreview ? <><Square size={18} fill="currentColor" /> Parar</> : <><Play size={18} /> Preview</>}
                            </button>
                            <button onClick={handleGenerateNarration} disabled={processing.isGeneratingAudio || !text.trim() || isPlayingPreview} className="flex-[2] py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex justify-center items-center gap-2 shadow-lg disabled:opacity-50">
                                {processing.isGeneratingAudio ? "Gerando..." : <><Sparkles size={18}/> Gerar Áudio</>}
                            </button>
                        </div>
                    </div>
                    <div className="lg:col-span-5">
                        <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-800 h-[500px] overflow-y-auto custom-scrollbar">
                            <AudioList items={history} audioContext={audioContextRef.current} />
                        </div>
                    </div>
                </div>
            </div>
         )}
         {mode === AppMode.Music && <MusicStudio audioContext={audioContextRef.current} initAudioContext={initAudioContext} />}
         {mode === AppMode.Avatar && <AvatarStudio audioContext={audioContextRef.current} initAudioContext={initAudioContext} narrationHistory={history} />}
         {mode === AppMode.Manga && <MangaStudio audioContext={audioContextRef.current} initAudioContext={initAudioContext} />}
         {mode === AppMode.SFX && <SFXStudio audioContext={audioContextRef.current} initAudioContext={initAudioContext} />}
         {mode === AppMode.VoiceCloning && <VoiceCloningStudio audioContext={audioContextRef.current} initAudioContext={initAudioContext} userEmail={user.email} />}
         {mode === AppMode.PDFAudio && <PDFAudioModule />}
      </main>
      
      <footer className="p-6 text-center text-slate-500 text-xs border-t border-slate-900/50 bg-[#0f172a] mt-auto">
         <p>Desenvolvido com ❤️ por <span className="text-indigo-400 font-bold">Daniel de Oliveira</span></p>
         <p className="opacity-50 mt-1">Powered by Cloud Firestore & Google Gemini</p>
      </footer>
    </div>
  );
};

const App: React.FC = () => (
    <ErrorBoundary>
        <AppContent />
        <ReloadPrompt />
    </ErrorBoundary>
);
export default App;
