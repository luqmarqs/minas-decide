import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Database/RLS tests run against the TARGET project only (dev) using
 * SUPABASE_TARGET_URL / SUPABASE_TARGET_ANON_KEY / SUPABASE_TARGET_SERVICE_ROLE_KEY
 * from the process environment. They are skipped when those are absent.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@worker': fileURLToPath(new URL('./worker', import.meta.url)),
    },
  },
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
