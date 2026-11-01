// What the Giver is told about their chat before it is sent, worked out the way the Poem
// pipeline will work it out: the same restriction to two people, the same redaction, the
// same Snippets and the same input budget. So the count on the review step is the number
// of Messages in the prompt, not the number in the file.

import type { Sender } from '../domain';
import { redactConversation } from '../redaction';
import { fitToBudget } from '../selection';
import { between } from '../sources/between';
import { toConversation, type WhatsAppExport } from '../sources/whatsapp';
import { snippetsOf } from '../snippets';

/** What the review step shows about a chat once the Giver and Recipient are chosen. */
export interface ChatReading {
  /** Messages from the two people that will be sent to Beam. */
  sent: number;
  /** Messages from the two people that are not sent, because they have no words to read (links, emoji, one-word replies). */
  leftOut: number;
  /**
   * The share, 0 to 1, of the letters being sent that are outside the Latin script (Telugu script, say).
   * Telugu in English letters is Latin, and counts as such.
   */
  nonLatinShare: number;
}

export function readChat(exported: WhatsAppExport, giver: Sender, recipient: Sender): ChatReading {
  // The date order only moves dates; it changes neither the Messages nor the Snippets.
  const conversation = redactConversation(between(toConversation(exported, 'day-first'), giver, recipient));
  const snippets = snippetsOf(conversation);
  const sent = fitToBudget(snippets)?.snippets ?? [];
  const messagesWithSnippets = new Set(snippets.map((snippet) => snippet.messageOrdinal)).size;

  let letters = 0;
  let nonLatin = 0;
  for (const { text } of sent) {
    for (const char of text) {
      if (!/\p{L}/u.test(char)) continue;
      letters++;
      if (!/\p{Script=Latin}/u.test(char)) nonLatin++;
    }
  }
  return {
    sent: new Set(sent.map((snippet) => snippet.messageOrdinal)).size,
    leftOut: conversation.messages.length - messagesWithSnippets,
    nonLatinShare: letters === 0 ? 0 : nonLatin / letters,
  };
}
