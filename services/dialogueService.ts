import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { GoogleGenAI, Type } from '@google/genai';
import { 
  DialogueSpeaker, 
  DialogueLine, 
  DialogueHistoryItem, 
  ContentBlock 
} from '../types';
import { generateSpeech } from './geminiService';
import { decodeAudioData, concatenateAudioBuffers } from '../utils/audioUtils';

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
    throw new Error("Chave de API do Gemini não configurada para o gerador de diálogos.");
  }
  
  return new GoogleGenAI({ apiKey: cleanKey });
};

/**
 * AI Dialogue Script Generator
 */
export async function generateDialogueScript(params: {
  situation: string;
  speakerA: DialogueSpeaker;
  speakerB: DialogueSpeaker;
  turnsCount: number;
}): Promise<{
  title: string;
  lines: DialogueLine[];
}> {
  const ai = getGeminiClient();

  const prompt = `
    Você é um roteirista profissional de rádio, podcast e teatro de voz da plataforma VoxGen AI.
    Sua missão é criar um diálogo natural, envolvente e realista entre DOIS locutores/personagens.
    
    PERSONAGEM A (Speaker A):
    - Nome: "${params.speakerA.name}"
    - Estilo/Tom: "${params.speakerA.tone}"
    
    PERSONAGEM B (Speaker B):
    - Nome: "${params.speakerB.name}"
    - Estilo/Tom: "${params.speakerB.tone}"
    
    SITUAÇÃO / TEMA DO DIÁLOGO:
    "${params.situation}"
    
    REGRAS DE ROTEIRO:
    1. Crie exatamente ${params.turnsCount} falas alternadas (começando com Speaker A, depois Speaker B, etc.).
    2. Garanta dinamicidade, naturalidade e ritmo de rádio/podcast em Português do Brasil.
    3. As falas devem refletir o tom e personalidade de cada personagem.
    4. Inclua um título sugestivo para esta vinheta/diálogo.
    5. Cada fala deve ter entre 1 e 3 frases curtas e diretas.
    
    Retorne estritamente um JSON com a seguinte estrutura:
    {
      "title": "Título do Diálogo",
      "lines": [
        {
          "speakerId": "A",
          "text": "Texto da fala do Personagem A",
          "emotion": "Entusiasmado",
          "pauseAfterSec": 0.4
        },
        {
          "speakerId": "B",
          "text": "Texto da fala do Personagem B",
          "emotion": "Curioso",
          "pauseAfterSec": 0.4
        }
      ]
    }
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
    config: {
      temperature: 0.75,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          lines: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                speakerId: { type: Type.STRING },
                text: { type: Type.STRING },
                emotion: { type: Type.STRING },
                pauseAfterSec: { type: Type.NUMBER }
              },
              required: ["speakerId", "text"]
            }
          }
        },
        required: ["title", "lines"]
      }
    }
  });

  const parsed = JSON.parse(response.text || "{}");
  const title = parsed.title || `Diálogo: ${params.speakerA.name} & ${params.speakerB.name}`;
  const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];

  const lines: DialogueLine[] = rawLines.map((l: any, idx: number) => ({
    id: `line_${Date.now()}_${idx}`,
    speakerId: l.speakerId === 'B' ? 'B' : 'A',
    text: l.text || '',
    emotion: l.emotion || 'Normal',
    pauseAfterSec: typeof l.pauseAfterSec === 'number' ? l.pauseAfterSec : 0.4
  }));

  return { title, lines };
}

/**
 * Creates a silence buffer for pauses between speakers
 */
function createSilenceBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const sampleRate = ctx.sampleRate || 24000;
  const numFrames = Math.max(1, Math.ceil(seconds * sampleRate));
  return ctx.createBuffer(1, numFrames, sampleRate);
}

/**
 * Synthesize audio for all dialogue turns and combine into a single AudioBuffer
 */
export async function synthesizeDialogueAudio(
  lines: DialogueLine[],
  speakerA: DialogueSpeaker,
  speakerB: DialogueSpeaker,
  ctx: AudioContext,
  onProgress?: (currentTurn: number, totalTurns: number, currentSpeakerName: string) => void
): Promise<{
  audioBuffer: AudioBuffer;
  duration: number;
  voiceBase64List: string[];
}> {
  if (lines.length === 0) {
    throw new Error("Nenhuma fala configurada para o diálogo.");
  }

  const audioBuffers: AudioBuffer[] = [];
  const voiceBase64List: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSpeakerA = line.speakerId === 'A';
    const speaker = isSpeakerA ? speakerA : speakerB;

    if (onProgress) {
      onProgress(i + 1, lines.length, speaker.name);
    }

    if (!line.text.trim()) continue;

    // Call TTS for this turn's voice
    const ttsBase64 = await generateSpeech(line.text.trim(), speaker.voice);
    if (ttsBase64) {
      voiceBase64List.push(ttsBase64);
      const decodedBuf = await decodeAudioData(ttsBase64, ctx);
      audioBuffers.push(decodedBuf);

      // Add pause silence buffer after turn
      const pauseDuration = line.pauseAfterSec ?? 0.4;
      if (pauseDuration > 0) {
        audioBuffers.push(createSilenceBuffer(ctx, pauseDuration));
      }
    }
  }

  if (audioBuffers.length === 0) {
    throw new Error("Falha ao sintetizar o áudio das falas do diálogo.");
  }

  const combinedBuffer = concatenateAudioBuffers(audioBuffers, ctx);
  return {
    audioBuffer: combinedBuffer,
    duration: combinedBuffer.duration,
    voiceBase64List
  };
}

/**
 * Save Dialogue History to Firestore
 */
export async function saveDialogueHistoryItem(
  item: Omit<DialogueHistoryItem, 'id'>
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'dialogueHistory'), item);
    return docRef.id;
  } catch (err) {
    console.error("Erro ao salvar histórico do diálogo:", err);
    return crypto.randomUUID();
  }
}

/**
 * Get Dialogue History for User
 */
export async function getDialogueHistory(userId: string): Promise<DialogueHistoryItem[]> {
  try {
    const q = query(
      collection(db, 'dialogueHistory'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const snap = await getDocs(q);
    const historyList: DialogueHistoryItem[] = [];
    snap.forEach((docSnap) => {
      historyList.push({ id: docSnap.id, ...docSnap.data() } as DialogueHistoryItem);
    });
    return historyList;
  } catch (err) {
    console.warn("Erro ao carregar histórico de diálogos:", err);
    return [];
  }
}

/**
 * Export Dialogue Audio directly to Smart Play queue
 */
export async function exportDialogueToSmartPlay(
  item: DialogueHistoryItem,
  audioBase64: string
): Promise<void> {
  try {
    const blockData: Omit<ContentBlock, 'id'> = {
      category: "💬 Diálogos IA",
      title: item.title,
      text: `Diálogo entre ${item.speakerA.name} (${item.speakerA.voice}) e ${item.speakerB.name} (${item.speakerB.voice}): "${item.situation}"`,
      audioBase64: audioBase64,
      voice: `${item.speakerA.voice} & ${item.speakerB.voice}`,
      style: "Diálogo / Dupla Locução",
      language: "pt",
      duration: Math.round(item.duration),
      createdAt: item.createdAt
    };

    await addDoc(collection(db, 'contentBlocks'), blockData);
    console.log(`[Diálogo IA] Diálogo exportado com sucesso para a categoria '💬 Diálogos IA' no Smart Play!`);
  } catch (err) {
    console.error("Erro ao exportar diálogo para o Smart Play:", err);
  }
}
