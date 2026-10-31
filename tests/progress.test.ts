// Seam 3: progress while Beam reads (about a minute). Events go in; what the Giver
// should see at a given moment comes out.

import { describe, expect, test } from 'vitest';
import { EXPECTED_REASONING_TOKENS, noteReasoning, progressView, startProgress } from '../src/app/progress';

describe('progress while Beam reads', () => {
  test('before Beam reports anything, the clock runs and the Giver is told the Conversation is going in', () => {
    const view = progressView(startProgress(10_000), 17_000);

    expect(view).toMatchObject({ phase: 'sending', fraction: 0, elapsedSeconds: 7 });
    expect(view.label).toMatch(/taking in/i);
  });

  test('once Beam is reasoning, the bar follows its reasoning tokens against the usual amount', () => {
    const half = noteReasoning(startProgress(0), EXPECTED_REASONING_TOKENS / 2);

    const view = progressView(half, 30_000);

    expect(view).toMatchObject({ phase: 'reading', elapsedSeconds: 30 });
    expect(view.fraction).toBeCloseTo(0.5, 2);
    expect(view.label).toMatch(/reading/i);
  });

  test('the bar never claims to be finished, however long Beam reasons', () => {
    const view = progressView(noteReasoning(startProgress(0), EXPECTED_REASONING_TOKENS * 3), 60_000);

    expect(view.fraction).toBeLessThan(1);
    expect(view.fraction).toBeGreaterThan(0.9);
  });

  test('the bar never moves backwards if a smaller count arrives late', () => {
    const progress = noteReasoning(noteReasoning(startProgress(0), EXPECTED_REASONING_TOKENS * 0.6), EXPECTED_REASONING_TOKENS * 0.3);

    expect(progressView(progress, 40_000).fraction).toBeCloseTo(0.6, 2);
  });

  test('well past the usual time, the Giver is told it is slow but still working, and to keep the tab open', () => {
    const view = progressView(noteReasoning(startProgress(0), 30_000), 200_000);

    expect(view.phase).toBe('slow');
    expect(view.label).toMatch(/longer than usual/i);
    expect(view.detail).toMatch(/keep this tab open/i);
    expect(view.elapsedSeconds).toBe(200);
  });
});
