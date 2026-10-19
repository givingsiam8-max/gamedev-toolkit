import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1800,
    reportCompressedSize: false,
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
});
