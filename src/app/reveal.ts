// Revealing a Poem Line by Line. Pure functions of the time since the reveal began,
// so the UI only has to ask "how many Lines now?" and "when do I look again?".

import type { Poem } from '../domain';

export interface RevealTiming {
  /** Pause before the first Line. */
  firstMs: number;
  /** Gap between one Line and the next. */
  stepMs: number;
}

export const REVEAL_TIMING: RevealTiming = { firstMs: 600, stepMs: 1200 };

/** For people who ask their device for less motion: everything is there at once. */
export const NO_MOTION: RevealTiming = { firstMs: 0, stepMs: 0 };

/** How many Lines are showing `elapsedMs` after the reveal began. */
export function linesRevealed(total: number, elapsedMs: number, timing: RevealTiming = REVEAL_TIMING): number {
  if (elapsedMs < timing.firstMs) return 0;
  if (timing.stepMs <= 0) return total;
  const shown = 1 + Math.floor((elapsedMs - timing.firstMs) / timing.stepMs);
  return Math.min(total, shown);
}

/** Milliseconds until the next Line is due, or null once every Line is showing. */
export function msUntilNextLine(total: number, elapsedMs: number, timing: RevealTiming = REVEAL_TIMING): number | null {
  const shown = linesRevealed(total, elapsedMs, timing);
  if (shown >= total) return null;
  return timing.firstMs + shown * timing.stepMs - elapsedMs;
}

/**
 * The "every line is real" badge: only when the Poem fully verified, and only once
 * every Line is on screen (it vouches for the whole Poem).
 */
export function badgeShown(poem: Pick<Poem, 'verified'>, revealed: number, total: number): boolean {
  return poem.verified && total > 0 && revealed >= total;
}
