// Progress while Beam reads: the call takes about a minute, so the Giver needs to see
// that something is happening. State in, view out; no clocks or DOM in here.

/**
 * About how far the reasoning count usually gets on the Gallery before Beam answers, in
 * the units the Beam adapter reports: it counts streamed reasoning *chunks* (roughly 100 a
 * second, a few tokens each), not tokens, until the final usage figure arrives. A live
 * Gallery run counted about 108 chunks a second, so a typical 70 to 100 second run ends
 * near 10,000. Only scales the bar; it is an estimate, not a promise.
 */
export const EXPECTED_REASONING_TOKENS = 10_000;

/** Past this, the Giver is told it is slow. A call usually finishes in under a minute; a truncated one runs about two minutes. */
export const SLOW_AFTER_SECONDS = 100;

/** The bar stops short of the end until the Poem has really arrived. */
const MAX_FRACTION = 0.95;

export interface ProgressState {
  startedAt: number;
  /** The highest reasoning-token count Beam has reported. */
  reasoningTokens: number;
}

export type ProgressPhase = 'sending' | 'reading' | 'slow';

export interface ProgressView {
  phase: ProgressPhase;
  /** 0 to 0.95. */
  fraction: number;
  elapsedSeconds: number;
  label: string;
  detail: string;
}

export function startProgress(now: number): ProgressState {
  return { startedAt: now, reasoningTokens: 0 };
}

/** Counts only ever go up, so a late smaller report cannot move the bar backwards. */
export function noteReasoning(state: ProgressState, reasoningTokens: number): ProgressState {
  return { ...state, reasoningTokens: Math.max(state.reasoningTokens, reasoningTokens) };
}

export function progressView(state: ProgressState, now: number): ProgressView {
  const elapsedSeconds = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  const fraction = Math.min(MAX_FRACTION, state.reasoningTokens / EXPECTED_REASONING_TOKENS);

  if (elapsedSeconds >= SLOW_AFTER_SECONDS) {
    return {
      phase: 'slow',
      fraction,
      elapsedSeconds,
      label: 'Taking longer than usual',
      detail: 'Beam is still working through the whole Conversation. Keep this tab open.',
    };
  }
  if (state.reasoningTokens === 0) {
    return {
      phase: 'sending',
      fraction: 0,
      elapsedSeconds,
      label: 'Beam is taking in every message',
      detail: 'It reads the whole Conversation in one go. This usually takes under a minute.',
    };
  }
  return {
    phase: 'reading',
    fraction,
    elapsedSeconds,
    label: 'Beam is reading and choosing the moments',
    detail: 'It is going through the Conversation from start to end. Keep this tab open.',
  };
}
