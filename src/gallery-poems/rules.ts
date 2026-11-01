// What makes a Poem fit to ship as a Gallery Poem. The generation script uses it to
// decide whether to accept what Beam returned, and a test holds the shipped Poems to it.

import type { Conversation, Poem } from '../domain';
import { quarterBoundaries, quarterOf } from '../quarters';

/** The Glossary: a Poem is 6 to 14 Lines. */
export const MIN_POEM_LINES = 6;
export const MAX_POEM_LINES = 14;

/**
 * What is wrong with this Poem as a Gallery Poem, one sentence per problem; empty when
 * nothing is. A Gallery Poem must:
 * - carry the "every line is real" badge (every pick resolved to a real Snippet),
 * - have 6 to 14 Lines,
 * - have a Line from every quarter of the timeline (as the prompt defines the quarters;
 *   a quarter in which nothing was ever said is skipped), and
 * - have Lines from both Senders.
 */
export function checkGalleryPoem(poem: Poem, conversation: Conversation): string[] {
  const problems: string[] = [];

  if (!poem.verified) problems.push('Not every pick verified against the Gallery, so there is no "every line is real" badge.');

  const count = poem.lines.length;
  if (count < MIN_POEM_LINES || count > MAX_POEM_LINES) {
    problems.push(`${count} Lines; a Poem has ${MIN_POEM_LINES} to ${MAX_POEM_LINES}.`);
  }

  const boundaries = quarterBoundaries(conversation);
  const spoken = new Set(conversation.messages.map((message) => quarterOf(boundaries, message.date)));
  const drawn = new Set(poem.lines.map((line) => quarterOf(boundaries, line.receipt.date)));
  const missingQuarters = [...spoken].filter((quarter) => !drawn.has(quarter)).sort();
  if (missingQuarters.length > 0) {
    problems.push(`No Line from ${missingQuarters.map((quarter) => `Q${quarter + 1}`).join(', ')} of the timeline.`);
  }

  const heard = new Set(poem.lines.map((line) => line.receipt.sender));
  for (const sender of conversation.senders) {
    if (!heard.has(sender)) problems.push(`No Line from ${sender}.`);
  }

  return problems;
}
