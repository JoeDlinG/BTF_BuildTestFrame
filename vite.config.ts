import { defineConfig } from 'vite';

// Relative base keeps the built site usable on GitHub Pages and from file:// previews.
export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
