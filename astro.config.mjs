// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://4nrry.dev',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', { path: 'pt', codes: ['pt-BR'] }],
  },

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
