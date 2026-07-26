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
  limit 
} from 'firebase/firestore';
import { GoogleGenAI, Type } from "@google/genai";
import { SmartPlayPreferences, ContentBlock, NewsCache } from '../types';
import { generateSpeech } from './geminiService';

// Initialize Gemini API client
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
  
  if (!cleanKey || cleanKey === "undefined" || cleanKey === "null" || cleanKey === "GEMINI_API_KEY" || cleanKey === "VITE_GEMINI_API_KEY" || cleanKey === "VITE_API_KEY") {
    // Return a dummy client or throw clear error
    throw new Error("API Key do Gemini não encontrada para o SmartPlay.");
  }
  
  return new GoogleGenAI({ apiKey: cleanKey });
};

// Available Categories List
export const SMART_PLAY_CATEGORIES = [
  "📰 Boletins IA", "Notícias", "Inteligência Artificial", "Tecnologia", "Ciência", "Cinema", "Séreas", "Games", 
  "Futebol", "Esportes", "Economia", "Mercado Financeiro", "Marketing", "Empreendedorismo", 
  "Saúde", "Bem-estar", "Automóveis", "Trânsito", "Autoescolas", "Agronegócio", "Música", 
  "Gospel", "Notícias Cristãs", "Versículo do Dia", "Reflexão Cristã", "Frases Motivacionais", 
  "Curiosidades", "Conteúdo Personalizado"
];

// Available Locution Styles
export const SMART_PLAY_STYLES = [
  { id: 'jornal', name: 'Jornalístico (Âncora de Notícias)' },
  { id: 'podcast', name: 'Podcast (Conversacional & Amistoso)' },
  { id: 'radio_fm', name: 'Rádio FM (Dinâmico & Alto Astral)' },
  { id: 'jovem', name: 'Jovem (Descontraído & Gírias)' },
  { id: 'formal', name: 'Formal (Polido & Corporativo)' },
  { id: 'casual', name: 'Casual (Dia a Dia)' },
  { id: 'humor', name: 'Humorado (Sarcástico & Divertido)' },
  { id: 'inspirador', name: 'Inspirador (Emocionante & Motivador)' },
  { id: 'institucional', name: 'Institucional (Sóbrio & Focado)' }
];

// Available Languages
export const SMART_PLAY_LANGUAGES = [
  { id: 'pt', name: 'Português' },
  { id: 'en', name: 'Inglês (English)' },
  { id: 'es', name: 'Espanhol (Español)' }
];

// Default Preferences Builder
export const getDefaultPreferences = (userId: string): SmartPlayPreferences => ({
  userId,
  selectedCategories: ["Notícias", "Tecnologia", "Ciência"],
  language: 'pt',
  scope: 'global',
  locutionStyle: 'radio_fm',
  voiceId: 'Kore',
  intervalType: 'tracks',
  intervalValue: 3,
  duration: 45,
  blockedThemes: ["Política Extrema", "Violência", "Acidentes", "Fakenews"],
  isPremiumEnabled: true,
  updatedAt: Date.now()
});

/**
 * Get or create User Preferences from Firestore
 */
export async function getPreferences(userId: string): Promise<SmartPlayPreferences> {
  try {
    const docRef = doc(db, 'userPreferences', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as SmartPlayPreferences;
    } else {
      const defaultPrefs = getDefaultPreferences(userId);
      await setDoc(docRef, defaultPrefs);
      return defaultPrefs;
    }
  } catch (error) {
    console.warn("Falha ao carregar preferências de SmartPlay, usando padrão:", error);
    return getDefaultPreferences(userId);
  }
}

/**
 * Save User Preferences to Firestore
 */
export async function savePreferences(preferences: SmartPlayPreferences): Promise<void> {
  try {
    const docRef = doc(db, 'userPreferences', preferences.userId);
    await setDoc(docRef, {
      ...preferences,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (error) {
    console.error("Erro ao salvar preferências de SmartPlay:", error);
    throw error;
  }
}

/**
 * Fetch a prepared content block from firestore cache or generate a new one using Gemini
 */
export async function getNextSmartPlayBlock(userId: string): Promise<ContentBlock | null> {
  try {
    const prefs = await getPreferences(userId);
    
    // Choose a random category from selected categories
    const categories = prefs.selectedCategories && prefs.selectedCategories.length > 0 
      ? prefs.selectedCategories 
      : ["Notícias"];
    
    const chosenCategory = categories[Math.floor(Math.random() * categories.length)];
    
    // Find if we have a recently cached news/script block for this category/language
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const cacheQuery = query(
      collection(db, 'contentBlocks'),
      where('category', '==', chosenCategory),
      where('language', '==', prefs.language),
      where('voice', '==', prefs.voiceId),
      where('style', '==', prefs.locutionStyle),
      where('createdAt', '>=', oneHourAgo),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    
    const querySnapshot = await getDocs(cacheQuery);
    if (!querySnapshot.empty) {
      // Pick a random block from recent matches to avoid instant repetition
      const docs = querySnapshot.docs;
      const randomDoc = docs[Math.floor(Math.random() * docs.length)];
      return { id: randomDoc.id, ...randomDoc.data() } as ContentBlock;
    }
    
    // If no recent cache, generate a fresh content block using Gemini AI
    console.log(`[SmartPlay] Nenhuma narração em cache para ${chosenCategory}. Gerando novo bloco...`);
    const newBlock = await generateSmartPlayContent(prefs, chosenCategory);
    return newBlock;
  } catch (error) {
    console.error("Erro ao carregar próximo bloco de SmartPlay:", error);
    return null;
  }
}

/**
 * Core AI Generation Flow for SmartPlay Information Blocks
 */
async function generateSmartPlayContent(prefs: SmartPlayPreferences, category: string): Promise<ContentBlock> {
  const ai = getGeminiClient();
  
  const languageLabels = { pt: 'Português', en: 'English', es: 'Español' };
  const targetLang = languageLabels[prefs.language] || 'Português';
  
  const prompt = `
    Você é o editor-chefe de rádio e produtor de conteúdo IA da VoxGen.
    Sua missão é criar o roteiro de rádio do "Momento Informativo VoxGen" sobre a categoria: "${category}".
    
    REGRAS DO CONTEXTO:
    1. Pesquise e use fatos reais recentes sobre esta categoria usando a busca do Google.
    2. Escopo: ${prefs.scope === 'regional' ? 'Notícias Regionais/Locais do Brasil' : 'Notícias Globais/Internacionais'}.
    3. Idioma: Escreva estritamente em ${targetLang}.
    4. Estilo de locução: ${prefs.locutionStyle}. Adapte o ritmo, as palavras e a empolgação a este estilo.
    5. Filtros/Bloqueios: Evite estritamente os seguintes temas ou termos: ${prefs.blockedThemes.join(', ')}.
    6. Duração máxima: O resumo do conteúdo deve ter no máximo 120 palavras.
    7. Formato: O roteiro deve obrigatoriamente incluir:
       - Uma abertura característica elegante do estilo de locução (ex: "Olá ouvinte, hora do Momento Informativo VoxGen de hoje!" ou similar adaptado ao estilo).
       - O conteúdo informativo inédito e resumido de forma direta.
       - Um encerramento suave que sugira ao usuário continuar curtindo a programação (ex: "Fique ligado, daqui a pouco voltamos com mais músicas no seu VoxGen!").
       
    IMPORTANTE: Insira opcionalmente tags de efeitos sonoros rápidos em parênteses para tornar a experiência rica (ex: (sino), (aplausos), (buzina) ou (laser) onde fizer sentido contextual).

    Retorne a resposta estritamente no formato JSON estruturado com os seguintes campos:
    - title: Título criativo e curto do bloco de notícias.
    - script: O roteiro completo para ser lido pela narração (Abertura + Conteúdo + Encerramento).
    - source: As principais fontes de notícias encontradas.
  `;

  // Generate script using Google Search Grounding to get actual, recent facts!
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          script: { type: Type.STRING },
          source: { type: Type.STRING }
        },
        required: ["title", "script", "source"]
      }
    }
  });

  const parsed = JSON.parse(response.text || "{}");
  const scriptText = parsed.script || `Momento Informativo VoxGen sobre ${category}. Continue ouvindo sua playlist!`;
  const newsTitle = parsed.title || `Momento Informativo: ${category}`;
  const newsSource = parsed.source || "Pesquisa Google";

  // Convert script to high-quality audio using existing TTS/Voice Clone system
  console.log(`[SmartPlay] Convertendo roteiro de rádio em áudio com a voz: ${prefs.voiceId}`);
  const audioBase64 = await generateSpeech(scriptText, prefs.voiceId);
  
  // Create block object
  const blockData: Omit<ContentBlock, 'id'> = {
    category,
    title: newsTitle,
    text: scriptText,
    audioBase64,
    voice: prefs.voiceId,
    style: prefs.locutionStyle,
    language: prefs.language,
    duration: Math.round(scriptText.split(' ').length / 2.5), // Rough duration estimate in seconds
    createdAt: Date.now()
  };

  // Cache in Firestore so others can benefit from it (highly optimized)
  const docRef = await addDoc(collection(db, 'contentBlocks'), blockData);
  
  // Save to NewsCache collection as well for traceability
  try {
    const cacheData: Omit<NewsCache, 'id'> = {
      category,
      title: newsTitle,
      summary: scriptText,
      source: newsSource,
      language: prefs.language,
      scope: prefs.scope,
      createdAt: Date.now()
    };
    await addDoc(collection(db, 'newsCache'), cacheData);
  } catch (cacheErr) {
    console.warn("Falha ao salvar no newsCache, continuando:", cacheErr);
  }

  return {
    id: docRef.id,
    ...blockData
  };
}

/**
 * Log when a user plays a SmartPlay block to track user engagement/playback metrics
 */
export async function logPlayback(userId: string, blockId: string, category: string, action: 'play' | 'like' | 'dislike' | 'skip' | 'never_show_again'): Promise<void> {
  try {
    const historyData = {
      userId,
      blockId,
      category,
      action,
      playedAt: Date.now()
    };
    await addDoc(collection(db, 'playbackHistory'), historyData);
  } catch (error) {
    console.warn("Falha ao registrar log de playback do SmartPlay:", error);
  }
}
