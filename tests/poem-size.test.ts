// Seam 1, the size of a live Poem: a Poem is 6 to 14 Lines (GLOSSARY.md), and the size table
// narrows that for the Conversation (40 or more usable Snippets: 8 to 14; 15 to 39: 6 to 8).
// Beam is only asked for that many; here it is held to it. An answer that comes back with too
// few or too many verified Lines is a retryable error, and no Poem is shown.

import { describe, expect, test } from 'vitest';
import { BeamError, createFakeBeam, makePoem, tryMakePoem, type BeamRequest, type FakeReply } from '../src';
import { conversationWith } from './fixtures/letters';
import { promptSnippets } from './support/prompt';

/** The first `count` Snippets Beam was shown, as picks. */
function firstSnippets(request: BeamRequest, count: number): FakeReply {
  return { picks: promptSnippets(request).slice(0, count).map(({ id }) => ({ id, note: 'Any.' })) };
}

/** A Beam that always answers with this many real Snippets. */
function pickingCount(count: number) {
  return createFakeBeam((request) => firstSnippets(request, count));
}

// 20 usable Snippets: the 6 to 8 tier. 60: the 8 to 14 tier.
const small = conversationWith(20);
const full = conversationWith(60);

describe('a Poem with too few Lines is not shown', () => {
  test('5 verified Lines for a Conversation that needs 6 to 8 is a retryable error with a plain reason', async () => {
    const attempt = makePoem(small, pickingCount(5));

    await expect(attempt).rejects.toBeInstanceOf(BeamError);
    await expect(attempt).rejects.toMatchObject({
      reason: 'wrong-size',
      retryable: true,
      message: 'Beam returned 5 Lines; a Poem needs 6 to 8. Try again.',
    });
  });

  test('tryMakePoem does not hand back a Poem either: the error is thrown, never a result', async () => {
    await expect(tryMakePoem(small, pickingCount(5))).rejects.toMatchObject({ reason: 'wrong-size' });
  });
});

describe('a Poem with too many Lines is not shown', () => {
  test('9 Lines for a Conversation that needs 6 to 8 is rejected, though 9 is a Poem elsewhere', async () => {
    await expect(makePoem(small, pickingCount(9))).rejects.toMatchObject({
      reason: 'wrong-size',
      retryable: true,
      message: 'Beam returned 9 Lines; a Poem needs 6 to 8. Try again.',
    });
  });

  test('15 Lines for a Conversation that needs 8 to 14 is rejected', async () => {
    await expect(makePoem(full, pickingCount(15))).rejects.toMatchObject({
      reason: 'wrong-size',
      retryable: true,
      message: 'Beam returned 15 Lines; a Poem needs 8 to 14. Try again.',
    });
  });
});

/** `real` real Snippets and `unknown` IDs that are not in the Conversation, in one answer. */
function pickingWithUnknown(real: number, unknown: number) {
  return createFakeBeam((request) => ({
    picks: [
      ...(firstSnippets(request, real) as Extract<FakeReply, { picks: unknown }>).picks,
      ...Array.from({ length: unknown }, (_, i) => ({ id: `s9${i}99`, note: 'Beam made this ID up.' })),
    ],
  }));
}

describe('Lines that verification drops count against the total', () => {
  test('14 picks of which 3 are unknown IDs is 11 Lines, judged as 11: fine for 8 to 14, the badge withheld', async () => {
    const { poem } = await makePoem(full, pickingWithUnknown(11, 3));

    expect(poem.lines).toHaveLength(11);
    expect(poem.verified).toBe(false);
  });

  test('8 picks of which 3 are unknown IDs is 5 Lines: under the minimum, so no Poem', async () => {
    await expect(makePoem(full, pickingWithUnknown(5, 3))).rejects.toMatchObject({
      reason: 'wrong-size',
      retryable: true,
      message: 'Beam returned 5 Lines; a Poem needs 8 to 14. Try again.',
    });
  });

  test('7 picks of which 1 is unknown is 6 Lines, the least a small Conversation takes: a Poem without the badge', async () => {
    const { poem } = await makePoem(small, pickingWithUnknown(6, 1));

    expect(poem.lines).toHaveLength(6);
    expect(poem.verified).toBe(false);
  });

  test('6 picks of which 1 is unknown is 5 Lines: no Poem', async () => {
    await expect(makePoem(small, pickingWithUnknown(5, 1))).rejects.toMatchObject({
      reason: 'wrong-size',
      message: 'Beam returned 5 Lines; a Poem needs 6 to 8. Try again.',
    });
  });

  test('a Snippet named twice is one Line, so it does not make up the numbers', async () => {
    const beam = createFakeBeam((request) => {
      const ids = promptSnippets(request).slice(0, 5).map(({ id }) => id);
      return { picks: [...ids, ids[0]!].map((id) => ({ id, note: 'Any.' })) };
    });

    await expect(makePoem(small, beam)).rejects.toMatchObject({
      reason: 'wrong-size',
      message: 'Beam returned 5 Lines; a Poem needs 6 to 8. Try again.',
    });
  });

  test('an answer with no real Snippet at all is still the invalid-answer error it was', async () => {
    await expect(makePoem(small, pickingWithUnknown(0, 6))).rejects.toMatchObject({ reason: 'invalid-response', retryable: true });
  });
});

describe('trying again after a Poem of the wrong size', () => {
  test('a second answer of the right size makes the Poem, from the same choices', async () => {
    const answers = [3, 7];
    const beam = createFakeBeam((request) => firstSnippets(request, answers.shift()!));

    await expect(makePoem(small, beam)).rejects.toMatchObject({ reason: 'wrong-size' });
    const { poem } = await makePoem(small, beam);

    expect(poem.lines).toHaveLength(7);
    expect(poem.verified).toBe(true);
    expect(beam.requests).toHaveLength(2);
    expect(beam.requests[1]).toEqual(beam.requests[0]);
  });
});

describe('the bounds of each size tier are Poems', () => {
  test.each([
    { tier: '15 to 39 usable Snippets', conversation: conversationWith(15), range: [6, 8] },
    { tier: '15 to 39 usable Snippets', conversation: conversationWith(39), range: [6, 8] },
    { tier: '40 or more usable Snippets', conversation: conversationWith(40), range: [8, 14] },
    { tier: '40 or more usable Snippets', conversation: conversationWith(400), range: [8, 14] },
  ])('$tier: $range Lines are accepted', async ({ conversation, range: [min, max] }) => {
    for (const count of [min!, max!]) {
      const { poem } = await makePoem(conversation, pickingCount(count));

      expect(poem.lines).toHaveLength(count);
      expect(poem.verified).toBe(true);
    }
  });

  test.each([
    { tier: '15 to 39 usable Snippets', conversation: conversationWith(39), lines: [5, 9], needs: '6 to 8' },
    { tier: '40 or more usable Snippets', conversation: conversationWith(40), lines: [7, 15], needs: '8 to 14' },
  ])('$tier: $lines Lines, one outside either bound, are rejected', async ({ conversation, lines, needs }) => {
    for (const count of lines) {
      await expect(makePoem(conversation, pickingCount(count)), `${count} Lines`).rejects.toMatchObject({
        reason: 'wrong-size',
        message: `Beam returned ${count} Lines; a Poem needs ${needs}. Try again.`,
      });
    }
  });

  test('which tier a Conversation is in decides: 14 Lines is too many at 39 usable Snippets, 6 too few at 40', async () => {
    await expect(makePoem(conversationWith(39), pickingCount(14))).rejects.toMatchObject({ reason: 'wrong-size' });
    await expect(makePoem(conversationWith(40), pickingCount(6))).rejects.toMatchObject({ reason: 'wrong-size' });
  });
});
