// The app's flow: sign in, choose an Occasion, make the Poem, recover from failures.
// All I/O comes in through `AppDeps`, so the flow runs the same in tests and in the browser.

import type { BeamPort } from '../beam/port';
import type { Sender } from '../domain';
import { EditError, removeLine, replaceLine } from '../editing';
import { tryMakePoem } from '../pipeline';
import type { RawSource } from '../sources';
import type { AuthPort, Session } from './auth';
import { describeFailure, describeNotEnough } from './failure';
import { initialState, isReplacing, reduce, type Action, type AppState, type ComposeInput } from './state';
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
  /** Do what the failure's main button says: retry, sign in again, or go back to the choices. */
  recover(): Promise<void>;
  /** Back to choosing an Occasion, keeping the choices made so far. */
  again(): void;
  /** Remove a Line from the Poem. Does nothing while a replacement is under way. */
  removeLine(snippetId: string): void;
  /** Replace a Line with another Snippet from the same period (one Beam call). Failures show in `editing.replacement`. */
  replaceLine(snippetId: string): Promise<void>;
  /** Make a fresh Poem from the same choices, discarding this one and the edits to it. */
  regenerate(): Promise<void>;
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
      const result = await tryMakePoem(
        { source, occasion: input.occasion, ...GALLERY_PEOPLE, ...(note ? { note } : {}) },
        deps.makeBeam(session),
        { onProgress: ({ reasoningTokens }) => store.dispatch({ type: 'reasoned', reasoningTokens }) },
      );
      if ('refused' in result) store.dispatch({ type: 'failed', failure: describeNotEnough(result) });
      else store.dispatch({ type: 'succeeded', outcome: result });
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
      else if (failure?.recovery.action === 'change') app.again();
      else await app.retry();
    },
    again: () => store.dispatch({ type: 'composing-again' }),
    removeLine(snippetId) {
      const { outcome, editing } = store.getState();
      if (!outcome || isReplacing(editing)) return;
      try {
        store.dispatch({ type: 'poem-edited', draft: removeLine({ poem: outcome.poem, removed: editing.removed }, snippetId) });
      } catch (error) {
        if (!(error instanceof EditError)) throw error;
      }
    },
    async replaceLine(snippetId) {
      const { outcome, session, editing } = store.getState();
      if (!outcome || !session || isReplacing(editing)) return;
      store.dispatch({ type: 'replacing', snippetId });
      try {
        const draft = await replaceLine({
          draft: { poem: outcome.poem, removed: editing.removed },
          snippetId,
          snippets: outcome.snippets,
          beam: deps.makeBeam(session),
        });
        if (store.getState().outcome === outcome) store.dispatch({ type: 'poem-edited', draft });
      } catch (error) {
        if (store.getState().outcome !== outcome) return;
        if (error instanceof EditError) return void store.dispatch({ type: 'replace-failed', snippetId, problem: { message: error.message } });
        const failure = describeFailure(error);
        if (failure.kind === 'signed-out') {
          deps.auth.forget();
          store.dispatch({ type: 'failed', failure });
        } else {
          store.dispatch({ type: 'replace-failed', snippetId, problem: { message: failure.message, ...(failure.help ? { help: failure.help } : {}) } });
        }
      }
    },
    async regenerate() {
      const { step, attempt, editing } = store.getState();
      if (step === 'poem' && attempt && !isReplacing(editing)) await run(attempt.input);
    },
  };
  return app;
}
