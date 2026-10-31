// Snippets: turn the Messages of a Conversation into the verbatim pieces a Poem is
// built from.

import type { Conversation, Snippet } from './domain';

const MAX_WORDS = 40;
const MIN_WORDS = 3;

export function snippetsOf(conversation: Conversation): Snippet[] {
  const snippets: Snippet[] = [];
  for (const message of conversation.messages) {
    const text = message.text.replace(/\s+/g, ' ').trim();
    const sentences = text.match(/[^.!?]+(?:[.!?]+['"’”)]*|$)/g) ?? [];
    for (const sentence of sentences) {
      const clean = sentence.trim();
      const words = clean.split(/\s+/).length;
      if (words < MIN_WORDS || words > MAX_WORDS) continue;
      const index = snippets.length;
      snippets.push({
        id: `s${index}`,
        index,
        messageOrdinal: message.ordinal,
        sender: message.sender,
        date: message.date,
        approximate: message.approximate,
        text: clean,
      });
    }
  }
  return snippets;
}
