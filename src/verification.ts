// Verification: Beam's answer is only a list of Snippet IDs and Notes. Code looks up
// every Line's text and Receipt from the Conversation itself, and fixes the order.

import { formatDateLabel } from './dates';
import type { Line, Snippet } from './domain';

interface Pick {
  id: string;
  note: string;
  callbacks: string[];
}

export function verifyPicks(picks: Pick[], snippets: Snippet[]): { lines: Line[]; verified: boolean } {
  const byId = new Map(snippets.map((snippet) => [snippet.id, snippet]));
  const resolved: { snippet: Snippet; pick: Pick }[] = [];
  let rejected = 0;
  for (const pick of picks) {
    const snippet = byId.get(pick.id);
    if (snippet) resolved.push({ snippet, pick });
    else rejected++;
  }

  resolved.sort((a, b) => timelineOrder(a.snippet, b.snippet));

  const lines = resolved.map(({ snippet, pick }): Line => {
    // A Note that cites a Snippet that does not exist is not trusted at all.
    const noteIsSound = pick.callbacks.every((id) => byId.has(id));
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
      note: noteIsSound ? pick.note : null,
      callbacks: noteIsSound ? pick.callbacks : [],
    };
  });
  return { lines, verified: rejected === 0 };
}

/** By date, ties by Message order, then by position within the Message. */
function timelineOrder(a: Snippet, b: Snippet): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.messageOrdinal - b.messageOrdinal || a.index - b.index;
}
