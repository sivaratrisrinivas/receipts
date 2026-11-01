// Seam 4: revealing a Poem Line by Line. Time since the reveal began goes in; how many
// Lines are showing, when the next one is due, and whether the badge shows come out.

import { describe, expect, test } from 'vitest';
import { badgeShown, linesRevealed, msUntilNextLine, type RevealTiming } from '../src/app/reveal';

const timing: RevealTiming = { firstMs: 500, stepMs: 1000 };

describe('revealing a Poem Line by Line', () => {
  test('Lines appear one at a time, the first after a short pause', () => {
    expect([0, 499, 500, 1499, 1500, 2500].map((ms) => linesRevealed(10, ms, timing))).toEqual([0, 0, 1, 1, 2, 3]);
  });

  test('never reveals more Lines than the Poem has', () => {
    expect(linesRevealed(3, 60_000, timing)).toBe(3);
  });

  test('with reduced motion every Line is there at once', () => {
    expect(linesRevealed(8, 0, { firstMs: 0, stepMs: 0 })).toBe(8);
  });

  test('skipping the reveal shows everything', () => {
    expect(linesRevealed(8, Infinity, timing)).toBe(8);
  });

  test('says how long until the next Line, and nothing once all are showing', () => {
    expect(msUntilNextLine(3, 0, timing)).toBe(500);
    expect(msUntilNextLine(3, 1200, timing)).toBe(300);
    expect(msUntilNextLine(3, 2500, timing)).toBeNull();
    expect(msUntilNextLine(3, 9999, timing)).toBeNull();
  });

  test('the "every line is real" badge appears only when the Poem fully verifies and every Line is showing', () => {
    expect(badgeShown({ verified: true }, 7, 8)).toBe(false);
    expect(badgeShown({ verified: true }, 8, 8)).toBe(true);
    expect(badgeShown({ verified: false }, 8, 8)).toBe(false);
  });
});
