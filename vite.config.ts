import { defineConfig } from 'vitest/config';

// Chemins relatifs : le site fonctionne sous le sous-chemin GitHub Pages
// (https://<compte>.github.io/<dépôt>/) comme en local.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
