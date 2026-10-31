// Picks the right sign-in for where the page is running.

import type { AuthPort } from '../app/auth';
import { createHfOAuth, hasSpaceOAuth } from './hf-oauth';

export async function createAuth(): Promise<AuthPort> {
  if (hasSpaceOAuth()) return createHfOAuth();

  if (import.meta.env.DEV) {
    // Dynamic import, so Vite leaves the dev-token code out of production builds.
    const { createDevToken } = await import('./dev-token');
    return createDevToken();
  }

  // Served somewhere other than the Space (a preview, a copy): OAuth is not configured.
  return {
    restore: async () => ({
      session: null,
      notice: 'Sign-in with Hugging Face only works on the Receipts Space (huggingface.co/spaces/Srini410/receipts).',
    }),
    signIn: async () => {
      throw new Error('Sign-in with Hugging Face only works on the Receipts Space.');
    },
    signOut() {},
    forget() {},
  };
}
