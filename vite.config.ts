import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

/** Frontend API origin encoded in a Clerk publishable key (`pk_<env>_<base64(host$)>`). */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const m = /^pk_(test|live)_([A-Za-z0-9+/=]+)$/.exec(publishableKey ?? '');
  if (!m) return null;
  const host = Buffer.from(m[2] ?? '', 'base64')
    .toString('utf8')
    .replace(/\$$/, '');
  return /^[a-z0-9.-]+$/.test(host) ? `https://${host}` : null;
}

/**
 * `public/_headers` carries the CSP with the placeholder `__CLERK_FAPI_ORIGIN__`; after the build
 * it is replaced with the origin decoded from VITE_CLERK_PUBLISHABLE_KEY of the active mode
 * (dev/staging: `<slug>.clerk.accounts.dev`; production: `clerk.minasdecide.com.br`). Without a
 * key (tests, builds with Clerk unconfigured) the placeholder is removed, keeping the CSP strict.
 */
function cspClerkOrigin(mode: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'minas-decide:csp-clerk-origin',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const origin = clerkFrontendApiOrigin(env.VITE_CLERK_PUBLISHABLE_KEY) ?? '';
      const file = resolve(outDir, '_headers');
      const text = readFileSync(file, 'utf8');
      writeFileSync(file, text.replace(/ ?__CLERK_FAPI_ORIGIN__/g, origin ? ` ${origin}` : ''));
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), cspClerkOrigin(mode)],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl', 'pmtiles'],
          react: ['react', 'react-dom', 'react-router'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
}));
