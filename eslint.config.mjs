// @ts-check
// One ESLint setup for the monorepo. Packages and apps/api lint with this file
// (`eslint .` from their folder); apps/web has its own eslint.config.mjs that
// reuses `baseConfig` + `webConfig` with paths relative to apps/web. Running
// eslint from the repo root lints apps/web with the same React/Next rules.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

/** Build output, dependencies and generated files — never linted. */
export const ignores = [
  '**/dist/**', '**/.turbo/**', '**/node_modules/**', '**/coverage/**', '**/build/**',
  '**/.next/**', '**/.next-*/**', '**/out/**', '**/next-env.d.ts', '**/*.tsbuildinfo',
];

const nodeGlobals = Object.fromEntries(
  ['console', 'process', 'Buffer', 'URL', 'URLSearchParams', 'fetch', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', '__dirname', '__filename', 'require', 'module', 'globalThis']
    .map(g => [g, /** @type {const} */ ('readonly')]),
);

/** Shared JS/TS rules for every package. */
export const baseConfig = tseslint.config(
  { ignores },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': 'warn',
      // `declare global { namespace Express { … } }` is how Express types are augmented.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
  {
    // Plain JS run by Node (build scripts, Postman generators, config files).
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    // CLIs print to the terminal on purpose.
    files: ['**/scripts/**', '**/postman/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // Tests: loose JSON reads and fakes that capture `this` are fine here.
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'no-console': 'off',
    },
  },
);

/**
 * React hooks + Next.js rules for the web app.
 * @param {string} root   the Next app folder, relative to the config file ('.' or 'apps/web')
 */
export function webConfig(root) {
  const prefix = root === '.' ? '' : `${root}/`;
  return [
    {
      files: [`${prefix}**/*.{js,jsx,mjs,ts,tsx}`],
      plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
      settings: { next: { rootDir: root } },
      rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
      },
    },
    {
      // Node scripts and config files run outside the browser.
      files: [`${prefix}scripts/**`, `${prefix}*.config.{js,mjs,ts}`],
      rules: { 'no-console': 'off' },
    },
  ];
}

export default tseslint.config(
  ...baseConfig,
  // Legacy frontend kept for reference only; it has its own toolchain.
  { ignores: ['frontend/**'] },
  ...webConfig('apps/web'),
);
