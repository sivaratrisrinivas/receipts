// Context for the Giver: where a Line came from, and what a Note points back to. This is
// read-only helper logic for the Giver's own screen. None of it feeds the Card.

import type { Conversation, Line, Sender } from './domain';

/** A Line's original Message, split around the Line so the Line can be marked within it. */
export interface MessageContext {
  sender: Sender;
  /** As on the Receipt, `c.`-prefixed when the date is an estimate. */
  dateLabel: string;
  before: string;
  /** The Line's text as it sits in the Message, or `''` when it cannot be found there. */
  snippet: string;
  after: string;
}

/**
 * The Message a Line was taken from, in full. The Line is found again inside it ignoring
 * differences in whitespace (a Snippet is whitespace-normalised, a Message keeps its
 * paragraph breaks); if it cannot be found the whole Message is returned unmarked.
 */
export function contextOf(conversation: Conversation, line: Line): MessageContext | null {
  const message = conversation.messages.find((candidate) => candidate.ordinal === line.receipt.messageOrdinal);
  if (message === undefined) return null;

  const words = line.text.split(/\s+/).filter((word) => word !== '');
  const found = new RegExp(words.map(escapeRegExp).join('\\s+')).exec(message.text);
  const base = { sender: line.receipt.sender, dateLabel: line.receipt.dateLabel };
  if (found === null || words.length === 0) return { ...base, before: message.text, snippet: '', after: '' };
  return {
    ...base,
    before: message.text.slice(0, found.index),
    snippet: found[0],
    after: message.text.slice(found.index + found[0].length),
  };
}

export type NotePart = { text: string } | { callback: string };

/**
 * A Note as runs of text and links: each Snippet ID the Line's callbacks name becomes a
 * `callback`. Any other ID-looking text stays text, because it was not verified.
 */
export function noteParts(note: string, callbacks: readonly string[]): NotePart[] {
  const parts: NotePart[] = [];
  let from = 0;
  for (const match of note.matchAll(/\bs\d+\b/g)) {
    if (!callbacks.includes(match[0])) continue;
    if (match.index > from) parts.push({ text: note.slice(from, match.index) });
    parts.push({ callback: match[0] });
    from = match.index + match[0].length;
  }
  if (from < note.length) parts.push({ text: note.slice(from) });
  return parts;
}

/**
 * The callbacks of a Line that its Note's own text does not link, each once, in order. Beam
 * seldom writes the ID in the Note (in the eval, 3 of 143 Lines with callbacks), so these are
 * shown as links beside the Note instead.
 */
export function unlinkedCallbacks(note: string, callbacks: readonly string[]): string[] {
  const linked = new Set(noteParts(note, callbacks).flatMap((part) => ('callback' in part ? [part.callback] : [])));
  return [...new Set(callbacks)].filter((id) => !linked.has(id));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
