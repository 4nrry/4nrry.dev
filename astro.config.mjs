// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://4nrry.dev',

  vite: {
    plugins: [tailwindcss()],
    server: {
      // In dev, /api is served by `wrangler dev` (just dev-worker) on :8787
      proxy: {
        '/api': 'http://localhost:8787',
      },
    },
  },
});
