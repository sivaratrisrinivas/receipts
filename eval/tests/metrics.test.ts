// Seam 4: the four metrics. Traces made by a run over the synthetic Gallery with
// scripted Beams go in; per-group numbers come out. Expected values are worked by hand
// from the corpus in support.ts: letter i is dated 10 x i days after 1 Jan 1845, so the
// timeline is 540 days and its ten equal buckets are 54 days wide. Letter i is in bucket
// floor(i / 5.4), capped at 9:
//   letters 0, 1, 2 -> bucket 0;  21 -> 3;  40 -> 7;  49 to 54 -> 9.
// Robert wrote the even letters, Elizabeth the odd ones.

import { describe, expect, test } from 'vitest';
import { createFakeBeam, readConversation, type BeamPort, type FakePick } from '../../src';
import { summarize } from '../lib/metrics';
import { runEval } from '../lib/runner';
import { fragment, idOf, noSleep, texts, useTempDir, withUsage } from './support';

const tempDir = useTempDir();
const conversation = readConversation({ kind: 'gallery', texts });

/** A pick of sentence 1 of a letter; `callbacks` are letters too. */
interface Pick {
  letter: number;
  callbacks?: number[];
  /** Callback IDs used as written, e.g. one that does not exist. */
  rawCallbacks?: string[];
}

const USAGE = { promptTokens: 1_000, completionTokens: 1_000, reasoningTokens: 900 };

/** One Beam Poem per call: the first call picks the first list, the second the second, and so on. */
function poemsOf(...poems: (Pick | { rawId: string })[][]): BeamPort {
  let call = 0;
  return withUsage(
    createFakeBeam((request) => {
      const picks = (poems[call++] ?? []).map((pick): FakePick => {
        if ('rawId' in pick) return { id: pick.rawId, note: 'Beam made this ID up.' };
        const { letter, callbacks = [], rawCallbacks = [] } = pick;
        return {
          id: idOf(request, fragment(letter, 1)),
          note: 'Because.',
          callbacks: [...callbacks.map((cited) => idOf(request, fragment(cited, 1))), ...rawCallbacks],
        };
      });
      return { picks };
    }),
    USAGE,
  );
}

const pick = (letter: number): Pick => ({ letter });

async function groupOf(beam: BeamPort, perGroup: number, extra: Partial<Parameters<typeof runEval>[0]> = {}) {
  const { traces } = await runEval({
    texts,
    traceDir: tempDir(),
    perGroup,
    conditions: ['full'],
    beam,
    sleep: noSleep,
    ...extra,
  });
  const [group] = summarize(traces, conversation);
  return group!;
}

describe('timeline coverage', () => {
  test("is the share of the full Conversation's ten timeline buckets that hold at least one Line", async () => {
    const one = await groupOf(poemsOf([pick(0), pick(1)]), 1);
    const four = await groupOf(poemsOf([pick(0), pick(21), pick(40), pick(53)]), 1);

    expect(one.timelineCoverage).toBeCloseTo(0.1); // both Lines in bucket 0
    expect(four.timelineCoverage).toBeCloseTo(0.4); // buckets 0, 3, 7 and 9
  });

  test('is measured against the whole Conversation, so Beam on the last 10% cannot cover it', async () => {
    const group = await groupOf(poemsOf([pick(53), pick(54)]), 1, { conditions: ['last10'] });

    expect(group.timelineCoverage).toBeCloseTo(0.1); // bucket 9 only
  });
});

describe('Sender balance', () => {
  test('is 1 for an even split, 0 when one Sender has every Line, and in between otherwise', async () => {
    const even = await groupOf(poemsOf([pick(0), pick(1)]), 1);
    const oneSided = await groupOf(poemsOf([pick(0), pick(2), pick(40)]), 1);
    const threeToOne = await groupOf(poemsOf([pick(0), pick(2), pick(40), pick(53)]), 1);

    expect(even.senderBalance).toBe(1);
    expect(oneSided.senderBalance).toBe(0);
    expect(threeToOne.senderBalance).toBeCloseTo(0.5); // 2 x (1 of 4)
  });
});

describe('Note callback count', () => {
  test('is the number of callbacks the Notes cite, averaged per Poem', async () => {
    const group = await groupOf(
      poemsOf(
        [pick(0), { letter: 1, callbacks: [0] }, { letter: 40, callbacks: [0, 1] }],
        [pick(0), pick(53)],
      ),
      2,
    );

    expect(group.noteCallbacks).toBe(1.5); // (3 + 0) / 2
  });

  test('does not count callbacks from a Note that cited a Snippet that does not exist', async () => {
    const group = await groupOf(
      poemsOf([
        { letter: 0, rawCallbacks: ['s99999'] },
        { letter: 1, callbacks: [0] },
      ]),
      1,
    );

    expect(group.noteCallbacks).toBe(1);
  });

  test('is 0 for random-Snippet Poems, which have no Notes', async () => {
    const { traces } = await runEval({ texts, traceDir: tempDir(), perGroup: 2, conditions: ['random'], beam: poemsOf() });

    expect(summarize(traces, conversation)[0]?.noteCallbacks).toBe(0);
  });
});

describe('verification rate', () => {
  test('is the share of Poems that carry the "every line is real" badge', async () => {
    const group = await groupOf(poemsOf([pick(0)], [pick(1), { rawId: 's99999' }], [pick(2)]), 3);

    expect(group.verificationRate).toBeCloseTo(2 / 3);
  });

  test('is 1 for random-Snippet Poems, which are real by construction', async () => {
    const { traces } = await runEval({ texts, traceDir: tempDir(), perGroup: 3, conditions: ['random'], beam: poemsOf() });

    expect(summarize(traces, conversation)[0]?.verificationRate).toBe(1);
  });
});

describe('failures', () => {
  test('count against the group: not verified, and scored 0 on the other metrics', async () => {
    const good = poemsOf([pick(0), pick(1)]);
    let call = 0;
    // The first Poem succeeds; the second never gets an answer.
    const flaky: BeamPort = {
      complete: async (...args) => (++call === 1 ? good.complete(...args) : { content: null, finishReason: 'length' }),
    };

    const group = await groupOf(flaky, 2, { maxRetries: 0 });

    expect(group).toMatchObject({ attempted: 2, completed: 1, failed: 1 });
    expect(group.verificationRate).toBe(0.5);
    expect(group.timelineCoverage).toBeCloseTo(0.05); // (0.1 + 0) / 2
    expect(group.senderBalance).toBe(0.5); // (1 + 0) / 2
    // ... while the completed Poems alone are reported next to it.
    expect(group.completedOnly).toMatchObject({ verificationRate: 1, senderBalance: 1 });
    expect(group.completedOnly?.timelineCoverage).toBeCloseTo(0.1);
  });
});

describe('summarize', () => {
  test('reports the groups in the order full, last10, random, with Poem counts, mean Lines and spend', async () => {
    const { traces } = await runEval({
      texts,
      traceDir: tempDir(),
      perGroup: 1,
      beam: poemsOf([pick(0), pick(1)], [pick(53)]),
    });

    const groups = summarize(traces, conversation);

    expect(groups.map((g) => [g.condition, g.attempted, g.completed])).toEqual([
      ['full', 1, 1],
      ['last10', 1, 1],
      ['random', 1, 1],
    ]);
    expect(groups[0]?.meanLines).toBe(2);
    expect(groups[1]?.meanLines).toBe(1);
    expect(groups[0]?.costUsd).toBeCloseTo(0.0016); // 1,000 in at $0.40/M + 1,000 out at $1.20/M
    expect(groups[2]?.costUsd).toBe(0);
  });
});
