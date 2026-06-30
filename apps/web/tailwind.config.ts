import type { Config } from 'tailwindcss';

/**
 * Tailwind v4 — This config is for VS Code IntelliSense only.
 * The actual design tokens are in globals.css @theme block.
 * Do NOT add @config directive in globals.css.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
