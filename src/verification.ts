// Verification: Beam's answer is only a list of Snippet IDs and Notes. Code looks up
// every Line's text and Receipt from the Conversation itself, and fixes the order.

import { BeamError } from './beam/port';
import { formatDateLabel } from './dates';
import type { Line, Snippet } from './domain';
import { MAX_POEM_LINES, MIN_POEM_LINES, type LineRange } from './selection';

interface Pick {
  id: string;
  note: string;
  callbacks: string[];
}

/**
 * Turn Beam's answer into verified Lines, sorted by date (ties by Message order).
 *
 * - An unknown ID is rejected, and withholds the badge.
 * - A Note that cites an unknown callback ID is dropped; its Line stays.
 * - An answer that is not the agreed JSON, or has no real Snippet in it, is a
 *   retryable {@link BeamError}.
 */
export function verifyAnswer(content: string, snippets: Snippet[]): { lines: Line[]; verified: boolean } {
  const picks = parsePicks(content);
  const byId = new Map(snippets.map((snippet) => [snippet.id, snippet]));

  const resolved = new Map<string, { snippet: Snippet; pick: Pick }>();
  let rejected = 0;
  for (const pick of picks) {
    const snippet = byId.get(pick.id);
    if (!snippet) rejected++;
    else if (!resolved.has(snippet.id)) resolved.set(snippet.id, { snippet, pick });
  }
  if (resolved.size === 0) {
    throw new BeamError('invalid-response', 'Beam did not pick any real Snippet. Trying again may work.', true);
  }

  const inTimelineOrder = [...resolved.values()].sort((a, b) => timelineOrder(a.snippet, b.snippet));

  const lines = inTimelineOrder.map(({ snippet, pick }): Line => {
    const noteIsSound = pick.callbacks.every((id) => byId.has(id));
    return lineOf(snippet, noteIsSound ? pick.note : null, noteIsSound ? pick.callbacks : []);
  });
  return { lines, verified: rejected === 0 };
}

/**
 * Hold verified Lines to the size of Poem this Conversation can carry: the size table's range
 * for it, and never outside the Glossary's 6 to 14. Lines Beam named that verification dropped
 * (unknown IDs, a Snippet named twice) are already out of `lines`, so they count against the
 * total: 14 picks with 3 unknown IDs are 11 Lines, and are judged as 11.
 *
 * Anything else is a retryable {@link BeamError}, and no Poem is made.
 */
export function requireLineCount(lines: readonly Line[], range: LineRange): void {
  const min = Math.max(range.min, MIN_POEM_LINES);
  const max = Math.min(range.max, MAX_POEM_LINES);
  if (lines.length >= min && lines.length <= max) return;
  throw new BeamError(
    'wrong-size',
    `Beam returned ${lines.length} ${lines.length === 1 ? 'Line' : 'Lines'}; a Poem needs ${min} to ${max}. Try again.`,
    true,
  );
}

/** A Line is always a Snippet's own text and Receipt, looked up from the Conversation. */
export function lineOf(snippet: Snippet, note: string | null, callbacks: string[]): Line {
  return {
    snippetId: snippet.id,
    text: snippet.text,
    receipt: {
      sender: snippet.sender,
      date: snippet.date,
      approximate: snippet.approximate,
      dateLabel: formatDateLabel(snippet.date, snippet.approximate),
      messageOrdinal: snippet.messageOrdinal,
    },
    note,
    callbacks,
  };
}

function parsePicks(content: string): Pick[] {
  const invalid = () => new BeamError('invalid-response', 'Beam answered in an unexpected shape. Trying again may work.', true);

  let answer: unknown;
  try {
    answer = JSON.parse(content);
  } catch {
    throw invalid();
  }

  const lines = (answer as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines)) throw invalid();

  return lines.map((line: unknown): Pick => {
    const { id, note, callbacks = [] } = (line ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || typeof note !== 'string') throw invalid();
    if (!Array.isArray(callbacks) || !callbacks.every((callback) => typeof callback === 'string')) throw invalid();
    return { id, note, callbacks: callbacks as string[] };
  });
}

/** By date, ties by Message order, then by position within the Message. */
function timelineOrder(a: Snippet, b: Snippet): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.messageOrdinal - b.messageOrdinal || a.index - b.index;
}
