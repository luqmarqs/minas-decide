import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/** Test-only public config: tests must not depend on a developer's .env (CI has none). */
const testEnv = {
  VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  VITE_SNAPSHOT_BASE: '/data',
};

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
  '@worker': fileURLToPath(new URL('./worker', import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'scripts/**/*.test.ts'],
          environment: 'jsdom',
          env: testEnv,
          setupFiles: ['./src/tests/setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'worker',
          include: ['worker/**/*.test.ts'],
          environment: 'node',
          env: testEnv,
        },
      },
    ],
  },
});
