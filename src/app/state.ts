// The app's state and how it changes. Pure: no I/O, no DOM. The flow that causes the
// changes lives in app.ts; the screens that show them live in src/ui/.
//
// Extending (tickets that add a step): add its id to StepId, any state it needs to
// AppState, and the actions it dispatches to Action and `reduce`. (Bringing a WhatsApp
// chat keeps its own state and actions in upload.ts, and `reduce` hands them over.)

import type { Occasion } from '../domain';
import type { PoemOutcome } from '../pipeline';
import type { Session } from './auth';
import type { Failure } from './failure';
import { noteReasoning, startProgress, type ProgressState } from './progress';
import { idleUpload, isUploadAction, reduceUpload, type ChatDraft, type UploadAction, type UploadStatus } from './upload';

export type StepId =
  | 'sign-in'
  | 'compose'
  | 'reading'
  | 'poem'
  | 'failed'
  // Bringing a WhatsApp chat (see upload.ts):
  | 'upload'
  | 'people'
  | 'date-order'
  | 'review';

/** What the Giver chooses before Beam reads. */
export interface ComposeInput {
  occasion: Occasion;
  /** Optional context for Beam; may be empty. */
  note: string;
}

/** The request being made right now (or that just failed), so a retry can repeat it. */
export interface Attempt {
  input: ComposeInput;
  progress: ProgressState;
}

export interface AppState {
  step: StepId;
  session: Session | null;
  /** Something to tell the Giver on the sign-in step, e.g. why sign-in did not complete. */
  notice: string | null;
  compose: ComposeInput;
  /** Which Conversation the Poem is made from: the Gallery, or the Giver's own WhatsApp chat. */
  source: 'gallery' | 'chat';
  /** The chat being brought (or brought); null while the Gallery is the source. */
  chat: ChatDraft | null;
  upload: UploadStatus;
  attempt: Attempt | null;
  outcome: PoemOutcome | null;
  failure: Failure | null;
}

export type Action =
  | { type: 'restored'; session: Session | null; notice: string | null }
  | { type: 'signed-out' }
  | { type: 'sign-in-failed'; notice: string }
  | { type: 'edited'; patch: Partial<ComposeInput> }
  | { type: 'started'; input: ComposeInput; now: number }
  | { type: 'reasoned'; reasoningTokens: number }
  | { type: 'succeeded'; outcome: PoemOutcome }
  | { type: 'failed'; failure: Failure }
  | { type: 'composing-again' }
  | UploadAction;

export const initialState: AppState = {
  step: 'sign-in',
  session: null,
  notice: null,
  compose: { occasion: 'anniversary', note: '' },
  source: 'gallery',
  chat: null,
  upload: idleUpload,
  attempt: null,
  outcome: null,
  failure: null,
};

export function reduce(state: AppState, action: Action): AppState {
  if (isUploadAction(action)) return reduceUpload(state, action);
  switch (action.type) {
    case 'restored':
      return { ...state, session: action.session, notice: action.notice, step: action.session ? 'compose' : 'sign-in' };
    case 'signed-out':
      return { ...initialState, compose: state.compose };
    case 'sign-in-failed':
      return { ...state, step: 'sign-in', session: null, notice: action.notice };
    case 'edited':
      return { ...state, compose: { ...state.compose, ...action.patch } };
    case 'started':
      return {
        ...state,
        step: 'reading',
        attempt: { input: action.input, progress: startProgress(action.now) },
        failure: null,
        outcome: null,
      };
    case 'reasoned':
      return state.attempt
        ? { ...state, attempt: { ...state.attempt, progress: noteReasoning(state.attempt.progress, action.reasoningTokens) } }
        : state;
    case 'succeeded':
      return { ...state, step: 'poem', outcome: action.outcome, failure: null };
    case 'failed':
      return {
        ...state,
        step: 'failed',
        failure: action.failure,
        session: action.failure.kind === 'signed-out' ? null : state.session,
      };
    case 'composing-again':
      return { ...state, step: 'compose', attempt: null, outcome: null, failure: null };
  }
}
