// The Poem pipeline: raw source -> Conversation -> Snippets -> prompt -> Beam ->
// verified, date-sorted Poem. A pure function over the Beam port; it runs unchanged
// in Node and in the browser.

import { requireContent, type BeamPort, type BeamProgress } from './beam/port';
import type { Conversation, Occasion, Poem, Sender, Snippet } from './domain';
import { buildPrompt } from './prompt';
import { readConversation, type RawSource } from './sources';
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
  /** Kept so callers can show a Line in context and offer replacement Snippets. */
  conversation: Conversation;
  snippets: Snippet[];
}

export interface MakePoemOptions {
  /** Called as Beam reasons, so the UI can show it has not hung. */
  onProgress?: (progress: BeamProgress) => void;
  /**
   * Chooses which part of the Conversation Beam gets to read, before Snippets are
   * formed. The eval uses it to show Beam only the most recent Messages.
   */
  narrow?: (conversation: Conversation) => Conversation;
}

export async function makePoem(
  request: PoemRequest,
  beam: BeamPort,
  options: MakePoemOptions = {},
): Promise<PoemOutcome> {
  const conversation = (options.narrow ?? ((whole) => whole))(readConversation(request.source));
  const snippets = snippetsOf(conversation);

  const completion = await beam.complete(
    buildPrompt({ conversation, snippets, ...request }),
    options.onProgress,
  );
  const { lines, verified } = verifyAnswer(requireContent(completion), snippets);
  return {
    poem: { occasion: request.occasion, giver: request.giver, recipient: request.recipient, lines, verified },
    conversation,
    snippets,
  };
}
