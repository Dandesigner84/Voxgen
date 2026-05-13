import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality, Type } from "@google/genai";

export const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Middleware to get Gemini client
const getGeminiClient = () => {
  const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_API_KEY || "";
  const apiKey = rawKey.trim();
  
  if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey === "PLACEHOLDER_API_KEY") {
    console.error("[Server Gemini] Error: GEMINI_API_KEY is missing or restricted.");
    throw new Error("Configuração de API do Gemini ausente no servidor. Verifique as variáveis de ambiente.");
  }
  
  // Clean potential quotes and whitespace
  const cleanKey = apiKey.replace(/^["']|["']$/g, "").trim();
  
  // Safe logging
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Server Gemini] Initializing with key starting with: ${cleanKey.substring(0, 4)}...`);
  }
  
  return new GoogleGenAI({ apiKey: cleanKey });
};

// Helper to get text from candidate response
const getResponseText = (response: any) => {
  try {
    return response.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || "";
  } catch (e) {
    return "";
  }
};

// API Routes
app.post("/api/gemini/refine", async (req, res) => {
  try {
    const { text, tone, specificInstruction } = req.body;
    const ai = getGeminiClient();
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

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    let refinedText = getResponseText(response) || text;
    refinedText = refinedText.replace(/^["']|["']$/g, "").trim();

    res.json({ text: refinedText });
  } catch (error: any) {
    console.error("[Server Gemini Refine] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/gemini/sfx", async (req, res) => {
  try {
    const { text, availableSFX } = req.body;
    const ai = getGeminiClient();
    const prompt = `
      Analise o texto e insira tags de efeitos sonoros contextuais.
      TAGS: ${availableSFX}
      TEXTO: "${text}"
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    res.json({ text: getResponseText(response) || text });
  } catch (error: any) {
    console.error("[Server Gemini SFX] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/gemini/tts", async (req, res) => {
  try {
    const { text, voice, customVoiceData } = req.body;
    const ai = getGeminiClient();
    
    // Check OpenAI if requested
    if (voice && voice.endsWith('-OI')) {
      const openAiKey = process.env.OPENAI_API_KEY;
      if (openAiKey && openAiKey !== "undefined" && openAiKey !== "null") {
        const cleanVoice = voice.split('-')[0].toLowerCase();
        try {
          const openAiRes = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openAiKey.replace(/["'\s]/g, "")}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "tts-1-hd",
              voice: cleanVoice,
              input: text
            })
          });

          if (openAiRes.ok) {
            const arrayBuffer = await openAiRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return res.json({ base64: buffer.toString('base64') });
          }
        } catch (e) {
          console.error("[Server OpenAI TTS] Error:", e);
        }
      }
    }

    if (customVoiceData && customVoiceData.audioSampleBase64) {
      const base64Data = customVoiceData.audioSampleBase64.split(',')[1] || customVoiceData.audioSampleBase64;
      const mimeType = customVoiceData.audioSampleBase64.match(/^data:([^;]+);/)?.[1] || 'audio/wav';

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              },
              { text: `Siga o timbre e estilo deste áudio. Leia exatamente este texto com emoção e clareza em Português Brasil: "${text}"` }
            ]
          }
        ],
        config: {
          responseModalities: [Modality.AUDIO]
        }
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      return res.json({ base64: audioPart || "" });
    } else {
      const validGeminiVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'];
      const effectiveVoice = voice.split('-')[0];
      const finalVoice = validGeminiVoices.includes(effectiveVoice) ? effectiveVoice : 'Kore';

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: finalVoice } },
          },
        },
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      return res.json({ base64: audioPart || "" });
    }
  } catch (error: any) {
    console.error("[Server Gemini TTS] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/gemini/summarize", async (req, res) => {
  try {
    const { text } = req.body;
    const ai = getGeminiClient();
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

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    res.json({ text: getResponseText(response) || text });
  } catch (error: any) {
    console.error("[Server Gemini Summarize] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/gemini/song-metadata", async (req, res) => {
  try {
    const { description, lyrics } = req.body;
    const ai = getGeminiClient();
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

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
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

    res.json(JSON.parse(getResponseText(response) || "{}"));
  } catch (error: any) {
    console.error("[Server Gemini Music] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Start server if this file is run directly
if (process.env.NODE_ENV !== "test" && (import.meta as any).url?.endsWith(process.argv[1])) {
  startServer();
}

export default app;
