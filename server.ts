import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";

export const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API Routes
app.post("/api/gemini/tts", async (req, res) => {
  try {
    const { text, voice } = req.body;
    
    // This route is now primarily used for OpenAI fallback
    // Gemini TTS logic has been moved to the frontend per guidelines
    
    if (voice && voice.endsWith('-OI')) {
      const openAiKey = process.env.OPENAI_API_KEY;
      if (openAiKey && (openAiKey !== "undefined" && openAiKey !== "null")) {
        const cleanVoice = voice.split('-')[0].toLowerCase();
        try {
          const openAiRes = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openAiKey.replace(/["'\s]/g, "")}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "tts-1",
              input: text,
              voice: cleanVoice
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
      return res.status(401).json({ error: "OpenAI API Key não configurada ou inválida." });
    }

    res.status(400).json({ error: "Solicitação inválida para o servidor." });
  } catch (error: any) {
    console.error("[Server TTS] Error:", error);
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

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
