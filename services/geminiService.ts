import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ToneType, CustomVoice } from "../types";
import { generateProceduralSFX, concatenateAudioBuffers, decodeAudioData } from "../utils/audioUtils";
import { SFX_COMMANDS_HELP } from "../constants";

const getGeminiClient = () => {
    // Trim and clean the API key just in case define/env added weirdness
    const apiKey = (process.env.GEMINI_API_KEY || "").trim().replace(/["'\s]/g, "");
    return new GoogleGenAI({ apiKey });
};

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
    const ai = getGeminiClient();
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          text: `
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
          `
        }
      ]
    });
    
    let refinedText = result.text || text;
    refinedText = refinedText.replace(/^["']|["']$/g, "").trim();
    return refinedText;
  } catch (e: any) {
    if (e.message?.includes("API_KEY_INVALID") || e.message?.includes("PERMISSION_DENIED")) {
        console.error("[Gemini] Erro de autenticação. Verifique sua API Key no painel Configurações > Secrets.");
    }
    console.error("[Gemini Service] Refine error:", e);
    return text;
  }
};

export const addAutomaticSFX = async (text: string): Promise<string> => {
  if (!text.trim()) return text;
  const availableSFX = SFX_COMMANDS_HELP.join(', ');

  try {
    const ai = getGeminiClient();
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          text: `
            Analise o texto e insira tags de efeitos sonoros contextuais de forma discreta e profissional.
            TAGS DISPONÍVEIS: ${availableSFX}
            REGRAS:
            1. Insira as tags entre parênteses, ex: (buzina).
            2. Retorne o texto COMPLETO com as tags inseridas.
            3. Não mude as palavras do texto, apenas insira os efeitos.
            
            TEXTO: "${text}"
          `
        }
      ]
    });
    
    return result.text || text;
  } catch (e: any) {
    console.error("[Gemini Service] SFX error:", e);
    return text;
  }
};

const callTTS = async (textChunk: string, voiceName: string, isCustom: boolean): Promise<string> => {
    if (!textChunk.trim()) return "";
    
    const effectiveVoice = voiceName.split('-')[0];
    const customVoiceData = getCustomVoiceById(effectiveVoice);

    try {
        if (voiceName.endsWith('-OI')) {
            const res = await fetch("/api/gemini/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: textChunk, voice: voiceName })
            });

            if (!res.ok) {
                const errorMsg = await res.text();
                throw new Error(errorMsg);
            }
            const data = await res.json();
            return data.base64 || "";
        }

        const ai = getGeminiClient();
        
        if (customVoiceData && customVoiceData.audioSampleBase64) {
            const base64Data = customVoiceData.audioSampleBase64.split(',')[1] || customVoiceData.audioSampleBase64;
            const mimeType = getMimeTypeFromBase64(customVoiceData.audioSampleBase64);

            const result = await ai.models.generateContent({
                model: "gemini-3.1-flash-tts-preview",
                contents: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data
                        }
                    },
                    { text: `Siga o timbre e estilo deste áudio. Leia exatamente este texto com emoção e clareza em Português Brasil: "${textChunk}"` }
                ]
            });

            return result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data || "";
        } else {
            const validGeminiVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Zephyr'];
            const finalVoice = validGeminiVoices.includes(effectiveVoice) ? effectiveVoice : 'Kore';

            const result = await ai.models.generateContent({
                model: "gemini-3.1-flash-tts-preview",
                contents: [{ parts: [{ text: textChunk }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: finalVoice } },
                    },
                },
            });

            return result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data || "";
        }
    } catch (e: any) {
        if (e.message?.includes("API_KEY_INVALID") || e.message?.includes("PERMISSION_DENIED")) {
            console.error("[Gemini TTS] Erro de autenticação. Verifique sua API Key no painel Configurações > Secrets.");
        }
        console.error("[Gemini Service] TTS error:", e);
        throw e;
    }
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
    const ai = getGeminiClient();
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          text: `
            Como um assistente de estúdio musical IA, analise a descrição e as letras (se houver) para sugerir metadados para uma música.
            Descrição: ${description}
            Letras: ${lyrics || "Instrumental"}
            
            Retorne um JSON com:
            - title: Título criativo
            - lyrics: Letras completas (ou as fornecidas, ou geradas se for modo simples)
            - styleTag: Tag curta de estilo (ex: "Pop Animado", "Heavy Metal")
            - coverColor: Cor hexadecimal para a capa
          `
        }
      ],
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
        } as any
      }
    });

    return JSON.parse(result.text || "{}");
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
    const ai = getGeminiClient();
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          text: `
            Você é um especialista em síntese de conteúdo.
            Tarefa: Resumir o texto abaixo mantendo os pontos principais, mas reduzindo drasticamente o número de palavras (em cerca de 70-80%).
            O objetivo é preparar o texto para uma narração curta e objetiva.
            
            REGRAS:
            1. Retorne APENAS o resumo final em Português Brasil.
            2. Linguagem natural e fluida para áudio.
            3. Mantenha a essência e os fatos principais.
            
            TEXTO PARA RESUMIR:
            "${text}"
          `
        }
      ]
    });
    
    return result.text || text;
  } catch (e: any) {
    console.error("[Gemini Service] Summarize error:", e);
    return text;
  }
};
