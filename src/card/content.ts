// What a Card says, before any rendering. Both the HTML Card and the PNG are drawn from
// this one value, so they cannot disagree, and so a Note (which is not in it) cannot reach
// either.

import { formatDateLabel } from '../dates';
import type { Conversation, IsoDate, Poem, Sender } from '../domain';
import { locateLine, type Mark } from '../locate';

/** How many Messages of context sit either side of a Line's own Message. */
export const CONTEXT_EITHER_SIDE = 2;

/** The longest title a Giver can put on a Card. */
export const CARD_TITLE_MAX = 100;

/** One Message in the context under a Line. */
export interface ContextMessage {
  sender: Sender;
  date: IsoDate;
  /** Human date, prefixed `c. ` when the date is only an estimate. */
  dateLabel: string;
  text: string;
  /** True for the Message the Line was taken from. */
  isSource: boolean;
  /** For the source Message: where the Line sits in it, when it can be found. */
  mark: Mark | null;
}

export interface CardLine {
  snippetId: string;
  text: string;
  sender: Sender;
  date: IsoDate;
  dateLabel: string;
  /** The Line's Message and up to two Messages either side; empty if the Message cannot be found. */
  context: ContextMessage[];
}

export interface CardContent {
  /** What the Giver wrote, tidied; null when they wrote none. Beam never writes one. */
  title: string | null;
  recipient: Sender;
  lines: CardLine[];
  /** Whether the "every line is real" badge may be shown. */
  verified: boolean;
  /** One sentence making clear the Lines were assembled from many Messages over time. */
  framing: string;
}

export interface CardOptions {
  /** The Giver's own title. Optional; blank means none. */
  title?: string | undefined;
}

export function cardContent(poem: Poem, conversation: Conversation, options: CardOptions = {}): CardContent {
  return {
    title: cleanTitle(options.title),
    recipient: poem.recipient,
    lines: poem.lines.map((line) => ({
      snippetId: line.snippetId,
      text: line.text,
      sender: line.receipt.sender,
      date: line.receipt.date,
      dateLabel: line.receipt.dateLabel,
      context: contextOf(conversation, line.receipt.messageOrdinal, line.text),
    })),
    verified: poem.verified,
    framing: framingOf(poem),
  };
}

/** Whitespace tidied and the length capped; null when nothing is left. */
export function cleanTitle(title: string | undefined): string | null {
  const tidy = [...(title ?? '').replace(/\s+/g, ' ').trim()].slice(0, CARD_TITLE_MAX).join('').trim();
  return tidy === '' ? null : tidy;
}

function contextOf(conversation: Conversation, ordinal: number, lineText: string): ContextMessage[] {
  const at = conversation.messages.findIndex((message) => message.ordinal === ordinal);
  if (at < 0) return [];
  return conversation.messages
    .slice(Math.max(0, at - CONTEXT_EITHER_SIDE), at + CONTEXT_EITHER_SIDE + 1)
    .map((message) => {
      const isSource = message.ordinal === ordinal;
      return {
        sender: message.sender,
        date: message.date,
        dateLabel: formatDateLabel(message.date, message.approximate),
        text: message.text,
        isSource,
        mark: isSource ? locateLine(message.text, lineText) : null,
      };
    });
}

function framingOf(poem: Poem): string {
  if (poem.lines.length === 0) return '';
  const messages = new Set(poem.lines.map((line) => line.receipt.messageOrdinal)).size;
  const byDate = [...poem.lines].sort((a, b) => (a.receipt.date < b.receipt.date ? -1 : a.receipt.date > b.receipt.date ? 1 : 0));
  const first = byDate[0]!.receipt;
  const last = byDate[byDate.length - 1]!.receipt;
  const count = messages === 1 ? 'one real message' : `${messages} real messages`;
  const when = first.date === last.date ? `on ${first.dateLabel}` : `between ${first.dateLabel} and ${last.dateLabel}`;
  return `Assembled from ${count}, sent ${when}.`;
}
