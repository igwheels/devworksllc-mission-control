import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static SPA build. The API lives in `functions/` and is served by Cloudflare
// Pages Functions (and by `wrangler pages dev` locally) — Vite only builds `dist/`.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
