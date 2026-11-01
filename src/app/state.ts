// The app's state and how it changes. Pure: no I/O, no DOM. The flow that causes the
// changes lives in app.ts; the screens that show them live in src/ui/.
//
// Extending (tickets that add a step): add its id to StepId, any state it needs to
// AppState, and the actions it dispatches to Action and `reduce`.

import type { Occasion } from '../domain';
import type { Draft } from '../editing';
import type { PoemOutcome } from '../pipeline';
import type { Session } from './auth';
import type { Failure } from './failure';
import { noteReasoning, startProgress, type ProgressState } from './progress';

export type StepId = 'sign-in' | 'compose' | 'reading' | 'poem' | 'failed';

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

/** Why a replacement did not work, in words for the Giver. */
export interface EditProblem {
  message: string;
  help?: Failure['help'];
}

/** Working with the Poem after the reveal: what was taken out, and the replacement under way. */
export interface EditingState {
  /** Snippet IDs the Giver removed or replaced away; never offered again. */
  removed: readonly string[];
  /** The Line being replaced right now (`problem: null`), or why the last attempt did not work. */
  replacement: { snippetId: string; problem: EditProblem | null } | null;
}

export const noEditing: EditingState = { removed: [], replacement: null };

/** Beam is looking for a replacement right now; other edits wait for it. */
export function isReplacing({ replacement }: EditingState): boolean {
  return replacement?.problem === null;
}

export interface AppState {
  step: StepId;
  session: Session | null;
  /** Something to tell the Giver on the sign-in step, e.g. why sign-in did not complete. */
  notice: string | null;
  compose: ComposeInput;
  attempt: Attempt | null;
  outcome: PoemOutcome | null;
  editing: EditingState;
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
  | { type: 'poem-edited'; draft: Draft }
  | { type: 'replacing'; snippetId: string }
  | { type: 'replace-failed'; snippetId: string; problem: EditProblem };

export const initialState: AppState = {
  step: 'sign-in',
  session: null,
  notice: null,
  compose: { occasion: 'anniversary', note: '' },
  attempt: null,
  outcome: null,
  editing: noEditing,
  failure: null,
};

export function reduce(state: AppState, action: Action): AppState {
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
      return { ...state, step: 'poem', outcome: action.outcome, editing: noEditing, failure: null };
    case 'failed':
      return {
        ...state,
        step: 'failed',
        failure: action.failure,
        session: action.failure.kind === 'signed-out' ? null : state.session,
      };
    case 'composing-again':
      return { ...state, step: 'compose', attempt: null, outcome: null, editing: noEditing, failure: null };
    case 'poem-edited':
      return state.outcome
        ? {
            ...state,
            outcome: { ...state.outcome, poem: action.draft.poem },
            editing: { removed: action.draft.removed, replacement: null },
          }
        : state;
    case 'replacing':
      return { ...state, editing: { ...state.editing, replacement: { snippetId: action.snippetId, problem: null } } };
    case 'replace-failed':
      return { ...state, editing: { ...state.editing, replacement: { snippetId: action.snippetId, problem: action.problem } } };
  }
}
