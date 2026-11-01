// The Poem pipeline: raw source -> Conversation -> Snippets -> prompt -> Beam ->
// verified, date-sorted Poem. A pure function over the Beam port; it runs unchanged
// in Node and in the browser.

import { requireContent, type BeamPort, type BeamProgress } from './beam/port';
import type { Conversation, Occasion, Poem, Sender, Snippet } from './domain';
import { buildPrompt } from './prompt';
import { readConversation, type RawSource } from './sources';
import { selectSnippets, type ReadFraction } from './selection';
import { snippetsOf } from './snippets';
import { verifyAnswer } from './verification';

export interface PoemRequest {
  source: RawSource;
  occasion: Occasion;
  giver: Sender;
  recipient: Sender;
  /** The Giver's optional context for Beam, e.g. "she just retired". */
  note?: string;
}

export interface PoemOutcome {
  poem: Poem;
  /** How much of the timeline Beam read; the Giver is told when days were dropped to fit. */
  readFraction: ReadFraction;
  /** Kept so callers can show a Line in context and offer replacement Snippets. */
  conversation: Conversation;
  snippets: Snippet[];
}

/**
 * The Conversation has too few usable Snippets for a Poem, so Beam was never called.
 * A typed result rather than an error: the Giver is told "Not enough here yet for a Poem".
 */
export interface NotEnough {
  refused: 'not-enough';
  /** How many Snippets the Conversation could offer Beam. */
  usableSnippets: number;
  /** The fewest it takes. */
  needed: number;
}

export type PoemResult = PoemOutcome | NotEnough;

export interface MakePoemOptions {
  /** Called as Beam reasons, so the UI can show it has not hung. */
  onProgress?: (progress: BeamProgress) => void;
  /**
   * Chooses which part of the Conversation Beam gets to read, before Snippets are
   * formed. The eval uses it to show Beam only the most recent Messages.
   */
  narrow?: (conversation: Conversation) => Conversation;
}

/** Make a Poem, or say why the Conversation is too small for one. */
export async function tryMakePoem(
  request: PoemRequest,
  beam: BeamPort,
  options: MakePoemOptions = {},
): Promise<PoemResult> {
  const conversation = (options.narrow ?? ((whole) => whole))(readConversation(request.source));
  const snippets = snippetsOf(conversation);

  const selection = selectSnippets(snippets);
  if (selection.kind === 'not-enough') {
    return { refused: 'not-enough', usableSnippets: selection.usableSnippets, needed: selection.needed };
  }

  const completion = await beam.complete(
    buildPrompt({ conversation, ...request, snippets: selection.snippets, lineRange: selection.lineRange }),
    options.onProgress,
  );
  const { lines, verified } = verifyAnswer(requireContent(completion), selection.snippets);
  return {
    poem: { occasion: request.occasion, giver: request.giver, recipient: request.recipient, lines, verified },
    readFraction: selection.readFraction,
    conversation,
    snippets,
  };
}

/** Thrown by {@link makePoem} when {@link tryMakePoem} would have refused. */
export class NotEnoughError extends Error {
  readonly refusal: NotEnough;
  constructor(refusal: NotEnough) {
    super(`Not enough here yet for a Poem: ${refusal.usableSnippets} usable Snippets, ${refusal.needed} needed.`);
    this.name = 'NotEnoughError';
    this.refusal = refusal;
  }
}

/** For callers that know the Conversation is big enough (the Gallery); the app uses {@link tryMakePoem}. */
export async function makePoem(
  request: PoemRequest,
  beam: BeamPort,
  options: MakePoemOptions = {},
): Promise<PoemOutcome> {
  const result = await tryMakePoem(request, beam, options);
  if ('refused' in result) throw new NotEnoughError(result);
  return result;
}
