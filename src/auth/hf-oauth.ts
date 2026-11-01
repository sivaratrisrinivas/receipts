// Sign in with Hugging Face from a static Space. The Space README sets `hf_oauth: true`
// and `hf_oauth_scopes: [inference-api]`, so HF injects `window.huggingface.variables`
// (OAUTH_CLIENT_ID, OAUTH_SCOPES) into index.html and `oauthLoginUrl()` needs no arguments.
// The client is public (PKCE): there is no secret, and no API key for the Giver to paste.
//
// The access token lives in sessionStorage for this tab only, and goes only to the HF router.

import { oauthHandleRedirectIfPresent, oauthLoginUrl } from '@huggingface/hub';
import type { AuthPort, Session } from '../app/auth';

const SESSION_KEY = 'receipts:hf-session';
const NEEDED_SCOPE = 'inference-api';

/** Whether this page was served by a Space with OAuth switched on. */
export function hasSpaceOAuth(): boolean {
  return Boolean(spaceVariables()?.OAUTH_CLIENT_ID);
}

function spaceVariables(): Record<string, string> | undefined {
  return (window as unknown as { huggingface?: { variables?: Record<string, string> } }).huggingface?.variables;
}

export function createHfOAuth(): AuthPort {
  return {
    async restore() {
      try {
        // Completes a sign-in redirect (?code=...&state=...). Resolves false when there is none,
        // and throws when HF sent back ?error=...
        const result = await oauthHandleRedirectIfPresent();
        if (result) {
          // Drop ?code&state so a refresh does not look like a half-finished sign-in.
          history.replaceState(null, '', location.pathname);
          if (!result.scope.split(' ').includes(NEEDED_SCOPE)) {
            return {
              session: null,
              notice: 'Receipts needs your permission to ask Beam on your behalf (inference-api). Sign in again and allow it.',
            };
          }
          const session: Session = {
            accessToken: result.accessToken,
            expiresAt: result.accessTokenExpiresAt.getTime(),
            username: result.userInfo.preferred_username,
            ...(result.userInfo.picture ? { picture: result.userInfo.picture } : {}),
          };
          saveSession(session);
          return { session };
        }
      } catch (error) {
        history.replaceState(null, '', location.pathname);
        return { session: null, notice: describeSignInError(error) };
      }
      return { session: loadSession() };
    },

    async signIn() {
      const url = await oauthLoginUrl({
        // A clean redirect_uri inside the Space; any URL inside the Space is allowed.
        redirectUrl: location.origin + location.pathname,
      });
      // In place, as in HF's own example; it works inside the Space's iframe.
      window.location.href = url;
    },

    signOut() {
      clearSession();
    },
    forget() {
      clearSession();
    },
  };
}

function describeSignInError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('access_denied')) return 'Sign-in was cancelled. Sign in with Hugging Face to carry on.';
  return `Sign-in did not complete: ${message}`;
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as Session) : null;
    // Treat a session with under a minute left as expired: a Beam call takes about that long.
    return session && session.expiresAt - Date.now() > 60_000 ? session : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked: the session still works until the page is reloaded.
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored.
  }
}
