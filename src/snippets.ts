// Snippets: turn the Messages of a Conversation into the verbatim pieces a Poem is
// built from.
//
// A Message of 40 words or fewer is one Snippet. Longer Messages are split into
// sentences (abbreviation-aware, never across paragraphs). Snippets under 3 words or
// over 40 are dropped. For letters, a Snippet must also start with a capital letter or
// a quote and end with terminal punctuation.

import type { Conversation, Message, Snippet } from './domain';

const MAX_WORDS = 40;
const MIN_WORDS = 3;

/** Tokens that end in a full stop without ending a sentence, lower-cased and without the stop. */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'messrs', 'mme', 'mlle', 'dr', 'prof', 'rev', 'hon', 'esq', 'sr', 'jr',
  'st', 'mt', 'capt', 'col', 'gen', 'lt', 'sgt', 'gov', 'co', 'ltd', 'bros',
  'vol', 'vols', 'no', 'nos', 'p', 'pp', 'ch', 'cf', 'viz', 'i.e', 'e.g',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

/** One to four initials, such as `R.` or `E.B.B.`. */
const INITIALS = /^(?:\p{Lu}\.){0,3}\p{Lu}$/u;

export function snippetsOf(conversation: Conversation): Snippet[] {
  const snippets: Snippet[] = [];
  for (const message of conversation.messages) {
    for (const text of snippetTexts(message, conversation.kind)) {
      const index = snippets.length;
      snippets.push({
        id: `s${index}`,
        index,
        messageOrdinal: message.ordinal,
        sender: message.sender,
        date: message.date,
        approximate: message.approximate,
        text,
      });
    }
  }
  return snippets;
}

function snippetTexts(message: Message, kind: Conversation['kind']): string[] {
  const paragraphs = message.text
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph !== '');

  const whole = paragraphs.join(' ');
  const candidates = wordCount(whole) <= MAX_WORDS ? [whole] : paragraphs.flatMap(splitSentences);

  return candidates.filter((candidate) => {
    const words = wordCount(candidate);
    if (words < MIN_WORDS || words > MAX_WORDS) return false;
    return kind !== 'letters' || (startsLikeASentence(candidate) && endsLikeASentence(candidate));
  });
}

function splitSentences(paragraph: string): string[] {
  const tokens = paragraph.split(' ');
  const sentences: string[] = [];
  let current: string[] = [];
  tokens.forEach((token, i) => {
    current.push(token);
    const next = tokens[i + 1];
    if (endsLikeASentence(token) && (next === undefined || startsLikeASentence(next))) {
      sentences.push(current.join(' '));
      current = [];
    }
  });
  if (current.length > 0) sentences.push(current.join(' '));
  return sentences;
}

function startsLikeASentence(text: string): boolean {
  return /^(?:["'‘“]|\p{Lu})/u.test(text);
}

/** Terminal punctuation on the last word, unless that word is an abbreviation or initials. */
function endsLikeASentence(text: string): boolean {
  const lastWord = text.slice(text.lastIndexOf(' ') + 1).replace(/["'’”)\]]+$/, '');
  if (!/[.!?…]$/.test(lastWord)) return false;
  if (!lastWord.endsWith('.')) return true;
  const bare = lastWord.slice(0, -1);
  return !(ABBREVIATIONS.has(bare.toLowerCase()) || INITIALS.test(bare));
}

function wordCount(text: string): number {
  return text === '' ? 0 : text.split(/\s+/).length;
}
