// Synthetic Gallery-shaped volumes of any size, for testing how the pipeline copes with
// Conversations that are far longer or far smaller than the real Gallery. The layout is the
// one the Gallery reader understands (`_R.B. to E.B.B._` markers, a dated header, one
// paragraph of prose); every word is invented for these tests.

import type { PoemRequest } from '../../src';
import type { IsoDate } from '../../src/domain';

export interface SyntheticLetter {
  sender: 'R' | 'E';
  date: IsoDate;
  /** One paragraph. Under 40 words, a capital first, a full stop last: exactly one Snippet. */
  body: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Gutenberg-style text for these letters, in the order given. */
export function volumeOfLetters(letters: SyntheticLetter[]): string {
  return letters
    .map(({ sender, date, body }) => {
      const [year, month, day] = date.split('-').map(Number);
      return [
        sender === 'R' ? '_R.B. to E.B.B._' : '_E.B.B. to R.B._',
        '',
        `                              [Post-mark, ${MONTHS[month! - 1]} ${day}, ${year}.]`,
        '',
        body,
        '',
        '',
      ].join('\n');
    })
    .join('\n');
}

/** `count` distinct dates spread evenly over `years` years from 10 January 1845. */
export function spreadDays(count: number, years: number): IsoDate[] {
  const start = Date.UTC(1845, 0, 10);
  const spanDays = Math.round(years * 365.25);
  return Array.from({ length: count }, (_, i) => {
    const offset = count === 1 ? 0 : Math.floor((i * spanDays) / (count - 1));
    return new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
  });
}

/** Every day gets `lettersPerDay` letters, alternating between the two Senders. */
export function lettersOnDays(days: IsoDate[], lettersPerDay: number, body: (n: number) => string): SyntheticLetter[] {
  return days.flatMap((date, d) =>
    Array.from({ length: lettersPerDay }, (_, i) => ({
      sender: (i % 2 === 0 ? 'R' : 'E') as 'R' | 'E',
      date,
      body: body(d * lettersPerDay + i),
    })),
  );
}

/** One short Snippet each: a usable Snippet per letter. */
export const shortBody = (n: number) => `This is thing number ${n} that we said to each other.`;

/** Too short to be a Snippet (under 3 words). */
export const tooShortBody = () => 'Thank you.';

/** One long Snippet each: 36 long words, so a few thousand of them overflow the token budget. */
export const heavyBody = (n: number) => `Remembering ${n}, ${Array(35).fill('extraordinarily').join(' ')}.`;

/** A request for a Poem from a Gallery-shaped volume, Robert to Elizabeth. */
export function requestFor(volume: string): PoemRequest {
  return {
    source: { kind: 'gallery', texts: [volume] },
    occasion: 'anniversary',
    giver: 'Robert',
    recipient: 'Elizabeth',
  };
}

/** A Conversation with exactly `usable` Snippets, plus `unusable` letters too short to count. */
export function conversationWith(usable: number, unusable = 0): PoemRequest {
  const days = spreadDays(usable + unusable, 1);
  const usableLetters = lettersOnDays(days.slice(0, usable), 1, shortBody);
  const unusableLetters = lettersOnDays(days.slice(usable), 1, tooShortBody);
  return requestFor(volumeOfLetters([...usableLetters, ...unusableLetters]));
}
