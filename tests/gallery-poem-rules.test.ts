// Seam: what makes a Poem fit to ship as a Gallery Poem. A Poem goes in (with the
// Conversation it came from); what is wrong with it comes out, empty when it is fine.

import { describe, expect, test } from 'vitest';
import type { Conversation, Message } from '../src';
import { checkGalleryPoem } from '../src/gallery-poems/rules';
import { lineFor, poemOf, twelveMessages } from './fixtures/card';

// twelveMessages(): Robert sends the even ordinals, Elizabeth the odd ones, between
// 3 Jan 2024 and 2 Jan 2025. By quarter: Q1 is 0-4, Q2 is 5-6, Q3 is 7-8, Q4 is 9-11.
const conversation = twelveMessages();

describe('a Gallery Poem must be a whole Poem', () => {
  test('a verified Poem of 6 to 14 Lines, from every quarter and both Senders, has nothing wrong with it', () => {
    expect(checkGalleryPoem(poemOf(conversation, [0, 1, 5, 7, 9, 10]), conversation)).toEqual([]);
  });

  test('a Line missing from a quarter is named', () => {
    const problems = checkGalleryPoem(poemOf(conversation, [0, 1, 2, 3, 4, 5]), conversation);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Q3, Q4/);
  });

  test('a Poem in only one Sender\'s voice is named, with the Sender who is missing', () => {
    const problems = checkGalleryPoem(poemOf(conversation, [0, 2, 4, 6, 8, 10]), conversation);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Elizabeth/);
  });

  test('the badge withheld means the Poem is not shippable', () => {
    const problems = checkGalleryPoem(poemOf(conversation, [0, 1, 5, 7, 9, 10], { verified: false }), conversation);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/verif/i);
  });

  test('fewer than 6 Lines, or more than 14, is not a Poem', () => {
    const tooFew = poemOf(conversation, [0, 1, 5, 7, 9]);
    const tooMany = { ...tooFew, lines: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2].map((ordinal) => lineFor(conversation, ordinal)) };

    expect(checkGalleryPoem(tooFew, conversation)[0]).toMatch(/5 Lines/);
    expect(checkGalleryPoem(tooMany, conversation)[0]).toMatch(/15 Lines/);
  });

  test('every problem is reported, not just the first', () => {
    const problems = checkGalleryPoem(poemOf(conversation, [0, 2, 4], { verified: false }), conversation);

    expect(problems).toHaveLength(4);
  });

  test('a quarter in which nothing was ever said needs no Line', () => {
    // Everything was said in the first and last quarters of this range.
    const dates = ['2025-01-01', '2025-01-01', '2025-01-02', '2025-01-08', '2025-01-09', '2025-01-09'];
    const messages: Message[] = dates.map((date, ordinal) => ({
      ordinal,
      sender: ordinal % 2 === 0 ? 'Robert' : 'Elizabeth',
      date,
      approximate: false,
      text: `Said on ${date}, message ${ordinal}.`,
    }));
    const gappy: Conversation = { kind: 'chat', senders: ['Robert', 'Elizabeth'], messages };

    expect(checkGalleryPoem(poemOf(gappy, [0, 1, 2, 3, 4, 5]), gappy)).toEqual([]);
  });
});
