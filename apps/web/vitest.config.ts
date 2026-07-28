import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Lean unit-test setup for the web app: pure logic only (no jsdom / component
// rendering). The `@` alias mirrors tsconfig so tests import like the app does.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
