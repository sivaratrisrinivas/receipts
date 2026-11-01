// Prompt: render a Conversation compactly and tell Beam what to choose.
//
// The Conversation is grouped under one header per Message (`## <sender initial> <date>`)
// followed by one `<id> <text>` row per Snippet. Grouping the headers cut the Gallery
// from 776k to 513k tokens in the prototype.

import type { Conversation, Occasion, Sender, Snippet } from './domain';
import type { BeamRequest, ResponseFormat } from './beam/port';
import { FULL_SIZE_LINES, type LineRange } from './selection';

export interface PromptInput {
  conversation: Conversation;
  snippets: Snippet[];
  occasion: Occasion;
  giver: Sender;
  recipient: Sender;
  /** The Giver's optional context, e.g. "she just retired". */
  note?: string | undefined;
  /** How many Lines to ask for (from the size table in src/selection.ts); defaults to the full size. */
  lineRange?: LineRange | undefined;
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

export function initial(sender: Sender): string {
  return sender.charAt(0).toUpperCase();
}

function render({ snippets }: PromptInput): string {
  return renderSnippets(snippets);
}

/** Snippets in the compact prompt layout: a `## <initial> <date>` header per Message, then `<id> <text>` rows. */
export function renderSnippets(snippets: readonly Snippet[]): string {
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

function instructions({ conversation, occasion, giver, recipient, note, lineRange = FULL_SIZE_LINES }: PromptInput): string {
  const people = conversation.senders.map((sender) => `${sender} (${initial(sender)})`).join(' and ');
  return [
    `You make a Poem for a Giver to give a Recipient, using ONLY real Snippets from their Conversation. You never write Poem text yourself: you choose Snippet IDs.`,
    `The Conversation is between ${people}. The Giver is ${giver}; the Recipient is ${recipient}. Occasion: ${occasion}.${note ? ` Context from the Giver: ${note}` : ''}`,
    `Read the whole Conversation, start to end. Choose ${lineRange.min} to ${lineRange.max} Snippets that together tell the story of these two people over time: the early moments, the turns, the private jokes and callbacks, the moments only they would recognise. Prefer concrete, specific, vivid Snippets over generic sentiment. Each Snippet must stand on its own as a Line.`,
    `Spread your picks across the whole timeline: choose at least one Line from each quarter of it (skip any quarter with no Messages). The quarters, by date: ${timelineQuarters(conversation).join('; ')}.`,
    `Include both Senders.`,
    `Avoid private matters such as money, health details, addresses and passwords.`,
    `Code will sort your picks by date, so choose Lines that read well in chronological order.`,
    `While reasoning, refer to Snippets by ID only; never copy their text. Keep a short shortlist as you read, then finalise.`,
    `For each pick give a one-line private Note to the Giver explaining why. A Note may only mention things actually in the Conversation. In "callbacks", cite the IDs of any callbacks to other moments the Note mentions (an empty list if none).`,
  ].join('\n');
}

/** Four equal spans of the timeline by date, e.g. `Q1 1845-01-10 to 1845-06-04`. */
function timelineQuarters({ messages }: Conversation): string[] {
  const first = messages[0]?.date;
  const last = messages[messages.length - 1]?.date;
  if (first === undefined || last === undefined) return [];
  const start = Date.parse(`${first}T00:00:00Z`);
  const span = Date.parse(`${last}T00:00:00Z`) - start;
  const at = (quarter: number) => new Date(start + (span * quarter) / 4).toISOString().slice(0, 10);
  return [1, 2, 3, 4].map((q) => `Q${q} ${at(q - 1)} to ${at(q)}`);
}
