// Seam 3: the eval run. A synthetic Gallery, a scripted Beam port and a trace
// directory go in; traces on disk and a report come out.

import { describe, expect, test } from 'vitest';
import { createFakeBeam } from '../../src';
import { runEval } from '../lib/runner';
import { noBeam, snippetsIn, texts, useTempDir, withUsage } from './support';

const tempDir = useTempDir();

const usage = { promptTokens: 500_000, completionTokens: 30_000, reasoningTokens: 29_000 };
/** 500k tokens in at $0.40/M plus 30k out at $1.20/M, worked by hand. */
const COST_OF_USAGE = 0.236;

/** A Beam that picks the first and last Snippet it is shown, like a reader of whatever Conversation it was given. */
function endsPicker() {
  return createFakeBeam((request) => {
    const shown = snippetsIn(request);
    return {
      picks: [
        { id: shown[0]!.id, note: 'Where it starts.' },
        { id: shown[shown.length - 1]!.id, note: 'Where it ends.', callbacks: [shown[0]!.id] },
      ],
    };
  });
}

describe('random-Snippet Poems', () => {
  test('need no Beam call and come out as 8 to 14 real, verified Lines', async () => {
    const traceDir = tempDir();

    const { traces } = await runEval({ texts, traceDir, perGroup: 3, conditions: ['random'], beam: noBeam });

    expect(traces).toHaveLength(3);
    for (const trace of traces) {
      expect(trace).toMatchObject({ condition: 'random', status: 'ok', costUsd: 0 });
      expect(trace.poem?.verified).toBe(true);
      expect(trace.poem?.lines.length).toBeGreaterThanOrEqual(8);
      expect(trace.poem?.lines.length).toBeLessThanOrEqual(14);
    }
  });

  test('are reproducible, and differ from one Poem to the next', async () => {
    const run = async () =>
      (await runEval({ texts, traceDir: tempDir(), perGroup: 3, conditions: ['random'], beam: noBeam })).traces.map(
        (trace) => trace.poem?.lines.map((line) => line.text),
      );

    const [first, second] = [await run(), await run()];

    expect(first).toEqual(second);
    expect(first[0]).not.toEqual(first[1]);
  });
});

describe('Beam on the full Conversation', () => {
  test('reads every Message, and the trace keeps the answer, the tokens and what the Poem cost', async () => {
    const beam = endsPicker();

    const { traces } = await runEval({
      texts,
      traceDir: tempDir(),
      perGroup: 1,
      conditions: ['full'],
      beam: withUsage(beam, usage),
    });

    const [trace] = traces;
    expect(beam.requests).toHaveLength(1);
    expect(trace).toMatchObject({ condition: 'full', status: 'ok', messagesRead: 11, occasion: 'birthday' });
    expect(trace?.attempts).toEqual([
      expect.objectContaining({ usage, costKind: 'usage', finishReason: 'stop', costUsd: expect.closeTo(COST_OF_USAGE, 6) }),
    ]);
    expect(trace?.costUsd).toBeCloseTo(COST_OF_USAGE, 6);
    expect(JSON.parse(trace?.answer ?? 'null').lines).toHaveLength(2);
    expect(trace?.poem?.lines.map((line) => [line.sender, line.dateLabel])).toEqual([
      ['Robert', '10 January 1845'],
      ['Robert', '14 September 1846'],
    ]);
    expect(trace?.poem?.lines[1]?.callbacks).toEqual([trace?.poem?.lines[0]?.snippetId]);
  });
});

describe('Beam on only the last 10%', () => {
  test('is shown just the last tenth of the Messages (rounded up), and its Poem comes from those', async () => {
    const beam = endsPicker();

    const { traces } = await runEval({
      texts,
      traceDir: tempDir(),
      perGroup: 1,
      conditions: ['last10'],
      beam: withUsage(beam, usage),
    });

    const headers = beam.requests[0]!.user.split('\n').filter((row) => row.startsWith('## '));
    expect(headers).toEqual(['## E 1846-09-11', '## R 1846-09-14']);
    expect(traces[0]).toMatchObject({ condition: 'last10', status: 'ok', messagesRead: 2 });
    expect(traces[0]?.poem?.lines.map((line) => line.dateLabel)).toEqual(['11 September 1846', '14 September 1846']);
  });
});

describe('the groups of one run', () => {
  test('use the same Occasions in the same order, cycling through all six', async () => {
    const { traces } = await runEval({
      texts,
      traceDir: tempDir(),
      perGroup: 7,
      conditions: ['random', 'last10'],
      beam: endsPicker(),
    });

    const occasions = (condition: string) => traces.filter((t) => t.condition === condition).map((t) => t.occasion);
    expect(occasions('random')).toEqual(['birthday', 'anniversary', 'thank you', 'sorry', 'missing you', 'farewell', 'birthday']);
    expect(occasions('last10')).toEqual(occasions('random'));
  });
});
