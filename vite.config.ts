import { defineConfig } from 'vitest/config';
import { devHfToken } from './scripts/vite-dev-token.ts';

export default defineConfig({
  // Relative asset URLs so the static build works from any Space path.
  base: './',
  // Serve-only: lets `npm run dev` use your local HF token instead of OAuth. Absent from `vite build`.
  plugins: [devHfToken()],
  test: {
    include: ['tests/**/*.test.ts', 'eval/**/*.test.ts'],
    // The long-Conversation tests build, read and split megabytes of text (4s of a 5s limit when the files run in
    // parallel). Redaction is no longer the slow part: it skips the email pattern for text with no `@`.
    testTimeout: 20_000,
  },
});
