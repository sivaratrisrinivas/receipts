// Poem editing: what the Giver may do with a Poem after Beam has made it (ADR-0002).
//
// They may remove a Line, or replace one with a different Snippet from the same period.
// There is deliberately nothing here that edits a Line's text or moves a Line: a Line is
// only ever looked up from a Snippet, and a replacement takes the place of the Line it
// replaces, between the same two neighbours.

import { BeamError, requireContent, type BeamPort, type BeamProgress, type BeamRequest, type ResponseFormat } from './beam/port';
import type { Line, Poem, Snippet } from './domain';
import { renderSnippets, senderLabels } from './prompt';
import { redactText } from './redaction';
import { lineOf } from './verification';

/** A Poem being worked on, with the Snippets the Giver has taken out of it. */
export interface Draft {
  poem: Poem;
  /** IDs of Snippets removed or replaced away; never offered as a replacement again. */
  removed: readonly string[];
}

export function draftOf(poem: Poem): Draft {
  return { poem, removed: [] };
}

export type EditErrorReason =
  /** The Poem has no such Line. */
  | 'unknown-line'
  /** A Poem keeps at least one Line; to start over, make another. */
  | 'last-line'
  /** Nothing else is left in that period to replace the Line with. */
  | 'no-alternatives';

export class EditError extends Error {
  readonly reason: EditErrorReason;

  constructor(reason: EditErrorReason, message: string) {
    super(message);
    this.name = 'EditError';
    this.reason = reason;
  }
}

export function removeLine(draft: Draft, snippetId: string): Draft {
  const { lines } = draft.poem;
  if (!lines.some((line) => line.snippetId === snippetId)) throw new EditError('unknown-line', 'That Line is not in the Poem.');
  if (lines.length === 1) throw new EditError('last-line', 'A Poem needs at least one Line.');
  return {
    poem: { ...draft.poem, lines: lines.filter((line) => line.snippetId !== snippetId) },
    removed: [...draft.removed, snippetId],
  };
}

export interface ReplaceRequest {
  draft: Draft;
  /** The Line to replace. */
  snippetId: string;
  /** Every Snippet of the Conversation, in Conversation order. */
  snippets: readonly Snippet[];
  beam: BeamPort;
  onProgress?: (progress: BeamProgress) => void;
}

/** What Beam must return when asked for a replacement: one Snippet ID, never any text. */
export const REPLACEMENT_RESPONSE_FORMAT: ResponseFormat = {
  name: 'replacement',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
};

/**
 * Replace a Line with a different Snippet from the same period: one Beam call, shown only
 * the Snippets between the Line's neighbours, so the new Line keeps the old one's place in
 * the timeline.
 *
 * Beam's answer is verified like any pick: the ID must exist, lie in that period, and be
 * neither the current Line nor one the Giver removed. Anything else is a retryable
 * {@link BeamError}, and the Poem is left as it was. The replaced Snippet counts as removed
 * from then on, and the new Line has no Note (Beam is asked for an ID only).
 */
export async function replaceLine({ draft, snippetId, snippets, beam, onProgress }: ReplaceRequest): Promise<Draft> {
  const { poem } = draft;
  const position = poem.lines.findIndex((line) => line.snippetId === snippetId);
  const current = poem.lines[position];
  if (current === undefined) throw new EditError('unknown-line', 'That Line is not in the Poem.');

  // The period is everything strictly between the neighbouring Lines (open-ended at the
  // ends of the Poem). Snippets are in Conversation order, so their index is timeline order.
  const timelineIndex = (line: Line): number => {
    const snippet = snippets.find((candidate) => candidate.id === line.snippetId);
    if (snippet === undefined) throw new EditError('unknown-line', 'That Line is not from this Conversation.');
    return snippet.index;
  };
  const previous = poem.lines[position - 1];
  const next = poem.lines[position + 1];
  const after = previous === undefined ? -1 : timelineIndex(previous);
  const before = next === undefined ? Infinity : timelineIndex(next);

  const unavailable = new Set([...draft.removed, snippetId]);
  // Only the Giver's and the Recipient's words are ever sent to Beam.
  const heard = (snippet: Snippet) => snippet.sender === poem.giver || snippet.sender === poem.recipient;
  const candidates = snippets.filter(
    (snippet) => snippet.index > after && snippet.index < before && !unavailable.has(snippet.id) && heard(snippet),
  );
  if (candidates.length === 0) {
    throw new EditError('no-alternatives', 'There is nothing else from that time to replace this Line with.');
  }

  const completion = await beam.complete(replacementPrompt(poem, current, candidates), onProgress);
  const replacement = candidates.find((snippet) => snippet.id === parseReplacementId(requireContent(completion)));
  if (replacement === undefined) {
    throw new BeamError('invalid-response', 'Beam did not pick one of the Snippets it was offered. Trying again may work.', true);
  }

  return {
    poem: { ...poem, lines: poem.lines.map((line) => (line === current ? lineOf(replacement, null, []) : line)) },
    removed: [...draft.removed, snippetId],
  };
}

function parseReplacementId(content: string): string | null {
  try {
    const { id } = JSON.parse(content) as { id?: unknown };
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

function replacementPrompt(poem: Poem, current: Line, candidates: readonly Snippet[]): BeamRequest {
  const label = senderLabels([poem.giver, poem.recipient]);
  // A Sender's name can itself be a phone number or email address; that must not reach Beam.
  return {
    system: [
      `You help a Giver improve a Poem made only of real Snippets from their Conversation. One Line has to be swapped for a different Snippet. You never write text yourself: you choose a Snippet ID.`,
      `The Giver is ${redactText(poem.giver)} (${label(poem.giver)}); the Recipient is ${redactText(poem.recipient)} (${label(poem.recipient)}). Occasion: ${poem.occasion}.`,
      `Choose exactly ONE Snippet, from the list in the user message only: those are all the Snippets from the same period of the Conversation, between the Poem's neighbouring Lines. Do not choose the Line being replaced.`,
      `Prefer a specific, vivid Snippet that stands on its own as a Line and fits the Occasion, from either Sender. Avoid private matters such as money, health details, addresses and passwords.`,
      `Refer to Snippets by ID only. Answer with the ID alone.`,
    ].join('\n'),
    user: [
      `THE LINE BEING REPLACED (${redactText(current.receipt.sender)}, ${current.receipt.dateLabel}): ${current.text}`,
      `SNIPPETS TO CHOOSE FROM (each Message starts with "## sender date"; then one Snippet per row: id text)\n${renderSnippets(candidates, label)}`,
    ].join('\n\n'),
    responseFormat: REPLACEMENT_RESPONSE_FORMAT,
  };
}
