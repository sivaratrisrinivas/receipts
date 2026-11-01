// Selection: which Snippets Beam reads, and how many Lines it is asked for.
//
// Beam reads a Conversation in one call, so the Snippets sent must fit the input budget
// (whole days are dropped, evenly) and there must be enough of them to make a Poem
// (otherwise there is no Beam call at all). Pure functions over Snippets; no I/O.

import type { IsoDate, Snippet } from './domain';

// --- Token estimate ----------------------------------------------------------------------

/** The input-token budget for one Beam call. Beam's window is 1M; this leaves room for its answer and for a wrong estimate. */
export const INPUT_TOKEN_BUDGET = 800_000;

/**
 * Characters per token for ASCII text. Calibrated on the real Gallery: its prompt of
 * 1,245,565 characters was billed as 352,297 prompt tokens (3.54 characters per token, in
 * the live runs behind the eval). Assuming 3 over-counts the Gallery by about 18%, so the
 * budget errs towards dropping a few more days rather than overflowing Beam's window.
 */
const ASCII_CHARS_PER_TOKEN = 3;

/**
 * Anything outside ASCII (accents, Devanagari, CJK, emoji) is counted at one token per
 * UTF-16 code unit, the worst case that is still realistic: scripts that tokenise poorly
 * cost about one token a character, and an emoji (two code units) one to three tokens.
 */
const NON_ASCII_TOKENS_PER_UNIT = 1;

/** Unrounded, so that many small strings can be added up before rounding once. */
function weigh(text: string): number {
  let ascii = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 128) ascii++;
  return ascii / ASCII_CHARS_PER_TOKEN + (text.length - ascii) * NON_ASCII_TOKENS_PER_UNIT;
}

/** A conservative estimate of how many tokens Beam will count in this text. */
export function estimateTokens(text: string): number {
  return Math.ceil(weigh(text));
}

/** The instructions and the lines around the Conversation in the prompt (about 1.5k characters), rounded well up. */
const PROMPT_OVERHEAD_TOKENS = 2_000;

/** A Message's header row in the prompt, `## <initial> c.<date>`, at its longest. */
const HEADER_WEIGHT = weigh('## X c.1845-01-10\n');

/** What a Snippet costs as a prompt row, `<id> <text>`. */
function rowWeight(snippet: Snippet): number {
  return weigh(`${snippet.id} ${snippet.text}\n`);
}

// --- Size table --------------------------------------------------------------------------

/** How many Lines a Poem is asked to have. */
export interface LineRange {
  min: number;
  max: number;
}

/**
 * The size table: the fewest usable Snippets that earn each Line range, largest first.
 * Below the last row there is no Poem.
 */
const SIZE_TABLE: readonly { minSnippets: number; lines: LineRange }[] = [
  { minSnippets: 40, lines: { min: 8, max: 14 } },
  { minSnippets: 15, lines: { min: 6, max: 8 } },
];

/** The Line range of a Conversation with plenty to draw on. */
export const FULL_SIZE_LINES: LineRange = SIZE_TABLE[0]!.lines;

/** The fewest usable Snippets a Poem can be made from. */
export const MIN_USABLE_SNIPPETS = SIZE_TABLE[SIZE_TABLE.length - 1]!.minSnippets;

/** The Line range for this many usable Snippets, or null when there are too few for a Poem. */
export function lineRangeFor(usableSnippets: number): LineRange | null {
  return SIZE_TABLE.find((row) => usableSnippets >= row.minSnippets)?.lines ?? null;
}

// --- Selecting ---------------------------------------------------------------------------

/** How much of the timeline Beam read. */
export interface ReadFraction {
  /** Days that have at least one Snippet. */
  totalDays: number;
  /** Days Beam was shown. */
  readDays: number;
  /** Beam read every `stride`th day; 1 means every day (nothing was dropped). */
  stride: number;
  /** The first and last day with a Snippet, which is the stretch of time the Conversation covers. */
  firstDate: IsoDate;
  lastDate: IsoDate;
}

export type Selection =
  | {
      kind: 'selected';
      /** What Beam is sent: whole days only, in Conversation order. */
      snippets: Snippet[];
      lineRange: LineRange;
      readFraction: ReadFraction;
    }
  | {
      kind: 'not-enough';
      /** How many Snippets Beam could have been sent. */
      usableSnippets: number;
      needed: number;
    };

/**
 * Pick what Beam reads from the usable Snippets.
 *
 * If they do not fit {@link INPUT_TOKEN_BUDGET}, whole days are dropped, evenly: Beam reads
 * every 2nd day, or every 3rd, with the smallest stride that fits, so the early years count
 * as much as the late ones. The stretch that is left over at each end is split evenly
 * between the two. Then the size table turns what is left into a Line range, or into a
 * refusal when there is too little for a Poem.
 */
export function selectSnippets(snippets: Snippet[]): Selection {
  const days = groupByDay(snippets);
  const budget = INPUT_TOKEN_BUDGET - PROMPT_OVERHEAD_TOKENS;

  // A null stride means not even one day fits: nothing can be read.
  const stride = smallestStrideThatFits(days.map((day) => day.weight), budget);
  const read = stride === null ? [] : days.filter((_, i) => isRead(i, days.length, stride));
  const readSnippets = read.flatMap((day) => day.snippets);

  const lineRange = lineRangeFor(readSnippets.length);
  if (stride === null || lineRange === null) {
    return { kind: 'not-enough', usableSnippets: readSnippets.length, needed: MIN_USABLE_SNIPPETS };
  }
  return {
    kind: 'selected',
    snippets: readSnippets,
    lineRange,
    readFraction: {
      totalDays: days.length,
      readDays: read.length,
      stride,
      firstDate: days[0]!.date,
      lastDate: days[days.length - 1]!.date,
    },
  };
}

interface Day {
  date: IsoDate;
  snippets: Snippet[];
  /** What the day costs in the prompt: its rows and one header per Message. */
  weight: number;
}

/** Snippets arrive in Conversation order, where dates never decrease. */
function groupByDay(snippets: Snippet[]): Day[] {
  const days: Day[] = [];
  let lastMessage = -1;
  for (const snippet of snippets) {
    let day = days[days.length - 1];
    if (day === undefined || day.date !== snippet.date) {
      day = { date: snippet.date, snippets: [], weight: 0 };
      days.push(day);
    }
    day.snippets.push(snippet);
    day.weight += rowWeight(snippet) + (snippet.messageOrdinal === lastMessage ? 0 : HEADER_WEIGHT);
    lastMessage = snippet.messageOrdinal;
  }
  return days;
}

/** Day `index` of `count` is read when reading every `stride`th day, centred on the timeline. */
function isRead(index: number, count: number, stride: number): boolean {
  const offset = Math.floor(((count - 1) % stride) / 2);
  return index % stride === offset;
}

/** The smallest stride (1 reads every day) whose days weigh no more than the budget, or null if even one day is too heavy. */
function smallestStrideThatFits(weights: number[], budget: number): number | null {
  const count = weights.length;
  for (let stride = 1; stride <= count; stride++) {
    let total = 0;
    for (let i = Math.floor(((count - 1) % stride) / 2); i < count; i += stride) total += weights[i]!;
    if (total <= budget) return stride;
  }
  return null;
}
