// The app's view of sign-in. The real implementation (Hugging Face OAuth, or a dev
// token on localhost) lives in src/auth/; the app flow only sees this port.

/** A Giver's signed-in session. The token is the Giver's own and is sent only to the HF router. */
export interface Session {
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  username: string;
  picture?: string;
}

export interface AuthPort {
  /** Finish a sign-in redirect if one is in the URL, or restore the stored session. */
  restore(): Promise<{ session: Session | null; notice?: string }>;
  /** Start sign-in. Navigates away from the page, so it normally never resolves usefully. */
  signIn(): Promise<void>;
  signOut(): void;
  /** Drop a stored session that Hugging Face no longer accepts, without leaving the page. */
  forget(): void;
}
