// The app's flow: sign in, choose an Occasion, make the Poem, recover from failures.
// All I/O comes in through `AppDeps`, so the flow runs the same in tests and in the browser.

import type { BeamPort } from '../beam/port';
import type { Sender } from '../domain';
import { makePoem } from '../pipeline';
import type { RawSource } from '../sources';
import type { AuthPort, Session } from './auth';
import { describeFailure } from './failure';
import { initialState, reduce, type Action, type AppState, type ComposeInput } from './state';
import { createStore } from './store';

export interface AppDeps {
  auth: AuthPort;
  /** Load the Conversation's raw texts (for now the Gallery). */
  loadSource(): Promise<RawSource>;
  /** A Beam port that calls Beam under this Giver's own account. */
  makeBeam(session: Session): BeamPort;
  now(): number;
}

/** In the Gallery the Giver is Robert and the Recipient is Elizabeth. */
const GALLERY_PEOPLE: { giver: Sender; recipient: Sender } = { giver: 'Robert', recipient: 'Elizabeth' };

export interface App {
  getState(): AppState;
  subscribe(listener: (state: AppState) => void): () => void;
  init(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): void;
  edit(patch: Partial<ComposeInput>): void;
  /** Make the Poem from the current choices. Resolves when the attempt has finished, well or not. */
  start(): Promise<void>;
  /** Repeat the attempt that failed, with the same choices. */
  retry(): Promise<void>;
  /** Do what the failure's main button says: retry, or sign in again. */
  recover(): Promise<void>;
  /** Back to choosing an Occasion, keeping the choices made so far. */
  again(): void;
}

export function createApp(deps: AppDeps): App {
  const store = createStore<AppState, Action>(initialState, reduce);

  async function run(input: ComposeInput): Promise<void> {
    const session = store.getState().session;
    if (!session) return;
    store.dispatch({ type: 'started', input, now: deps.now() });
    try {
      const source = await deps.loadSource();
      const note = input.note.trim();
      const outcome = await makePoem(
        { source, occasion: input.occasion, ...GALLERY_PEOPLE, ...(note ? { note } : {}) },
        deps.makeBeam(session),
        { onProgress: ({ reasoningTokens }) => store.dispatch({ type: 'reasoned', reasoningTokens }) },
      );
      store.dispatch({ type: 'succeeded', outcome });
    } catch (error) {
      const failure = describeFailure(error);
      if (failure.kind === 'signed-out') deps.auth.forget();
      store.dispatch({ type: 'failed', failure });
    }
  }

  const app: App = {
    getState: store.getState,
    subscribe: store.subscribe,
    async init() {
      const { session, notice } = await deps.auth.restore();
      store.dispatch({ type: 'restored', session, notice: notice ?? null });
    },
    async signIn() {
      try {
        await deps.auth.signIn();
      } catch (error) {
        const notice = error instanceof Error ? error.message : 'Sign-in could not start.';
        store.dispatch({ type: 'sign-in-failed', notice });
      }
    },
    signOut() {
      deps.auth.signOut();
      store.dispatch({ type: 'signed-out' });
    },
    edit: (patch) => store.dispatch({ type: 'edited', patch }),
    async start() {
      if (store.getState().step === 'reading') return;
      await run(store.getState().compose);
    },
    async retry() {
      const { step, attempt } = store.getState();
      if (step === 'failed' && attempt) await run(attempt.input);
    },
    async recover() {
      const { failure } = store.getState();
      if (failure?.recovery.action === 'sign-in') await app.signIn();
      else await app.retry();
    },
    again: () => store.dispatch({ type: 'composing-again' }),
  };
  return app;
}
