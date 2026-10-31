// Prompt: render a Conversation compactly and tell Beam what to choose.
//
// The Conversation is grouped under one header per Message (`## <sender initial> <date>`)
// followed by one `<id> <text>` row per Snippet. Grouping the headers cut the Gallery
// from 776k to 513k tokens in the prototype.

import type { Conversation, Occasion, Sender, Snippet } from './domain';
import type { BeamRequest, ResponseFormat } from './beam/port';

export interface PromptInput {
  conversation: Conversation;
  snippets: Snippet[];
  occasion: Occasion;
  giver: Sender;
  recipient: Sender;
  /** The Giver's optional context, e.g. "she just retired". */
  note?: string | undefined;
}

/** What Beam must return: Snippet IDs with a private Note each, never any Poem text. */
export const POEM_RESPONSE_FORMAT: ResponseFormat = {
  name: 'poem',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['lines'],
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'note', 'callbacks'],
          properties: {
            id: { type: 'string' },
            note: { type: 'string' },
            callbacks: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
};

export function buildPrompt(input: PromptInput): BeamRequest {
  return {
    system: instructions(input),
    user: `CONVERSATION (each Message starts with "## sender date"; then one Snippet per row: id text)\n${render(input)}`,
    responseFormat: POEM_RESPONSE_FORMAT,
  };
}

function initial(sender: Sender): string {
  return sender.charAt(0).toUpperCase();
}

function render({ snippets }: PromptInput): string {
  const rows: string[] = [];
  let currentMessage = -1;
  for (const snippet of snippets) {
    if (snippet.messageOrdinal !== currentMessage) {
      currentMessage = snippet.messageOrdinal;
      rows.push(`## ${initial(snippet.sender)} ${snippet.approximate ? 'c.' : ''}${snippet.date}`);
    }
    rows.push(`${snippet.id} ${snippet.text}`);
  }
  return rows.join('\n');
}

function instructions({ conversation, occasion, giver, recipient, note }: PromptInput): string {
  const people = conversation.senders.map((sender) => `${sender} (${initial(sender)})`).join(' and ');
  return [
    `You make a Poem for a Giver to give a Recipient, using ONLY real Snippets from their Conversation. You never write poem text yourself: you choose Snippet IDs.`,
    `The Conversation is between ${people}. The Giver is ${giver}; the Recipient is ${recipient}. Occasion: ${occasion}.${note ? ` Context from the Giver: ${note}` : ''}`,
    `Choose 8 to 14 Snippets.`,
  ].join('\n');
}
