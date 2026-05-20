
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Suporte flexível para múltiplos nomes de chaves no deploy (Vercel)
  const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.API_KEY || env.VITE_API_KEY || env.GOOGLE_API_KEY || env.VITE_GOOGLE_API_KEY || '';
  const openaiKey = env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '';
  const webhookUrl = env.VITE_REGISTRATION_WEBHOOK_URL || env.REGISTRATION_WEBHOOK_URL || '';

  return {
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
      'process.env.OPENAI_API_KEY': JSON.stringify(openaiKey),
      'process.env.VITE_REGISTRATION_WEBHOOK_URL': JSON.stringify(webhookUrl),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
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
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        },
        devOptions: {
          enabled: true
        }
      })
    ],
  };
});
