// Seam 1, long and small Conversations: how many Lines Beam is asked for follows how many
// usable Snippets there are, a Conversation too small for a Poem is refused without a Beam
// call, and one too long to fit the input budget is read evenly across its timeline.

import { describe, expect, test } from 'vitest';
import { createFakeBeam, estimateTokens, INPUT_TOKEN_BUDGET, tryMakePoem, type BeamRequest, type PoemRequest } from '../src';
import { promptSnippets } from './support/prompt';
import { conversationWith, heavyBody, lettersOnDays, requestFor, shortBody, spreadDays, volumeOfLetters } from './fixtures/letters';

/** A fake Beam that picks the first 8 Snippets it is shown: a whole Poem in either size tier (6 to 8, 8 to 14). */
function pickingFirst() {
  return createFakeBeam((request) => ({ picks: promptSnippets(request).slice(0, 8).map(({ id }) => ({ id, note: 'Any.' })) }));
}

/** The Line range the prompt asks Beam for ("Choose 6 to 8 Snippets"). */
function askedFor(request: BeamRequest): [number, number] {
  const match = /Choose (\d+) to (\d+) Snippets/.exec(request.system);
  if (!match) throw new Error('the prompt does not say how many Snippets to choose');
  return [Number(match[1]), Number(match[2])];
}

describe('how many Lines a Conversation can carry', () => {
  test.each([
    { usable: 15, lines: [6, 8] },
    { usable: 28, lines: [6, 8] },
    { usable: 39, lines: [6, 8] },
    { usable: 40, lines: [8, 14] },
    { usable: 41, lines: [8, 14] },
    { usable: 400, lines: [8, 14] },
  ])('$usable usable Snippets: Beam is asked for $lines Lines', async ({ usable, lines }) => {
    const beam = pickingFirst();

    const result = await tryMakePoem(conversationWith(usable), beam);

    expect('poem' in result).toBe(true);
    expect(beam.requests).toHaveLength(1);
    expect(askedFor(beam.requests[0]!)).toEqual(lines);
  });

  test.each([0, 1, 14])('%i usable Snippets: no Poem, and Beam is never called', async (usable) => {
    const beam = pickingFirst();

    const result = await tryMakePoem(conversationWith(usable, 3), beam);

    expect(result).toMatchObject({ refused: 'not-enough', usableSnippets: usable, needed: 15 });
    expect(beam.requests).toHaveLength(0);
  });

  test('only usable Snippets count: letters too short to be a Snippet do not make a Poem possible', async () => {
    const beam = pickingFirst();

    const result = await tryMakePoem(conversationWith(10, 30), beam);

    expect(result).toMatchObject({ refused: 'not-enough', usableSnippets: 10 });
    expect(beam.requests).toHaveLength(0);
  });
});

/**
 * A Conversation of 1,800 days over nine years, `lettersPerDay` heavy letters each. At four a
 * day it is about 1.4M tokens (so every 2nd day fits the budget); at six, about 2M (every 3rd).
 */
const DAYS = spreadDays(1800, 9);
function longConversation(lettersPerDay: number): { volume: string; request: PoemRequest } {
  const volume = volumeOfLetters(lettersOnDays(DAYS, lettersPerDay, heavyBody));
  return { volume, request: requestFor(volume) };
}

/** Which of the fixture's days Beam was shown, read from the prompt's `## <initial> <date>` headers. */
function daysShown(request: BeamRequest): string[] {
  const dates = request.user.split('\n').flatMap((row) => /^## \S+ c?\.?(\d{4}-\d{2}-\d{2})$/.exec(row)?.[1] ?? []);
  return [...new Set(dates)];
}

describe('a Conversation too long for the input budget', () => {
  test('the prompt stays under the budget, where the whole Conversation would not', async () => {
    const { volume, request } = longConversation(4);
    const beam = pickingFirst();

    await tryMakePoem(request, beam);

    const prompt = beam.requests[0]!.system + beam.requests[0]!.user;
    expect(estimateTokens(volume)).toBeGreaterThan(INPUT_TOKEN_BUDGET);
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(INPUT_TOKEN_BUDGET);
    // The budget is 800k; at the 3.5 characters per token measured on the Gallery it really is under it.
    expect(prompt.length / 3.5).toBeLessThan(800_000);
  });

  test('whole days are dropped: every Snippet of a day Beam read is shown, every Snippet of the others is not', async () => {
    const { request } = longConversation(4);
    const beam = pickingFirst();

    await tryMakePoem(request, beam);

    const shown = beam.requests[0]!.user;
    const perDay = new Map<string, number>();
    for (const row of shown.split('\n')) {
      const header = /^## \S+ c?\.?(\d{4}-\d{2}-\d{2})$/.exec(row);
      if (header) perDay.set(header[1]!, (perDay.get(header[1]!) ?? 0) + 1);
    }
    // Four letters a day, so four Message headers for each day that is shown, and none for the rest.
    expect([...perDay.values()].every((headers) => headers === 4)).toBe(true);
    expect(perDay.size).toBeGreaterThan(0);
    expect(perDay.size).toBeLessThan(DAYS.length);
  });

  test('the dropped days are spread evenly across the nine years, early and late alike', async () => {
    const { request } = longConversation(4);
    const beam = pickingFirst();

    await tryMakePoem(request, beam);

    const shown = new Set(daysShown(beam.requests[0]!));
    const keptAt = DAYS.flatMap((date, i) => (shown.has(date) ? [i] : []));
    const gaps = keptAt.slice(1).map((at, i) => at - keptAt[i]!);
    expect(new Set(gaps)).toEqual(new Set([2]));
    // Neither end of the timeline is favoured: the first and the last Snippets are within one stride of the ends.
    expect(keptAt[0]).toBeLessThan(2);
    expect(keptAt[keptAt.length - 1]).toBeGreaterThanOrEqual(DAYS.length - 2);
  });

  test('a heavier Conversation drops more: about 2M tokens is read every 3rd day, still under the budget', async () => {
    const { request } = longConversation(6);
    const beam = pickingFirst();

    const result = await tryMakePoem(request, beam);

    const shown = new Set(daysShown(beam.requests[0]!));
    const keptAt = DAYS.flatMap((date, i) => (shown.has(date) ? [i] : []));
    expect(new Set(keptAt.slice(1).map((at, i) => at - keptAt[i]!))).toEqual(new Set([3]));
    expect(result).toMatchObject({ readFraction: { stride: 3, readDays: 600, totalDays: 1800 } });
    expect(estimateTokens(beam.requests[0]!.system + beam.requests[0]!.user)).toBeLessThanOrEqual(INPUT_TOKEN_BUDGET);
  });

  test('the fraction read is reported: every 2nd of 1,800 days, over the nine years it covers', async () => {
    const { request } = longConversation(4);
    const beam = pickingFirst();

    const result = await tryMakePoem(request, beam);

    expect(result).toMatchObject({
      readFraction: { stride: 2, readDays: 900, totalDays: 1800, firstDate: DAYS[0], lastDate: DAYS[DAYS.length - 1] },
    });
    // ... and it matches what Beam was really shown.
    expect(daysShown(beam.requests[0]!)).toHaveLength(900);
  });

  test('Beam can only pick from what it was shown: a Snippet from a dropped day is rejected and withholds the badge', async () => {
    const { request } = longConversation(4);
    const beam = createFakeBeam((asked) => ({
      picks: [
        ...promptSnippets(asked).slice(0, 8).map(({ id }) => ({ id, note: 'Shown.' })),
        // The first Snippet of the dropped 2nd day (4 Snippets a day, ids in Conversation order).
        { id: 's4', note: 'Dropped.' },
      ],
    }));

    const result = await tryMakePoem(request, beam);

    expect(result).toMatchObject({ poem: { verified: false } });
    expect('poem' in result && result.poem.lines).toHaveLength(8);
  });

  test('a Conversation that fits is read whole: nothing dropped, every day shown', async () => {
    const days = spreadDays(100, 1);
    const request = requestFor(volumeOfLetters(lettersOnDays(days, 2, shortBody)));
    const beam = pickingFirst();

    const result = await tryMakePoem(request, beam);

    expect(result).toMatchObject({ readFraction: { stride: 1, readDays: 100, totalDays: 100 } });
    expect(daysShown(beam.requests[0]!)).toEqual(days);
  });
});
