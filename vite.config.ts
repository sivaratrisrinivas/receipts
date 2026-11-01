import { defineConfig } from 'vitest/config';
import { devHfToken } from './scripts/vite-dev-token.ts';

export default defineConfig({
  // Relative asset URLs so the static build works from any Space path.
  base: './',
  // Serve-only: lets `npm run dev` use your local HF token instead of OAuth. Absent from `vite build`.
  plugins: [devHfToken()],
  test: {
    include: ['tests/**/*.test.ts', 'eval/**/*.test.ts'],
    // The long-Conversation tests build and redact megabytes of text; 5s is too tight when the files run in parallel.
    testTimeout: 20_000,
  },
});
