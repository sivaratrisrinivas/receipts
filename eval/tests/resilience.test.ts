// Seam 3, continued: what a run does when Beam fails, when it is interrupted and when
// the money runs out.

import { describe, expect, test } from 'vitest';
import { BeamError, createFakeBeam, type BeamPort } from '../../src';
import { runEval } from '../lib/runner';
import { SpendCapExceeded } from '../lib/spend';
import { readAllTraces } from '../lib/trace';
import { noSleep, snippetsIn, texts, useTempDir, withUsage } from './support';

const tempDir = useTempDir();

const usage = { promptTokens: 500_000, completionTokens: 30_000, reasoningTokens: 29_000 };
const COST_OF_USAGE = 0.236;

/** Picks the first Snippet it is shown. */
const firstSnippet = (request: Parameters<Parameters<typeof createFakeBeam>[0]>[0]) => ({
  picks: [{ id: snippetsIn(request)[0]!.id, note: 'The first thing they said.' }],
});

/** A Beam that follows a script of outcomes, one per call; the last one repeats. */
function scripted(outcomes: ('ok' | 'truncated' | BeamError)[]): BeamPort & { calls: number } {
  const inner = createFakeBeam(firstSnippet);
  const port = {
    calls: 0,
    async complete(request, onProgress) {
      const outcome = outcomes[Math.min(port.calls, outcomes.length - 1)]!;
      port.calls++;
      if (outcome instanceof BeamError) throw outcome;
      if (outcome === 'truncated') return { content: null, finishReason: 'length', usage };
      return { ...(await inner.complete(request, onProgress)), usage };
    },
  } satisfies BeamPort & { calls: number };
  return port;
}

const run = (beam: BeamPort, extra: Partial<Parameters<typeof runEval>[0]> = {}) =>
  runEval({ texts, traceDir: tempDir(), perGroup: 1, conditions: ['full'], beam, sleep: noSleep, ...extra });

describe('retrying', () => {
  test('a retryable failure is tried again, and the trace shows both attempts and what both cost', async () => {
    const beam = scripted(['truncated', 'ok']);

    const { traces } = await run(beam);

    expect(beam.calls).toBe(2);
    expect(traces[0]).toMatchObject({ status: 'ok' });
    expect(traces[0]?.attempts.map((attempt) => attempt.error?.reason)).toEqual(['truncated', undefined]);
    expect(traces[0]?.costUsd).toBeCloseTo(2 * COST_OF_USAGE, 6);
  });

  test('waits before each retry', async () => {
    const waits: number[] = [];

    await run(scripted(['truncated', 'truncated', 'ok']), { sleep: async (ms) => void waits.push(ms) });

    expect(waits).toHaveLength(2);
    expect(waits.every((ms) => ms > 0)).toBe(true);
  });

  test('gives up after 2 retries, records the failure in the trace and carries on with the next Poem', async () => {
    const beam = scripted(['truncated']);

    const { traces } = await run(beam, { perGroup: 2 });

    expect(beam.calls).toBe(6);
    expect(traces.map((trace) => trace.status)).toEqual(['failed', 'failed']);
    expect(traces[0]).toMatchObject({ error: { reason: 'truncated' } });
    expect(traces[0]?.attempts).toHaveLength(3);
    expect(traces[0]?.poem).toBeUndefined();
    expect(traces[0]?.costUsd).toBeCloseTo(3 * COST_OF_USAGE, 6);
  });

  test('a Beam answer in the wrong shape counts as a failed attempt and is retried too', async () => {
    let calls = 0;
    const beam = createFakeBeam((request) => (++calls === 1 ? { raw: 'Sorry, no.' } : firstSnippet(request)));

    const { traces } = await run(withUsage(beam, usage));

    expect(calls).toBe(2);
    expect(traces[0]?.attempts.map((attempt) => attempt.error?.reason)).toEqual(['invalid-response', undefined]);
  });

  test('a failure that cannot succeed on retry (bad token, no credits) stops the whole run, leaving that Poem pending rather than failed', async () => {
    const traceDir = tempDir();
    const beam = scripted([new BeamError('http', 'Beam request failed (HTTP 402)', false)]);

    await expect(run(beam, { traceDir })).rejects.toMatchObject({ reason: 'http', retryable: false });

    expect(beam.calls).toBe(1);
    expect(readAllTraces(traceDir).map((trace) => trace.status)).toEqual(['pending']);
  });

  test('a call that threw before reporting tokens is priced from the prompt size, as an upper bound', async () => {
    const lost = scripted([new BeamError('truncated', 'Beam ran out of room', true)]);
    const dropped = scripted([new BeamError('network', 'The connection dropped', true)]);

    const [truncated, network] = [await run(lost, { maxRetries: 0 }), await run(dropped, { maxRetries: 0 })];

    // A truncated answer spent the whole completion budget: 60,000 tokens at $1.20/M is $0.072, plus the input.
    expect(truncated.traces[0]?.attempts[0]).toMatchObject({ costKind: 'estimate' });
    expect(truncated.traces[0]!.costUsd).toBeGreaterThan(0.072);
    expect(truncated.traces[0]!.costUsd).toBeLessThan(0.08);
    // A dropped connection is charged for the input only.
    expect(network.traces[0]?.attempts[0]).toMatchObject({ costKind: 'estimate' });
    expect(network.traces[0]!.costUsd).toBeGreaterThan(0);
    expect(network.traces[0]!.costUsd).toBeLessThan(0.01);
  });
});

describe('resuming', () => {
  test('Poems that already have a trace are not made (or paid for) again', async () => {
    const traceDir = tempDir();
    const first = scripted(['ok']);
    await run(first, { traceDir, perGroup: 2 });

    const second = scripted(['ok']);
    const { traces } = await run(second, { traceDir, perGroup: 3 });

    expect(first.calls).toBe(2);
    expect(second.calls).toBe(1);
    expect(traces.map((trace) => trace.index)).toEqual([0, 1, 2]);
    expect(readAllTraces(traceDir)).toHaveLength(3);
  });

  test('a failed Poem stays failed on resume, and is made again only when asked', async () => {
    const traceDir = tempDir();
    await run(scripted(['truncated']), { traceDir });

    const kept = await run(scripted(['ok']), { traceDir });
    const redone = await run(scripted(['ok']), { traceDir, redoFailed: true });

    expect(kept.traces[0]?.status).toBe('failed');
    expect(redone.traces[0]?.status).toBe('ok');
    // The failed attempts were paid for, so redoing keeps them on the books.
    expect(redone.traces[0]?.attempts).toHaveLength(4);
    expect(redone.traces[0]?.costUsd).toBeCloseTo(4 * COST_OF_USAGE, 6);
    expect(readAllTraces(traceDir)).toHaveLength(1);
  });
});

describe('stopping in the middle of a Poem', () => {
  test('keeps the attempts already paid for, and a resume finishes the Poem and charges them once', async () => {
    const traceDir = tempDir();
    // Two truncated attempts cost $0.472; a third could cost up to $0.075 more, which is over $0.5.
    await expect(run(scripted(['truncated']), { traceDir, spendCapUsd: 0.5 })).rejects.toBeInstanceOf(SpendCapExceeded);

    const [pending] = readAllTraces(traceDir);
    expect(pending).toMatchObject({ condition: 'full', index: 0, status: 'pending' });
    expect(pending?.attempts).toHaveLength(2);
    expect(pending?.costUsd).toBeCloseTo(2 * COST_OF_USAGE, 6);

    const resumed = await run(scripted(['ok']), { traceDir });

    expect(resumed.traces[0]).toMatchObject({ status: 'ok' });
    expect(resumed.traces[0]?.attempts.map((attempt) => attempt.error?.reason)).toEqual(['truncated', 'truncated', undefined]);
    expect(resumed.traces[0]?.costUsd).toBeCloseTo(3 * COST_OF_USAGE, 6);
    expect(resumed.spentUsd).toBeCloseTo(3 * COST_OF_USAGE, 6);
    expect(readAllTraces(traceDir)).toHaveLength(1);
  });
});

describe('the spend cap', () => {
  test('stops the run before a call that could take spending over the cap', async () => {
    const traceDir = tempDir();
    const beam = scripted(['ok']);

    // Two Poems cost $0.472; a third could cost up to $0.30 more, which is over $0.5.
    await expect(run(beam, { traceDir, perGroup: 5, spendCapUsd: 0.5 })).rejects.toBeInstanceOf(SpendCapExceeded);

    expect(beam.calls).toBe(2);
    expect(readAllTraces(traceDir)).toHaveLength(2);
  });

  test('counts what earlier runs already spent, so resuming cannot exceed the cap', async () => {
    const traceDir = tempDir();
    await run(scripted(['ok']), { traceDir, perGroup: 2 });

    const beam = scripted(['ok']);
    await expect(run(beam, { traceDir, perGroup: 5, spendCapUsd: 0.5 })).rejects.toBeInstanceOf(SpendCapExceeded);

    expect(beam.calls).toBe(0);
  });

  test('is $8 unless told otherwise', async () => {
    const beam = scripted(['ok']);

    const { spentUsd } = await run(beam, { perGroup: 3 });

    expect(spentUsd).toBeCloseTo(3 * COST_OF_USAGE, 6);
  });
});
