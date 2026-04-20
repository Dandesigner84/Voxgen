
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega variáveis de ambiente, aceitando qualquer prefixo
  const env = loadEnv(mode, (process as any).cwd(), '');

  // Prioriza GEMINI_API_KEY mas aceita fallbacks
  const apiKey = env.GEMINI_API_KEY || env.API_KEY || env.VITE_API_KEY || env.VITE_GOOGLE_API_KEY || env.GOOGLE_API_KEY || '';

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      // Injeta a chave no processo do navegador
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
    },
  };
});
