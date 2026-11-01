// Fixtures for the Card tests: a small Conversation whose every Message carries a
// unique marker word, so a test can tell exactly which Messages reached a Card.

import { formatDateLabel } from '../../src/dates';
import type { Conversation, Line, Message, Poem } from '../../src';

/** Marker for the Message at `ordinal`; also what that Message says. */
export const marker = (ordinal: number): string => `Marker${String(ordinal).padStart(2, '0')}`;

const DATES = [
  '2024-01-03', '2024-01-09', '2024-02-14', '2024-02-14', '2024-03-30', '2024-05-01',
  '2024-06-21', '2024-07-04', '2024-09-10', '2024-10-31', '2024-12-24', '2025-01-02',
];

/** Twelve chat Messages, Robert and Elizabeth taking turns; Message 6 has only an estimated date. */
export function twelveMessages(): Conversation {
  const messages: Message[] = DATES.map((date, ordinal) => ({
    ordinal,
    sender: ordinal % 2 === 0 ? 'Robert' : 'Elizabeth',
    date,
    approximate: ordinal === 6,
    text: `${marker(ordinal)} said at length that this was one of the good ones.`,
  }));
  return { kind: 'chat', senders: ['Robert', 'Elizabeth'], messages };
}

/** A Line whose text is the whole Message at `ordinal`. */
export function lineFor(conversation: Conversation, ordinal: number, note: string | null = null): Line {
  const message = conversation.messages.find((candidate) => candidate.ordinal === ordinal)!;
  return {
    snippetId: `s${ordinal}`,
    text: message.text,
    receipt: {
      sender: message.sender,
      date: message.date,
      approximate: message.approximate,
      dateLabel: formatDateLabel(message.date, message.approximate),
      messageOrdinal: ordinal,
    },
    note,
    callbacks: [],
  };
}

export function poemOf(conversation: Conversation, ordinals: number[], overrides: Partial<Poem> = {}): Poem {
  return {
    occasion: 'anniversary',
    giver: 'Robert',
    recipient: 'Elizabeth',
    lines: ordinals.map((ordinal) => lineFor(conversation, ordinal)),
    verified: true,
    ...overrides,
  };
}
