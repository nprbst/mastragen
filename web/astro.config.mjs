import { defineConfig } from 'astro/config';
import honoAstro from 'hono-astro-adapter';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [
    react(),
    tailwind(),
  ],
  output: 'server',
  adapter: honoAstro(),
  vite: {
    ssr: {
      // Bundle all dependencies for portability (Docker)
      noExternal: true,
    },
  },
});
