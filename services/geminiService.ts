
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ToneType, VoiceName, CustomVoice } from "../types";
import { generateProceduralSFX, concatenateAudioBuffers, decodeAudioData } from "../utils/audioUtils";
import { SFX_COMMANDS_HELP } from "../constants";

const STORAGE_KEYS = {
  CUSTOM_VOICES: 'voxgen_custom_voices_v1'
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import { getApprovedVoices } from "./voiceService";

let customVoicesCache: CustomVoice[] = [];

const updateVoicesCache = async () => {
  try {
    customVoicesCache = await getApprovedVoices();
  } catch (e) {
    console.warn("[Gemini Service] Could not update voices cache:", e);
  }
};

// Update cache every 2 minutes
setInterval(updateVoicesCache, 120000);
updateVoicesCache();

const getCustomVoiceById = (id: string): CustomVoice | undefined => {
    return customVoicesCache.find(v => v.id === id);
};

const getMimeTypeFromBase64 = (base64String: string, defaultType: string = 'audio/wav'): string => {
    if (!base64String || !base64String.startsWith('data:')) return defaultType;
    const matches = base64String.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/);
    return matches && matches[1] ? matches[1] : defaultType;
};

export const refineText = async (text: string, tone: ToneType | string, useBackgroundMusic: boolean): Promise<string> => {
  let specificInstruction = "";
  
  if (useBackgroundMusic) {
    specificInstruction += " O usuário solicitou fundo musical. Adapte o ritmo. ";
  }

  if (tone === 'Vignette') {
      specificInstruction += " ESTILO VINHETA DE RÁDIO: Use linguagem impactante, curta e direta. INSERIR EFEITOS SONOROS. ";
  } else if (tone === ToneType.Sales || tone === ToneType.Advertising) {
      specificInstruction += " ESTILO VENDAS: Urgente, persuasivo e impactante. Sugira uso de (caixa) ou (buzina). ";
  } else if (tone === ToneType.Dramatic || tone === ToneType.Storytelling) {
      specificInstruction += " ESTILO DRAMÁTICO/STORYTELLING: Use pausas narrativas, emoção e ritmo de contador de histórias. ";
  } else if (tone === ToneType.Professional) {
      specificInstruction += " ESTILO PROFISSIONAL: Linguagem corporativa, clara e polida. ";
  } else if (tone === ToneType.Romantic) {
      specificInstruction += " ESTILO ROMÂNTICO: Voz suave, pausada e com carga emocional carinhosa. ";
  } else if (tone === ToneType.Suspense) {
      specificInstruction += " ESTILO SUSPENSE: Voz misteriosa, sussurrada em alguns momentos e com ritmo tenso. ";
  } else if (tone === ToneType.Meditation || tone === ToneType.Soothing) {
      specificInstruction += " ESTILO MEDITAÇÃO: Ritmo muito lento, tons de voz tranquilos e pausas longas entre frases. ";
  } else if (tone === ToneType.Motivation) {
      specificInstruction += " ESTILO MOTIVACIONAL: Inspirador, forte, com ênfase em palavras de ação e superação. ";
  } else if (tone === ToneType.News) {
      specificInstruction += " ESTILO JORNALÍSTICO: Objetivo, claro, com a cadência típica de âncoras de notícias. ";
  } else if (tone === ToneType.Review) {
      specificInstruction += " ESTILO REVIEW: Conversacional, honesto, detalhando características de um produto ou serviço. ";
  }

  try {
    const res = await fetch("/api/gemini/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, tone, specificInstruction })
    });
    
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.text || text;
  } catch (e: any) {
    console.error("[Gemini Service] Refine error:", e);
    return text;
  }
};

export const addAutomaticSFX = async (text: string): Promise<string> => {
  if (!text.trim()) return text;
  const availableSFX = SFX_COMMANDS_HELP.join(', ');

  try {
    const res = await fetch("/api/gemini/sfx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, availableSFX })
    });
    
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.text || text;
  } catch (e: any) {
    console.error("[Gemini Service] SFX error:", e);
    return text;
  }
};

const callTTS = async (textChunk: string, voiceName: string, isCustom: boolean): Promise<string> => {
    if (!textChunk.trim()) return "";
    
    const effectiveVoice = voiceName.split('-')[0];
    const customVoiceData = getCustomVoiceById(effectiveVoice);

    const res = await fetch("/api/gemini/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textChunk, voice: voiceName, customVoiceData })
    });

    if (!res.ok) {
      const errorMsg = await res.text();
      throw new Error(errorMsg);
    }
    const data = await res.json();
    return data.base64 || "";
};

export const generateSpeech = async (rawText: string, voice: string): Promise<string> => {
  try {
    const sfxRegex = /(\(.*?\))/g;
    const parts = rawText.split(sfxRegex);
    
    if (parts.length === 1) return await callTTS(rawText, voice, false);
    
    // Create ctx with specific sample rate for TTS (24kHz is standard for Gemini)
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const audioBuffers: AudioBuffer[] = [];

    try {
        for (const part of parts) {
            const segment = part.trim();
            if (!segment) continue;
            
            // Minimal delay to prevent burst limit
            await wait(200);

            if (segment.startsWith('(') && segment.endsWith(')')) {
                const keyword = segment.slice(1, -1);
                try {
                    const sfxBuffer = await generateProceduralSFX(keyword, ctx);
                    audioBuffers.push(sfxBuffer);
                } catch (e) {
                    console.warn(`[Gemini Service] SFX fail: ${keyword}`, e);
                }
            } else {
                const ttsBase64 = await callTTS(segment, voice, false);
                if (ttsBase64) {
                    const ttsBuffer = await decodeAudioData(ttsBase64, ctx);
                    audioBuffers.push(ttsBuffer);
                }
            }
        }

        if (audioBuffers.length === 0) throw new Error("Nenhum áudio gerado.");

        const finalBuffer = concatenateAudioBuffers(audioBuffers, ctx);
        const wavBlob = (await import("../utils/audioUtils")).audioBufferToWav(finalBuffer);
        
        const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = (reader.result as string).split(',')[1];
                resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(wavBlob);
        });

        // Clean up context to avoid browser limits
        await ctx.close();
        return base64;

    } catch (innerError) {
        if (ctx.state !== 'closed') await ctx.close();
        throw innerError;
    }
  } catch (e: any) {
    console.error("[Gemini Service] Critical Speech Gen Error:", e);
    throw new Error(e.message || "Falha ao gerar narração. Verifique sua conexão e limites.");
  }
};

export const analyzeVoiceQuality = async (audioBase64: string, expectedText: string): Promise<any> => { return { clarityScore: 85, feedback: "Boa dicção." }; };
export const planComicStory = async (p: string, n: number): Promise<any> => { return []; };
export const generateImage = async (p: string, s: string, r?: string, l?: string, d?: string): Promise<string> => { return ""; };
export const generateAvatarVideo = async (i: string, p: string): Promise<string> => { return ""; };

export const generateSongMetadata = async (description: string, lyrics?: string): Promise<any> => {
  try {
    const res = await fetch("/api/gemini/song-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, lyrics })
    });
    
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (e) {
    console.error("[Gemini Service] Music metadata error:", e);
    return {
      title: "Nova Música",
      lyrics: lyrics || "Sem letra.",
      styleTag: description,
      coverColor: "#334155"
    };
  }
};

export const summarizeText = async (text: string): Promise<string> => {
  if (!text.trim()) return text;

  try {
    const res = await fetch("/api/gemini/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.text || text;
  } catch (e: any) {
    console.error("[Gemini Service] Summarize error:", e);
    return text;
  }
};
