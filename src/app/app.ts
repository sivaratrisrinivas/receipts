// The app's flow: sign in, bring a chat (or use the Gallery), choose an Occasion, make the
// Poem, recover from failures.
// All I/O comes in through `AppDeps`, so the flow runs the same in tests and in the browser.

import type { BeamPort } from '../beam/port';
import type { Sender } from '../domain';
import { tryMakePoem } from '../pipeline';
import type { RawSource } from '../sources';
import { exportText } from '../sources/export-file';
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

/** A chat file as the browser read it. */
export interface ChatFile {
  name: string;
  bytes: Uint8Array;
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

  async function run(input: ComposeInput): Promise<void> {
    const session = store.getState().session;
    if (!session) return;
    store.dispatch({ type: 'started', input, now: deps.now() });
    try {
      const { source, giver, recipient } = await conversationOf(store.getState());
      const note = input.note.trim();
      const result = await tryMakePoem(
        { source, occasion: input.occasion, giver, recipient, ...(note ? { note } : {}) },
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
    chooseChat: () => store.dispatch({ type: 'upload-begun' }),
    async uploadFile(file) {
      if (store.getState().step !== 'upload') return;
      store.dispatch({ type: 'upload-reading' });
      try {
        const text = exportText(file.bytes);
        const exported = parseWhatsApp(text);
        const senders = senderCounts(exported);
        if (senders.length < 2) {
          throw new ExportError('Only one person wrote in this chat, so there is nobody to make a Poem for. Pick a chat between two people.');
        }
        loaded = { text, exported };
        const chat = { fileName: file.name, senders, giver: null, recipient: null, inferredOrder: inferDateOrder(exported), question: null, dateOrder: null };
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
      store.dispatch({ type: 'people-confirmed', question: dateQuestion(loaded.exported, [chat.giver, chat.recipient]) });
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
