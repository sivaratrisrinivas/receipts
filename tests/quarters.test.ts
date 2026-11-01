// Seam: the quarters of a Conversation's timeline. The prompt tells Beam to draw a Line
// from each one, and the Gallery Poems are held to the same definition, so there is one
// place that says which quarter a date falls in.

import { describe, expect, test } from 'vitest';
import type { Conversation, Message } from '../src';
import { quarterBoundaries, quarterOf } from '../src/quarters';

/** A Conversation with one Message on each of the given dates. */
function conversationOn(...dates: string[]): Conversation {
  const messages: Message[] = dates.map((date, ordinal) => ({
    ordinal,
    sender: ordinal % 2 === 0 ? 'Robert' : 'Elizabeth',
    date,
    approximate: false,
    text: `A message sent on ${date}.`,
  }));
  return { kind: 'letters', senders: ['Robert', 'Elizabeth'], messages };
}

describe('the quarters of a timeline', () => {
  test('four equal spans of the date range, from the first Message to the last', () => {
    const eightDays = conversationOn('2025-01-01', '2025-01-05', '2025-01-09');

    expect(quarterBoundaries(eightDays)).toEqual(['2025-01-01', '2025-01-03', '2025-01-05', '2025-01-07', '2025-01-09']);
  });

  test('a date belongs to one quarter: a boundary day opens the later quarter, and the last day closes the fourth', () => {
    const boundaries = quarterBoundaries(conversationOn('2025-01-01', '2025-01-09'));

    const quarters = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05', '2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09'].map(
      (date) => quarterOf(boundaries, date),
    );

    expect(quarters).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 3]);
  });

  test('an empty Conversation has no quarters', () => {
    expect(quarterBoundaries(conversationOn())).toEqual([]);
  });
});
