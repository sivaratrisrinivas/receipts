// A Poem is made from two voices only. Everyone else in the Conversation (the rest of a
// family group, say) is removed here, before anything is redacted, turned into Snippets
// or put in a prompt.

import type { Conversation, Sender } from '../domain';
import { ExportError } from './whatsapp';

/**
 * The Messages sent by `giver` or `recipient`, renumbered so ordinals still run 0, 1, 2, ...
 * Someone who never wrote simply leaves less to read; with too little there is no Poem.
 */
export function between(conversation: Conversation, giver: Sender, recipient: Sender): Conversation {
  if (giver === recipient) throw new ExportError('A Poem needs two different people: the Giver and the Recipient.');
  const messages = conversation.messages
    .filter((message) => message.sender === giver || message.sender === recipient)
    .map((message, ordinal) => ({ ...message, ordinal }));
  return {
    kind: conversation.kind,
    senders: conversation.senders.filter((sender) => sender === giver || sender === recipient),
    messages,
  };
}
