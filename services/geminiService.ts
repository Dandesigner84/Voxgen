
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ToneType, VoiceName, CustomVoice } from "../types";
import { generateProceduralSFX, concatenateAudioBuffers, decodeAudioData } from "../utils/audioUtils";
import { SFX_COMMANDS_HELP } from "../constants";

const STORAGE_KEYS = {
  CUSTOM_VOICES: 'voxgen_custom_voices_v1'
};

const getClient = () => {
  const rawKey = process.env.GEMINI_API_KEY || "";
  
  if (!rawKey || rawKey === "undefined" || rawKey === "null") {
      console.error("[Gemini] API Key is missing or invalid. Verify your environment variables.");
  }
  
  const cleanKey = rawKey.replace(/["'\s]/g, ""); 
  return new GoogleGenAI({ apiKey: cleanKey });
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import { getApprovedVoices } from "./voiceService";

let customVoicesCache: CustomVoice[] = [];

const updateVoicesCache = async () => {
    customVoicesCache = await getApprovedVoices();
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
  const ai = getClient();
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

  const prompt = `
    Você é um roteirista de áudio profissional (PT-BR) da VoxGen.
    Tarefa: Humanizar o texto para o tom: "${tone}".
    ${specificInstruction}
    
    IMPORTANTE - EFEITOS SONOROS (SFX):
    Você DEVE inserir comandos de efeitos sonoros entre PARÊNTESES onde fizer sentido para o contexto.
    Comandos aceitos: (buzina), (explosao), (aplausos), (risada), (caixa), (sino), (brinde), (laser), (coin).
    
    REGRAS:
    1. Mantenha a mensagem original.
    2. Retorne APENAS o texto final. Sem introduções.
    
    Texto Original: "${text}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });
    
    let cleanedText = response.text?.trim() || text;
    cleanedText = cleanedText.replace(/^["']|["']$/g, "").trim();
    return cleanedText;
  } catch (e) {
    return text; 
  }
};

export const addAutomaticSFX = async (text: string): Promise<string> => {
  if (!text.trim()) return text;
  const ai = getClient();
  const availableSFX = SFX_COMMANDS_HELP.join(', ');

  const prompt = `
    Analise o texto e insira tags de efeitos sonoros contextuais.
    TAGS: ${availableSFX}
    TEXTO: "${text}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });
    return response.text?.trim() || text;
  } catch (e) {
    return text;
  }
};

const callTTS = async (textChunk: string, voiceName: string, isCustom: boolean): Promise<string> => {
    if (!textChunk.trim()) return "";
    
    // Support for OpenAI Voices
    if (voiceName.endsWith('-OI')) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey || apiKey === "undefined") {
            throw new Error("API Key do OpenAI não configurada. Fale com o administrador.");
        }
        
        const cleanVoice = voiceName.split('-')[0].toLowerCase();
        try {
            const response = await fetch("https://api.openai.com/v1/audio/speech", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "tts-1-hd",
                    voice: cleanVoice,
                    input: textChunk
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(`OpenAI: ${err.error?.message || response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return window.btoa(binary);
        } catch (e: any) {
            throw new Error(`Erro OpenAI: ${e.message}`);
        }
    }

    const ai = getClient();
    const MAX_RETRIES = 5;
    let effectiveVoice = voiceName.split('-')[0];
    const customVoiceData = !Object.values(VoiceName).includes(effectiveVoice as VoiceName) && !voiceName.includes('-') 
        ? getCustomVoiceById(effectiveVoice) 
        : null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (customVoiceData && customVoiceData.audioSampleBase64) {
                const mimeType = getMimeTypeFromBase64(customVoiceData.audioSampleBase64);
                const base64Sample = customVoiceData.audioSampleBase64.split(',')[1] || customVoiceData.audioSampleBase64;
                const response = await ai.models.generateContent({
                    model: "gemini-1.5-flash",
                    contents: {
                        parts: [
                            { inlineData: { mimeType: mimeType, data: base64Sample } },
                            { text: `Leia exatamente em Português Brasil: "${textChunk}"` }
                        ]
                    },
                    config: { responseModalities: [Modality.AUDIO] }
                });
                return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
            } 
            const response = await ai.models.generateContent({
                model: "gemini-1.5-flash",
                contents: [{ parts: [{ text: textChunk }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: effectiveVoice } },
                    },
                },
            });
            return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
        } catch (e: any) {
            await wait(Math.pow(2, attempt) * 1000);
            if (attempt === MAX_RETRIES) throw e;
        }
    }
    throw new Error("Falha no TTS.");
};

export const generateSpeech = async (rawText: string, voice: string): Promise<string> => {
  const sfxRegex = /(\(.*?\))/g;
  const parts = rawText.split(sfxRegex);
  if (parts.length === 1) return await callTTS(rawText, voice, false);
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const audioBuffers: AudioBuffer[] = [];

  for (const part of parts) {
      const segment = part.trim();
      if (!segment) continue;
      if (segment.startsWith('(') && segment.endsWith(')')) {
          const keyword = segment.slice(1, -1);
          try {
             const sfxBuffer = await generateProceduralSFX(keyword, ctx);
             audioBuffers.push(sfxBuffer);
          } catch (e) {}
      } else {
          const ttsBase64 = await callTTS(segment, voice, false);
          if (ttsBase64) {
              const ttsBuffer = await decodeAudioData(ttsBase64, ctx);
              audioBuffers.push(ttsBuffer);
          }
      }
  }
  const finalBuffer = concatenateAudioBuffers(audioBuffers, ctx);
  const wavBlob = (await import("../utils/audioUtils")).audioBufferToWav(finalBuffer);
  return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(wavBlob);
  });
};

export const analyzeVoiceQuality = async (audioBase64: string, expectedText: string): Promise<any> => { return { clarityScore: 85, feedback: "Boa dicção." }; };
export const planComicStory = async (p: string, n: number): Promise<any> => { return []; };
export const generateImage = async (p: string, s: string, r?: string, l?: string, d?: string): Promise<string> => { return ""; };
export const generateAvatarVideo = async (i: string, p: string): Promise<string> => { return ""; };

export const generateSongMetadata = async (description: string, lyrics?: string): Promise<any> => {
  const ai = getClient();
  const prompt = `
    Como um assistente de estúdio musical IA, analise a descrição e as letras (se houver) para sugerir metadados para uma música.
    Descrição: ${description}
    Letras: ${lyrics || "Instrumental"}
    
    Retorne um JSON com:
    - title: Título criativo
    - lyrics: Letras completas (ou as fornecidas, ou geradas se for modo simples)
    - styleTag: Tag curta de estilo (ex: "Pop Animado", "Heavy Metal")
    - coverColor: Cor hexadecimal para a capa
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            lyrics: { type: Type.STRING },
            styleTag: { type: Type.STRING },
            coverColor: { type: Type.STRING }
          },
          required: ["title", "lyrics", "styleTag", "coverColor"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (e) {
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
  const ai = getClient();

  const prompt = `
    Você é um especialista em síntese de conteúdo.
    Tarefa: Resumir o texto abaixo mantendo os pontos principais, mas reduzindo drasticamente o número de palavras (em cerca de 70-80%).
    O objetivo é preparar o texto para uma narração curta e objetiva.
    
    REGRAS:
    1. Retorne APENAS o resumo final em Português Brasil.
    2. Linguagem natural e fluida para áudio.
    3. Mantenha a essência e os fatos principais.
    
    TEXTO PARA RESUMIR:
    "${text}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });
    return response.text?.trim() || text;
  } catch (e) {
    console.error("Erro ao resumir:", e);
    return text;
  }
};
