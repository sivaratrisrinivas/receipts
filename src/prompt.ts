// Prompt: render a Conversation compactly and tell Beam what to choose.
//
// The Conversation is grouped under one header per Message (`## <sender initial> <date>`)
// followed by one `<id> <text>` row per Snippet. Grouping the headers cut the Gallery
// from 776k to 513k tokens in the prototype.
//
// Three things here exist to keep Beam inside its 60,000-token completion budget on a long
// Conversation (issue #1). Run on the Gallery's 12,513 Snippets with the quarters given as date
// ranges in the instructions, Beam often spent the whole budget "reading": its reasoning turned
// into an in-order index of the Snippets (`s3173 R "..."`, `s3174 R "..."`, ...) that was only
// about 40% of the way through when the budget ran out. Nothing in those runs was stuck on the
// quarters (they came up about ten times in 150,000 characters of reasoning).
//   - The quarters are marked in the Conversation itself, by lines the code inserts, so that Beam
//     can see which quarter a Snippet is in without comparing dates.
//   - "Start to end" and "keep a shortlist as you read" are gone, since both invite that index;
//     Beam is given a reasoning format that is cheap to finish instead: a line of candidate IDs
//     per quarter.
//   - The ask is repeated after the Conversation, where Beam reads it last.

import type { Conversation, IsoDate, Occasion, Sender, Snippet } from './domain';
import type { BeamRequest, ResponseFormat } from './beam/port';
import { quarterBoundaries, quarterOf } from './quarters';
import { redactText } from './redaction';
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
    user: [
      `CONVERSATION (each Message starts with "## sender date"; then one Snippet per row: id text; a line starting "===" is a marker, not a Snippet)`,
      render(input),
      `${END_MARKER}\n${closingAsk(input)}`,
    ].join('\n'),
    responseFormat: POEM_RESPONSE_FORMAT,
  };
}

/**
 * A short label for each Sender in the Message headers: their initial, or `S1`/`S2` when
 * two initials are the same, or `#2` for a name that is not a word (a bare phone number).
 */
export function senderLabels(senders: readonly Sender[]): (sender: Sender) => string {
  const initials = senders.map((sender) => redactText(sender).charAt(0).toUpperCase());
  const labels = new Map(
    senders.map((sender, i) => {
      const initial = initials[i]!;
      if (!/^\p{L}$/u.test(initial)) return [sender, `#${i + 1}`];
      return [sender, initials.filter((other) => other === initial).length > 1 ? `${initial}${i + 1}` : initial];
    }),
  );
  return (sender) => labels.get(sender) ?? '?';
}

function render({ conversation, snippets }: PromptInput): string {
  return renderSnippets(snippets, senderLabels(conversation.senders), quarterBoundaries(conversation));
}

/**
 * Snippets in the compact prompt layout: a `## <label> <date>` header per Message, then `<id> <text>` rows.
 * With the timeline's quarter boundaries (from {@link quarterBoundaries}), a marker line opens each quarter
 * that has Snippets, just before its first Message.
 */
export function renderSnippets(
  snippets: readonly Snippet[],
  label: (sender: Sender) => string,
  quarters: readonly IsoDate[] = [],
): string {
  const rows: string[] = [];
  let currentMessage = -1;
  let currentQuarter = -1;
  for (const snippet of snippets) {
    if (snippet.messageOrdinal !== currentMessage) {
      currentMessage = snippet.messageOrdinal;
      if (quarters.length > 0) {
        const quarter = quarterOf(quarters, snippet.date);
        if (quarter !== currentQuarter) {
          currentQuarter = quarter;
          rows.push(quarterMarker(quarters, quarter));
        }
      }
      rows.push(`## ${label(snippet.sender)} ${snippet.approximate ? 'c.' : ''}${snippet.date}`);
    }
    rows.push(`${snippet.id} ${snippet.text}`);
  }
  return rows.join('\n');
}

/** Every quarter marker line starts like this; no Message header (`## `) or Snippet row (`s12 `) does. */
export const QUARTER_MARKER_PREFIX = '=== QUARTER ';

function quarterMarker(boundaries: readonly IsoDate[], quarter: 0 | 1 | 2 | 3): string {
  return `${QUARTER_MARKER_PREFIX}${quarter + 1} of 4: ${boundaries[quarter]} to ${boundaries[quarter + 1]} ===`;
}

function instructions({ conversation, snippets, occasion, giver, recipient, note, lineRange = FULL_SIZE_LINES }: PromptInput): string {
  // Only a long Conversation needs telling not to go through it one Snippet at a time.
  const tooMany = snippets.length >= LONG_CONVERSATION_SNIPPETS ? ` The Conversation has ${snippets.length.toLocaleString('en-US')} Snippets, far too many to go through one by one, so do not list or summarise them as you read.` : '';
  return [
    `You make a Poem for a Giver to give a Recipient, using ONLY real Snippets from their Conversation. You never write Poem text yourself: you choose Snippet IDs.`,
    `The Conversation is between ${people(conversation)}. The Giver is ${redactText(giver)}; the Recipient is ${redactText(recipient)}. Occasion: ${occasion}.${note ? ` Context from the Giver: ${redactText(note)}` : ''}`,
    `Read the whole Conversation. Choose ${lineRange.min} to ${lineRange.max} Snippets that together tell the story of these two people over time: the early moments, the turns, the private jokes and callbacks, the moments only they would recognise. Prefer concrete, specific, vivid Snippets over generic sentiment. Each Snippet must stand on its own as a Line.`,
    `Spread your picks across the whole timeline: choose at least one Line from each quarter of it. The Conversation is divided into four quarters of equal time by marker lines (${QUARTER_MARKER_PREFIX}n of 4: first date to last date ===), each placed just before the first Message of that quarter; a Snippet belongs to the quarter whose marker most recently comes before it. A quarter with no Messages has no marker (skip it).`,
    `Include both Senders.`,
    `Avoid private matters such as money, health details, addresses and passwords.`,
    `Code will sort your picks by date, so choose Lines that read well in chronological order.`,
    `While reasoning, refer to Snippets by ID only; never copy, quote or describe their text.${tooMany} Think in one short line per quarter, naming 2 to 4 candidate IDs and nothing else, for example "${REASONING_EXAMPLE}". Then pick your ${lineRange.min} to ${lineRange.max} Lines from those candidates and answer.`,
    `For each pick give a one-line private Note to the Giver explaining why. A Note may only mention things actually in the Conversation. In "callbacks", cite the IDs of any callbacks to other moments the Note mentions (an empty list if none).`,
  ].join('\n');
}

/** What the prompt ends with: the ask again, after the Conversation, where Beam reads it last. */
function closingAsk({ conversation, lineRange = FULL_SIZE_LINES }: PromptInput): string {
  return `Now choose ${lineRange.min} to ${lineRange.max} Snippets by ID (never more than ${lineRange.max}): at least one Line after each of the quarter markers above, and Lines from both Senders (${people(conversation)}). Do not go through the Snippets one by one: reason in one short line per quarter ("${REASONING_EXAMPLE}"), then answer with the JSON only.`;
}

/** The Senders, each with the label their Message headers use. A name can itself be a phone number or email address; that must not reach Beam. */
function people(conversation: Conversation): string {
  const label = senderLabels(conversation.senders);
  return conversation.senders.map((sender) => `${redactText(sender)} (${label(sender)})`).join(' and ');
}

/** From this many Snippets, the prompt says outright that there are too many to go through one by one. */
const LONG_CONVERSATION_SNIPPETS = 1_000;

const END_MARKER = '=== END OF CONVERSATION ===';
const REASONING_EXAMPLE = 'Q1: s12 s40 s77';
