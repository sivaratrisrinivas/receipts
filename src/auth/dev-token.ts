// LOCAL DEV ONLY. OAuth cannot complete on localhost with the Space's client, so in
// `vite dev` the dev server (scripts/vite-dev-token.ts) hands the page the developer's
// own HF token. This module is only ever reached through a dynamic import behind
// `import.meta.env.DEV`, so it is not part of the production build.

import type { AuthPort, Session } from '../app/auth';

const DEV_TOKEN_ROUTE = '/__dev/hf-token';

export function createDevToken(): AuthPort {
  return {
    async restore() {
      try {
        const response = await fetch(DEV_TOKEN_ROUTE);
        if (!response.ok) return { session: null, notice: 'No Hugging Face token found for local development. Run `hf auth login` or set HF_TOKEN, then reload.' };
        const session: Session = {
          accessToken: (await response.text()).trim(),
          expiresAt: Date.now() + 8 * 3_600_000,
          username: 'local dev',
        };
        return { session };
      } catch {
        return { session: null, notice: 'The dev server did not hand over a Hugging Face token.' };
      }
    },
    async signIn() {
      location.reload();
    },
    signOut() {},
    forget() {},
  };
}
