import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Lean unit-test setup for the web app: pure logic, plus server-rendered smoke
// tests of the shared primitives (react-dom/server; no jsdom). The `@` alias
// mirrors tsconfig so tests import like the app does.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Same JSX runtime as Next, so components render in tests without importing React.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
