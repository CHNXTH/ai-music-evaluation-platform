import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/ai-music-evaluation-platform/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          database: ['dexie'],
          validation: ['zod'],
          ui: ['@radix-ui/react-dialog', 'lucide-react'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
