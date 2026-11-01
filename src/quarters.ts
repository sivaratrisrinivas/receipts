// The quarters of a Conversation's timeline: four equal spans of its date range. The
// prompt asks Beam for a Line from each one, and the Gallery Poems are held to the same
// definition (src/gallery-poems/rules.ts).

import type { Conversation, IsoDate } from './domain';

/**
 * The five dates that fence the four quarters: the first Message's date, three equal
 * steps through the range, and the last Message's date. Empty for an empty Conversation.
 */
export function quarterBoundaries({ messages }: Conversation): IsoDate[] {
  const first = messages[0]?.date;
  const last = messages[messages.length - 1]?.date;
  if (first === undefined || last === undefined) return [];
  const start = Date.parse(`${first}T00:00:00Z`);
  const span = Date.parse(`${last}T00:00:00Z`) - start;
  return [0, 1, 2, 3, 4].map((q) => new Date(start + (span * q) / 4).toISOString().slice(0, 10));
}

/**
 * Which quarter (0 to 3) a date falls in. A date on a shared boundary opens the later
 * quarter, and the last day of the range closes the fourth.
 */
export function quarterOf(boundaries: readonly IsoDate[], date: IsoDate): 0 | 1 | 2 | 3 {
  const opened = [1, 2, 3].filter((q) => boundaries[q] !== undefined && boundaries[q]! <= date).length;
  return opened as 0 | 1 | 2 | 3;
}
