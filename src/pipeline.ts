// The Poem pipeline: raw source -> Conversation -> Snippets -> prompt -> Beam ->
// verified, date-sorted Poem. A pure function over the Beam port; it runs unchanged
// in Node and in the browser.

import { requireContent, type BeamPort, type BeamProgress } from './beam/port';
import type { Conversation, Occasion, Poem, Sender, Snippet } from './domain';
import { buildPrompt } from './prompt';
import { redactConversation } from './redaction';
import { readConversation, type RawSource } from './sources';
import { between } from './sources/between';
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
}

export async function makePoem(
  request: PoemRequest,
  beam: BeamPort,
  options: MakePoemOptions = {},
): Promise<PoemOutcome> {
  // Only the Giver's and the Recipient's Messages get as far as a Snippet, and only once
  // phone numbers and email addresses are out of them.
  const conversation = redactConversation(between(readConversation(request.source), request.giver, request.recipient));
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
