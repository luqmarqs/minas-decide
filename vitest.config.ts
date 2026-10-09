import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

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
          setupFiles: ['./src/tests/setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'worker',
          include: ['worker/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
