// Snippets: turn the Messages of a Conversation into the verbatim pieces a Poem is
// built from.
//
// A Message of 40 words or fewer is one Snippet. Longer Messages are split into
// sentences (abbreviation-aware, never across paragraphs). Snippets under 3 words or
// over 40 are dropped. For letters only, a Snippet must also start with a capital letter
// or a quote and end with terminal punctuation: people write chats in lower case, with
// no full stops, one thought to a line, so there a line break ends a thought and a
// full stop ends a sentence whatever comes next.

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
  const letters = kind === 'letters';
  // A letter is paragraphs; a chat Message is lines, and each line is a thought of its own.
  const paragraphs = message.text
    .split(letters ? /\n[ \t]*\n/ : /\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph !== '');

  const whole = paragraphs.join(' ');
  const candidates = wordCount(whole) <= MAX_WORDS ? [whole] : paragraphs.flatMap((paragraph) => splitSentences(paragraph, letters));

  return candidates.filter((candidate) => {
    const words = wordCount(candidate);
    if (words < MIN_WORDS || words > MAX_WORDS) return false;
    return !letters || (startsLikeASentence(candidate) && endsLikeASentence(candidate));
  });
}

/** Sentences of one paragraph. A letter's sentence ends before a capital; a chat's ends wherever a full stop does. */
function splitSentences(paragraph: string, capitalsMatter: boolean): string[] {
  const tokens = paragraph.split(' ');
  const sentences: string[] = [];
  let current: string[] = [];
  tokens.forEach((token, i) => {
    current.push(token);
    const next = tokens[i + 1];
    if (endsLikeASentence(token) && (next === undefined || startsNextSentence(token, next, capitalsMatter))) {
      sentences.push(current.join(' '));
      current = [];
    }
  });
  if (current.length > 0) sentences.push(current.join(' '));
  return sentences;
}

function startsNextSentence(token: string, next: string, capitalsMatter: boolean): boolean {
  if (capitalsMatter) return startsLikeASentence(next);
  // "wait... what do you mean" is one thought; an ellipsis only ends one before a capital.
  return !(/(?:\.\.\.|…)["'’”)\]]*$/.test(token) && /^\p{Ll}/u.test(next));
}

function startsLikeASentence(text: string): boolean {
  return /^(?:["'‘“]|\p{Lu})/u.test(text);
}

/** Terminal punctuation on the last word, unless that word is an abbreviation or initials. */
function endsLikeASentence(text: string): boolean {
  const lastWord = text.slice(text.lastIndexOf(' ') + 1).replace(/["'’”)\]]+$/, '');
  if (!/[.!?…]$/.test(lastWord)) return false;
  if (!lastWord.endsWith('.')) return true;
  // The abbreviation itself, even when glued to a quote, bracket or dash: `('Mr.`, `Torquay--Dr.`.
  const abbreviation = /(?:\p{L}+\.)*\p{L}+$/u.exec(lastWord.slice(0, -1))?.[0] ?? '';
  return !(ABBREVIATIONS.has(abbreviation.toLowerCase()) || INITIALS.test(abbreviation));
}

function wordCount(text: string): number {
  return text === '' ? 0 : text.split(/\s+/).length;
}
