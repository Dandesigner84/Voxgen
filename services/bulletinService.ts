import { db } from './firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  updateDoc 
} from 'firebase/firestore';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  BulletinConfig, 
  BulletinBackgroundMusic, 
  BulletinHistoryItem, 
  BulletinUsage,
  ContentBlock 
} from '../types';
import { generateSpeech } from './geminiService';
import { decodeAudioData } from '../utils/audioUtils';

export const BULLETIN_NICHES = [
  "Promoções e Varejo",
  "Política",
  "Economia",
  "Agronegócio",
  "Tecnologia",
  "Esportes",
  "Saúde",
  "Trânsito",
  "Clima",
  "Notícias Locais",
  "Segurança",
  "Educação",
  "Personalizado"
];

export const VOXGEN_BG_LIBRARY: BulletinBackgroundMusic[] = [
  {
    id: 'preset-jornal-1',
    userId: 'system',
    title: 'Jornal do Meio Dia (Upbeat News)',
    type: 'library',
    sourceUrl: 'preset_news_1',
    duration: 120,
    createdAt: Date.now()
  },
  {
    id: 'preset-fm-2',
    userId: 'system',
    title: 'Rádio FM Pop Synth Bed',
    type: 'library',
    sourceUrl: 'preset_fm_2',
    duration: 120,
    createdAt: Date.now()
  },
  {
    id: 'preset-agro-3',
    userId: 'system',
    title: 'Agronegócio Acoustic Guitars',
    type: 'library',
    sourceUrl: 'preset_agro_3',
    duration: 120,
    createdAt: Date.now()
  },
  {
    id: 'preset-tech-4',
    userId: 'system',
    title: 'Tech News Minimal Ambient',
    type: 'library',
    sourceUrl: 'preset_tech_4',
    duration: 120,
    createdAt: Date.now()
  }
];

const getGeminiClient = () => {
  let rawKey = "";
  try {
    rawKey = process.env.GEMINI_API_KEY || "";
  } catch (e) { void e; }
  
  if (!rawKey || rawKey === "undefined" || rawKey === "null") {
    try {
      rawKey = (import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || "") as string;
    } catch (e) { void e; }
  }

  const cleanKey = rawKey ? rawKey.replace(/["'\s]/g, "") : ""; 
  
  if (!cleanKey || cleanKey === "undefined" || cleanKey === "null") {
    throw new Error("API Key do Gemini não encontrada para o Boletim Inteligente.");
  }
  
  return new GoogleGenAI({ apiKey: cleanKey });
};

export const getDefaultBulletinConfig = (userId: string): BulletinConfig => ({
  userId,
  isActive: true,
  niche: "Notícias Locais",
  customNiche: "",
  city: "São Paulo",
  state: "SP",
  country: "Brasil",
  intervalMinutes: 30,
  newsCount: 3,
  maxDurationSeconds: 60,
  voice: "Kore",
  locutionStyle: "Jornalístico (Âncora)",
  language: "pt",
  temperature: 0.7,
  bgMusicType: "library",
  bgMusicId: "preset-jornal-1",
  bgMusicTitle: "Jornal do Meio Dia (Upbeat News)",
  voiceVolume: 1.3,
  bgMusicVolume: 0.25,
  duckingIntensity: 0.7,
  updatedAt: Date.now()
});

/**
 * Get current date string in YYYY-MM-DD
 */
export const getTodayDateStr = (): string => {
  const now = new Date();
  return now.toISOString().split('T')[0];
};

/**
 * Check bulletin daily limit for a given user
 */
export async function checkDailyBulletinLimit(userId: string): Promise<{
  allowed: boolean;
  count: number;
  dailyLimit: number;
  message?: string;
}> {
  const dateStr = getTodayDateStr();
  const defaultLimit = 4;

  try {
    // Check if user has custom limit in user profile
    let limitForUser = defaultLimit;
    if (userId) {
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (uData.plan === 'premium' || uData.role === 'admin' || uData.role === 'corporate-admin') {
          limitForUser = 20; // Expanded limit for premium/admin
        }
        if (uData.bulletinDailyLimit) {
          limitForUser = uData.bulletinDailyLimit;
        }
      }
    }

    const usageRef = doc(db, 'bulletinUsage', `${userId}_${dateStr}`);
    const usageSnap = await getDoc(usageRef);

    if (usageSnap.exists()) {
      const data = usageSnap.data() as BulletinUsage;
      if (data.count >= limitForUser) {
        return {
          allowed: false,
          count: data.count,
          dailyLimit: limitForUser,
          message: `Você atingiu o limite diário de ${limitForUser} boletins automáticos. O limite será renovado automaticamente no próximo dia ou poderá ser ampliado conforme seu plano.`
        };
      }
      return {
        allowed: true,
        count: data.count,
        dailyLimit: limitForUser
      };
    } else {
      return {
        allowed: true,
        count: 0,
        dailyLimit: limitForUser
      };
    }
  } catch (err) {
    console.warn("Erro ao verificar limite diário do boletim:", err);
    return { allowed: true, count: 0, dailyLimit: defaultLimit };
  }
}

/**
 * Increment daily bulletin count
 */
export async function incrementDailyBulletinCount(userId: string): Promise<number> {
  const dateStr = getTodayDateStr();
  const usageRef = doc(db, 'bulletinUsage', `${userId}_${dateStr}`);

  try {
    const usageSnap = await getDoc(usageRef);
    if (usageSnap.exists()) {
      const current = usageSnap.data().count || 0;
      const newCount = current + 1;
      await updateDoc(usageRef, { count: newCount });
      return newCount;
    } else {
      await setDoc(usageRef, {
        userId,
        dateStr,
        count: 1,
        dailyLimit: 4
      });
      return 1;
    }
  } catch (err) {
    console.warn("Erro ao incrementar contagem do boletim:", err);
    return 1;
  }
}

/**
 * Load User Bulletin Configuration
 */
export async function getBulletinConfig(userId: string): Promise<BulletinConfig> {
  try {
    const configRef = doc(db, 'bulletinConfigs', userId);
    const snap = await getDoc(configRef);
    if (snap.exists()) {
      return snap.data() as BulletinConfig;
    }
    const def = getDefaultBulletinConfig(userId);
    await setDoc(configRef, def);
    return def;
  } catch (err) {
    console.warn("Falha ao carregar config do boletim, usando padrão:", err);
    return getDefaultBulletinConfig(userId);
  }
}

/**
 * Save User Bulletin Configuration
 */
export async function saveBulletinConfig(config: BulletinConfig): Promise<void> {
  try {
    const configRef = doc(db, 'bulletinConfigs', config.userId);
    await setDoc(configRef, {
      ...config,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.error("Erro ao salvar config do boletim:", err);
    throw err;
  }
}

/**
 * Load Custom Background Music List for user
 */
export async function getUserBackgroundMusic(userId: string): Promise<BulletinBackgroundMusic[]> {
  try {
    const q = query(
      collection(db, 'bulletinBgMusic'),
      where('userId', 'in', [userId, 'system'])
    );
    const snap = await getDocs(q);
    const customList: BulletinBackgroundMusic[] = [];
    snap.forEach((docSnap) => {
      customList.push({ id: docSnap.id, ...docSnap.data() } as BulletinBackgroundMusic);
    });
    return [...VOXGEN_BG_LIBRARY, ...customList];
  } catch (err) {
    console.warn("Erro ao buscar fundos musicais:", err);
    return VOXGEN_BG_LIBRARY;
  }
}

/**
 * Save Custom Background Music Reference
 */
export async function saveBackgroundMusic(bgMusic: Omit<BulletinBackgroundMusic, 'id' | 'createdAt'>): Promise<BulletinBackgroundMusic> {
  const itemData = {
    ...bgMusic,
    createdAt: Date.now()
  };
  const docRef = await addDoc(collection(db, 'bulletinBgMusic'), itemData);
  return {
    id: docRef.id,
    ...itemData
  };
}

/**
 * Fetch Bulletin Generation History
 */
export async function getBulletinHistory(userId: string): Promise<BulletinHistoryItem[]> {
  try {
    const q = query(
      collection(db, 'bulletinHistory'),
      where('userId', '==', userId),
      orderBy('dateTime', 'desc'),
      limit(20)
    );
    const snap = await getDocs(q);
    const historyList: BulletinHistoryItem[] = [];
    snap.forEach((docSnap) => {
      historyList.push({ id: docSnap.id, ...docSnap.data() } as BulletinHistoryItem);
    });
    return historyList;
  } catch (err) {
    console.warn("Erro ao buscar histórico do boletim:", err);
    return [];
  }
}

/**
 * Save Bulletin History Item
 */
export async function saveBulletinHistoryItem(item: Omit<BulletinHistoryItem, 'id'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'bulletinHistory'), item);
    return docRef.id;
  } catch (err) {
    console.error("Erro ao salvar histórico do boletim:", err);
    return crypto.randomUUID();
  }
}

/**
 * Core AI Generation Flow for "Boletim Inteligente IA"
 */
export async function generateSmartBulletin(
  config: BulletinConfig,
  userId: string,
  audioCtx: AudioContext,
  customBgAudioBuffer?: AudioBuffer
): Promise<{
  historyItem: BulletinHistoryItem;
  finalAudioBuffer: AudioBuffer;
}> {
  // 1. Check daily limit
  const limitCheck = await checkDailyBulletinLimit(userId);
  if (!limitCheck.allowed) {
    throw new Error(limitCheck.message || "Limite de boletins atingido.");
  }

  const effectiveNiche = config.niche === "Personalizado" ? (config.customNiche || "Geral") : config.niche;
  const ai = getGeminiClient();

  const langMap = { pt: 'Português', en: 'English', es: 'Español' };
  const targetLang = langMap[config.language] || 'Português';

  // Build targeted prompt for Gemini with Google Search Grounding
  const prompt = `
    Você é um jornalista de rádio profissional e âncora do boletim de notícias da plataforma VoxGen AI.
    Sua missão é pesquisar notícias altamente atualizadas e recentes do nicho: "${effectiveNiche}".
    
    LOCALIZAÇÃO PRIORITÁRIA PARA FILTRO REGIONAL:
    - Cidade: ${config.city || 'Não especificado'}
    - Estado: ${config.state || 'Não especificado'}
    - País: ${config.country || 'Brasil'}
    
    DIRETRIZES DE PESQUISA & CRIAÇÃO DE ROTEIRO:
    1. Utilize a pesquisa do Google em tempo real para extrair exatamente ${config.newsCount} notícias RECENTES do nicho "${effectiveNiche}".
    2. Dê prioridade a notícias da região (${config.city}, ${config.state}) caso encontre relevantes; se não, use notícias nacionais/globais do mesmo nicho.
    3. Remova duplicidades, ignore notícias antigas ou desatualizadas.
    4. Crie uma ABERTURA AUTOMÁTICA profissional para rádio (Exemplo: "Atenção ouvintes! Este é o seu Boletim Inteligente VoxGen com as principais notícias de ${effectiveNiche} em ${config.city}...")
    5. Crie um ENCERRAMENTO AUTOMÁTICO suave (Exemplo: "Estas foram as principais novidades de ${effectiveNiche}. Continue conectado no Smart Play da VoxGen!")
    6. Adapte a linguagem para o estilo de locução: "${config.locutionStyle}".
    7. Garanta que o texto completo possa ser lido em cerca de ${config.maxDurationSeconds} segundos (aprox. 120 a 160 palavras no máximo).
    8. Evite qualquer repetição desnecessária de informações.
    9. Idioma obrigatório: ${targetLang}.
    
    Retorne a resposta estritamente no formato JSON com:
    - title: Título dinâmico do boletim (ex: "Boletim VoxGen: Notícias de Tecnologia e Inovação").
    - script: O roteiro completo e fluido de narração (Abertura + Notícias Resumidas + Encerramento).
    - sources: Array de nomes/URLs das fontes jornalísticas consultadas.
  `;

  console.log(`[Boletim IA] Pesquisando notícias e gerando roteiro para nicho: ${effectiveNiche}...`);

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
    config: {
      temperature: config.temperature,
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          script: { type: Type.STRING },
          sources: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["title", "script", "sources"]
      }
    }
  });

  const parsed = JSON.parse(response.text || "{}");
  const bulletinTitle = parsed.title || `Boletim Inteligente: ${effectiveNiche}`;
  const scriptText = parsed.script || `Boletim Informativo VoxGen sobre ${effectiveNiche}. Mantenha-se informado!`;
  const sourcesList: string[] = Array.isArray(parsed.sources) ? parsed.sources : ["Pesquisa Google Notícias"];

  console.log(`[Boletim IA] Roteiro gerado. Convertendo para áudio com a voz: ${config.voice}...`);

  // 2. Generate Speech TTS Audio
  const voiceBase64 = await generateSpeech(scriptText, config.voice);
  const rawSpeechBuffer = await decodeAudioData(voiceBase64, audioCtx);

  // 3. Audio Mixing & Automatic Ducking
  console.log(`[Boletim IA] Aplicando mixagem e Ducking automático com fundo musical...`);
  const finalMixedBuffer = await applyDuckingMix(
    rawSpeechBuffer,
    audioCtx,
    config,
    customBgAudioBuffer
  );

  // Increment usage count in Firestore
  await incrementDailyBulletinCount(userId);

  // Convert mixed audio to base64 for SmartPlay & History
  const historyItemData: Omit<BulletinHistoryItem, 'id'> = {
    userId,
    dateTime: Date.now(),
    niche: effectiveNiche,
    city: config.city,
    state: config.state,
    country: config.country,
    sources: sourcesList,
    voiceUsed: config.voice,
    duration: Math.round(finalMixedBuffer.duration),
    generationStatus: 'Sucesso',
    playbackStatus: 'Na Fila',
    title: bulletinTitle,
    script: scriptText,
    audioBase64: voiceBase64
  };

  const historyId = await saveBulletinHistoryItem(historyItemData);
  const createdHistoryItem: BulletinHistoryItem = {
    id: historyId,
    ...historyItemData
  };

  // 4. Export automatically to Smart Play queue
  await exportBulletinToSmartPlay(createdHistoryItem, voiceBase64);

  return {
    historyItem: createdHistoryItem,
    finalAudioBuffer: finalMixedBuffer
  };
}

/**
 * Mix voice and background music with automatic ducking
 */
async function applyDuckingMix(
  voiceBuffer: AudioBuffer,
  ctx: AudioContext,
  config: BulletinConfig,
  customBgBuffer?: AudioBuffer
): Promise<AudioBuffer> {
  const sampleRate = ctx.sampleRate;
  const paddingAfter = 1.5; // Pad 1.5 seconds at end for background music fade-out
  const totalDuration = voiceBuffer.duration + paddingAfter;
  const totalFrames = Math.ceil(totalDuration * sampleRate);

  const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

  // Voice source & gain
  const voiceSource = offlineCtx.createBufferSource();
  voiceSource.buffer = voiceBuffer;
  const voiceGain = offlineCtx.createGain();
  voiceGain.gain.value = config.voiceVolume || 1.3;

  voiceSource.connect(voiceGain);
  voiceGain.connect(offlineCtx.destination);

  // Background Music source
  let bgBuffer = customBgBuffer;
  if (!bgBuffer) {
    bgBuffer = await generateProceduralRadioBed(offlineCtx, totalDuration, config.niche);
  }

  if (bgBuffer && config.bgMusicType !== 'none') {
    const bgSource = offlineCtx.createBufferSource();
    bgSource.buffer = loopBufferToDuration(bgBuffer, totalDuration, offlineCtx);

    const bgGain = offlineCtx.createGain();
    const baseBgVol = config.bgMusicVolume || 0.25;
    const duckingFactor = 1 - (config.duckingIntensity || 0.7) * 0.7; // Duck down by 70%

    // Smooth Fade In at start
    bgGain.gain.setValueAtTime(0, 0);
    bgGain.gain.linearRampToValueAtTime(baseBgVol, 0.4);

    // Apply Ducking during speech
    bgGain.gain.setValueAtTime(baseBgVol * duckingFactor, 0.4);
    bgGain.gain.setValueAtTime(baseBgVol * duckingFactor, voiceBuffer.duration);

    // Fade Out at end
    bgGain.gain.linearRampToValueAtTime(baseBgVol, voiceBuffer.duration + 0.5);
    bgGain.gain.linearRampToValueAtTime(0, totalDuration);

    bgSource.connect(bgGain);
    bgGain.connect(offlineCtx.destination);
    bgSource.start(0);
  }

  voiceSource.start(0);

  return await offlineCtx.startRendering();
}

/**
 * Generates a procedural upbeat radio music bed if no custom file is supplied
 */
async function generateProceduralRadioBed(
  ctx: OfflineAudioContext, 
  duration: number,
  niche: string
): Promise<AudioBuffer> {
  const sampleRate = ctx.sampleRate;
  const bedCtx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  
  const osc1 = bedCtx.createOscillator();
  const osc2 = bedCtx.createOscillator();
  const gain = bedCtx.createGain();

  if (niche.toLowerCase().includes('agro')) {
    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.value = 146.83; // D3
    osc2.frequency.value = 220.00; // A3
  } else if (niche.toLowerCase().includes('tech') || niche.toLowerCase().includes('tecnologia')) {
    osc1.type = 'sawtooth';
    osc2.type = 'sine';
    osc1.frequency.value = 130.81; // C3
    osc2.frequency.value = 261.63; // C4
  } else {
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.value = 110.00; // A2
    osc2.frequency.value = 164.81; // E3
  }

  const filter = bedCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;

  gain.gain.value = 0.15;

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(bedCtx.destination);

  osc1.start(0);
  osc2.start(0);

  return await bedCtx.startRendering();
}

/**
 * Helper to tile an audio buffer to fit required duration
 */
function loopBufferToDuration(
  sourceBuf: AudioBuffer,
  requiredDuration: number,
  ctx: OfflineAudioContext
): AudioBuffer {
  if (sourceBuf.duration >= requiredDuration) return sourceBuf;

  const sampleRate = ctx.sampleRate;
  const totalFrames = Math.ceil(requiredDuration * sampleRate);
  const output = ctx.createBuffer(sourceBuf.numberOfChannels, totalFrames, sampleRate);

  const srcLength = sourceBuf.length;
  for (let channel = 0; channel < sourceBuf.numberOfChannels; channel++) {
    const srcData = sourceBuf.getChannelData(channel);
    const destData = output.getChannelData(channel);
    let offset = 0;
    while (offset < totalFrames) {
      const copyLen = Math.min(srcLength, totalFrames - offset);
      destData.set(srcData.subarray(0, copyLen), offset);
      offset += srcLength;
    }
  }

  return output;
}

/**
 * Automatically export newly created bulletin into Smart Play queue (Firestore contentBlocks)
 */
export async function exportBulletinToSmartPlay(
  item: BulletinHistoryItem,
  audioBase64: string
): Promise<void> {
  try {
    const blockData: Omit<ContentBlock, 'id'> = {
      category: "📰 Boletins IA",
      title: item.title,
      text: item.script,
      audioBase64: audioBase64,
      voice: item.voiceUsed,
      style: item.niche,
      language: "pt",
      duration: item.duration,
      createdAt: item.dateTime
    };

    await addDoc(collection(db, 'contentBlocks'), blockData);
    console.log(`[Boletim IA] Boletim exportado com sucesso para a categoria '📰 Boletins IA' no Smart Play!`);
  } catch (err) {
    console.error("Erro ao exportar boletim para Smart Play:", err);
  }
}
