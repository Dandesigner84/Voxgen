
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

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
      VitePWA({
        registerType: 'prompt', // Will use a prompt to trigger update
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'VoxGen AI',
          short_name: 'VoxGen',
          description: 'Estúdio de Voz Inteligente',
          theme_color: '#020617',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        devOptions: {
          enabled: true // Allows testing in dev mode
        }
      })
    ],
    define: {
      // Injeta a chave no processo do navegador
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
    },
  };
});
