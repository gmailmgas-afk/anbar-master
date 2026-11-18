import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: false,
    allowedHosts: true
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true
  },
  build: {
    target: 'es2018',
    chunkSizeWarningLimit: 3000,
    sourcemap: false
  },
  esbuild: {
    target: 'es2018'
  }
});

