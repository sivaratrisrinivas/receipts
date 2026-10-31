import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs so the static build works from any Space path.
  base: './',
  test: {
    include: ['tests/**/*.test.ts', 'eval/**/*.test.ts'],
  },
});
