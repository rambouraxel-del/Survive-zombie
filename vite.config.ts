import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

// Identifiant de version affiché dans le jeu (écran titre, options) : commit + date du build.
function version(): string {
  let sha = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
  try {
    if (!sha) sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    sha = 'local';
  }
  return `${sha} · ${new Date().toISOString().slice(0, 10)}`;
}

// Chemins relatifs : le site fonctionne sous le sous-chemin GitHub Pages
// (https://<compte>.github.io/<dépôt>/) comme en local.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version()) },
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
