// The app's flow: sign in, bring a chat (or use the Gallery), choose an Occasion, make the
// Poem, recover from failures.
// All I/O comes in through `AppDeps`, so the flow runs the same in tests and in the browser.

import type { BeamPort } from '../beam/port';
import type { Sender } from '../domain';
import { EditError, removeLine, replaceLine } from '../editing';
import { tryMakePoem } from '../pipeline';
import type { RawSource } from '../sources';
import { MAX_CHAT_BYTES, exportText } from '../sources/export-file';
import { GALLERY_PEOPLE } from '../sources/gallery';
import {
  dateQuestion,
  ExportError,
  inferDateOrder,
  parseWhatsApp,
  senderCounts,
  type DateOrder,
  type WhatsAppExport,
} from '../sources/whatsapp';
import type { AuthPort, Session } from './auth';
import { describeFailure, describeNotEnough } from './failure';
import { initialState, isReplacing, reduce, type Action, type AppState, type ComposeInput } from './state';
import { readChat } from './chat-reading';
import { createStore } from './store';

export interface AppDeps {
  auth: AuthPort;
  /** Load the Conversation's raw texts (for now the Gallery). */
  loadSource(): Promise<RawSource>;
  /** A Beam port that calls Beam under this Giver's own account. */
  makeBeam(session: Session): BeamPort;
  now(): number;
}

/** A chat file the Giver chose; its bytes are only read once its size is known to be sane. */
export interface ChatFile {
  name: string;
  size: number;
  read(): Promise<Uint8Array>;
}

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
  /** Start bringing the Giver's own WhatsApp chat instead of the Gallery. */
  chooseChat(): void;
  /** Read the chat file the Giver chose. Resolves when it has been read, or refused. */
  uploadFile(file: ChatFile): Promise<void>;
  /** Say who is the Giver (`giver`) and who the Poem is for (`recipient`). */
  choosePerson(role: 'giver' | 'recipient', name: string): void;
  /** Both people chosen: on to the date question if the export needs one, else the review. */
  confirmPeople(): void;
  /** The Giver's answer to the date question. */
  chooseDateOrder(order: DateOrder): void;
  /** The count and privacy statement seen: on to choosing an Occasion with this chat. */
  confirmChat(): void;
  /** Use the Gallery after all. */
  useGallery(): void;
  /** One step back while bringing a chat. */
  back(): void;
}

export function createApp(deps: AppDeps): App {
  const store = createStore<AppState, Action>(initialState, reduce);
  /** The chat the Giver brought. Kept out of the state (it is large), and forgotten on sign-out. */
  let loaded: { text: string; exported: WhatsAppExport } | null = null;

  /** What the Poem is made from, and who it is from and for. */
  async function conversationOf(state: AppState): Promise<{ source: RawSource; giver: Sender; recipient: Sender }> {
    if (state.source === 'gallery') return { source: await deps.loadSource(), ...GALLERY_PEOPLE };
    const { chat } = state;
    if (!loaded || !chat?.giver || !chat.recipient || !chat.dateOrder) throw new Error('The chat is not ready to send.');
    return {
      source: { kind: 'whatsapp', file: loaded.text, dateOrder: chat.dateOrder },
      giver: chat.giver,
      recipient: chat.recipient,
    };
  }

  /**
   * Each attempt to make a Poem takes the next number, and so does signing out. An attempt
   * that is no longer the latest is stale (Beam cannot be interrupted mid-call): whatever it
   * ends up with is dropped, so a Poem never appears for a Giver who has signed out.
   */
  let latestRun = 0;

  async function run(input: ComposeInput): Promise<void> {
    const session = store.getState().session;
    if (!session) return;
    const mine = ++latestRun;
    const isLatest = () => mine === latestRun;
    store.dispatch({ type: 'started', input, now: deps.now() });
    try {
      const { source, giver, recipient } = await conversationOf(store.getState());
      const note = input.note.trim();
      const result = await tryMakePoem(
        { source, occasion: input.occasion, giver, recipient, ...(note ? { note } : {}) },
        deps.makeBeam(session),
        { onProgress: ({ reasoningTokens }) => isLatest() && store.dispatch({ type: 'reasoned', reasoningTokens }) },
      );
      if (!isLatest()) return;
      if ('refused' in result) store.dispatch({ type: 'failed', failure: describeNotEnough(result) });
      else store.dispatch({ type: 'succeeded', outcome: result });
    } catch (error) {
      if (!isLatest()) return;
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
      latestRun++;
      deps.auth.signOut();
      loaded = null;
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
    chooseChat: () => store.dispatch({ type: 'upload-begun' }),
    async uploadFile(file) {
      if (store.getState().step !== 'upload') return;
      store.dispatch({ type: 'upload-reading' });
      try {
        if (file.size > MAX_CHAT_BYTES) {
          throw new ExportError('That file is very large. Export the chat again from WhatsApp, choosing "Without media", and upload that.');
        }
        const text = exportText(await file.read());
        const exported = parseWhatsApp(text);
        const senders = senderCounts(exported);
        if (senders.length < 2) {
          throw new ExportError('Only one person wrote in this chat, so there is nobody to make a Poem for. Pick a chat between two people.');
        }
        loaded = { text, exported };
        const chat = { fileName: file.name, senders, giver: null, recipient: null, inferredOrder: inferDateOrder(exported), question: null, dateOrder: null, reading: null };
        store.dispatch({ type: 'upload-read', chat });
      } catch (error) {
        const message = error instanceof ExportError ? error.message : 'That file could not be read. Is it a chat exported from WhatsApp?';
        store.dispatch({ type: 'upload-failed', message });
      }
    },
    choosePerson: (role, name) => store.dispatch({ type: 'person-chosen', role, name }),
    confirmPeople() {
      const { step, chat } = store.getState();
      if (step !== 'people' || !loaded || !chat?.giver || !chat.recipient) return;
      store.dispatch({
        type: 'people-confirmed',
        question: dateQuestion(loaded.exported, [chat.giver, chat.recipient]),
        reading: readChat(loaded.exported, chat.giver, chat.recipient),
      });
    },
    chooseDateOrder: (order) => store.dispatch({ type: 'date-order-chosen', order }),
    confirmChat() {
      if (store.getState().step === 'review') store.dispatch({ type: 'chat-confirmed' });
    },
    useGallery() {
      loaded = null;
      store.dispatch({ type: 'source-gallery' });
    },
    back() {
      store.dispatch({ type: 'back' });
      if (!store.getState().chat) loaded = null;
    },
  };
  return app;
}
