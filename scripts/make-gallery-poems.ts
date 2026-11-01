// Make the Gallery Poems live, through the real Beam adapter, and save their picks.
//
//   npm run gallery:poems                                # the Occasions that have no Poem yet
//   npm run gallery:poems -- --occasions sorry,farewell  # just these (redoing them if they have a Poem)
//   npm run gallery:poems -- --all                       # redo every Occasion
//   npm run gallery:poems -- --dry                       # no network, no token: size up the run only
//   npm run gallery:poems -- --max-attempts 2 --already-spent 0.80
//       # for a run that carries on from an earlier one: fewer attempts, and less of the budget left
//   npm run gallery:poems -- --quarters-by-id     # name the prompt's quarters by Snippet ID, not date (see below)
//   npm run gallery:poems -- --without-quarters   # swap the prompt's quarters for a plain "spread them out" (see below)
//
// Each call costs $0.14 to $0.29 of Hugging Face credits. A Poem is kept only if every pick
// verifies against the Gallery and it has Lines from every quarter of the timeline and
// from both Senders; Beam is tried at most 3 times per Occasion, and the run stops for
// good once the estimated spend could pass $3. Poems are saved as they are accepted, so
// an interrupted run loses nothing already paid for. The saved file records how each Poem
// was made.
//
// What the first live runs found (issue #8): with the app's prompt, which
// spells the four quarters out by date, Beam reasoned until it ran out of completion budget
// without ever answering, every time: 3 of 3 at the app's 60,000 tokens, then 3 of 3 at
// 120,000 (the limit used here, double the app's; a call that hits it costs about $0.285, so
// a call that failed without reporting its tokens is charged $0.29). The two flags change
// only the prompt's one sentence about the quarters, and the quarter rule above still decides
// what is kept, so it is not loosened:
//   --quarters-by-id    "Q1 s0 to s767; Q2 ..." in place of dates. Beam answered in 17 seconds
//                       and 2,000 tokens ($0.14), once; the one other try ran to the limit.
//   --without-quarters  "some from the first months, some from the middle, some from the last".
//                       Quick and cheap ($0.15), but 3 of 4 tries missed the last quarter or more,
//                       and the other ran to the limit.
//
// The token is read from the Hugging Face cache (~/.cache/huggingface/token). It goes
// only into the Authorization header of the requests; this script never prints it.

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  GALLERY_TEXT_PATHS,
  OCCASIONS,
  createFakeBeam,
  createHfBeam,
  readConversation,
  snippetsOf,
  type BeamPort,
  type Occasion,
} from '../src';
import { quarterBoundaries, quarterOf } from '../src/quarters';
import { DEFAULT_BUDGET, MAX_ATTEMPTS_PER_OCCASION, generateGalleryPicks, type Budget } from '../src/gallery-poems/generate';
import { fingerprintOf, type GalleryPicks } from '../src/gallery-poems/picks';

const PICKS_FILE = new URL('../src/gallery-poems/picks.json', import.meta.url);
/** A call that has not finished in this long is abandoned (and counts as a failed attempt). */
const CALL_TIMEOUT_MS = 8 * 60_000;

const MAX_COMPLETION_TOKENS = 120_000;
/** What a call is charged when it fails without reporting its tokens: about 356k tokens in, 120k out. */
const FAILED_CALL_USD = 0.29;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const redoAll = args.includes('--all');
const valueOf = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

const only = valueOf('--occasions')
  ?.split(',')
  .map((name) => name.trim());
const unknown = only?.filter((name) => !OCCASIONS.includes(name as Occasion));
if (unknown && unknown.length > 0) {
  console.error(`Unknown occasion "${unknown[0]}". Choose from: ${OCCASIONS.join(', ')}.`);
  process.exit(2);
}
const withoutQuarters = args.includes('--without-quarters');
const quartersById = args.includes('--quarters-by-id');
if (withoutQuarters && quartersById) {
  console.error('Choose --without-quarters or --quarters-by-id, not both.');
  process.exit(2);
}
const maxAttempts = Number(valueOf('--max-attempts') ?? MAX_ATTEMPTS_PER_OCCASION);
const alreadySpentUsd = Number(valueOf('--already-spent') ?? 0);
if (!(maxAttempts >= 1 && maxAttempts <= MAX_ATTEMPTS_PER_OCCASION) || !(alreadySpentUsd >= 0)) {
  console.error(`--max-attempts must be 1 to ${MAX_ATTEMPTS_PER_OCCASION}, and --already-spent a dollar amount.`);
  process.exit(2);
}
const madeWith = `reflection/Beam-1.0-501B-A23B, reasoning low, up to ${MAX_COMPLETION_TOKENS} completion tokens, ${withoutQuarters ? 'the live prompt with its quarter-by-date sentence replaced by a plain "first, middle and last months" one' : quartersById ? 'the live prompt with its quarters given as Snippet ID ranges instead of dates' : 'the live prompt'}`;
const budget: Budget = { limitUsd: DEFAULT_BUDGET.limitUsd - alreadySpentUsd, perCallUsd: FAILED_CALL_USD };

const texts = GALLERY_TEXT_PATHS.map((path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8'));
const conversation = readConversation({ kind: 'gallery', texts });
const snippets = snippetsOf(conversation);
const gallery = fingerprintOf(snippets);

// What is saved already. Picks made against other Gallery text are stale: their IDs point elsewhere.
function loadSaved(): GalleryPicks {
  try {
    const saved = JSON.parse(readFileSync(PICKS_FILE, 'utf8')) as GalleryPicks;
    if (saved.gallery.snippets === gallery.snippets && saved.gallery.hash === gallery.hash) return saved;
    console.log('The saved picks were made against different Gallery text, so they are being replaced.');
  } catch {
    // Nothing saved yet.
  }
  return { gallery, poems: {} };
}

/** One pick to a line, so the file diffs and reads well. */
function format({ gallery: { snippets, hash }, poems, madeWith = {} }: GalleryPicks): string {
  const made = OCCASIONS.filter((occasion) => madeWith[occasion]).map((occasion) => `    ${JSON.stringify(occasion)}: ${JSON.stringify(madeWith[occasion])}`);
  const occasions = OCCASIONS.filter((occasion) => poems[occasion]).map((occasion) => {
    const picks = poems[occasion]!.map((pick) => `      ${JSON.stringify(pick)}`).join(',\n');
    return `    ${JSON.stringify(occasion)}: [\n${picks}\n    ]`;
  });
  return `{\n  "gallery": { "snippets": ${snippets}, "hash": ${JSON.stringify(hash)} },\n  "poems": {\n${occasions.join(',\n')}\n  },\n  "madeWith": {\n${made.join(',\n')}\n  }\n}\n`;
}

const saved = loadSaved();
const missing = OCCASIONS.filter((occasion) => (only !== undefined ? only.includes(occasion) : redoAll || !saved.poems[occasion]));
// A dry run makes one pretend call, just to size the prompt.
const wanted = dry ? missing.slice(0, 1) : missing;
if (missing.length === 0) {
  console.log('Every Occasion already has a Gallery Poem. Use --all or --occasion <name> to redo.');
  process.exit(0);
}

function realBeam(): BeamPort {
  let token: string;
  try {
    token = readFileSync(join(homedir(), '.cache', 'huggingface', 'token'), 'utf8').trim();
  } catch {
    console.error('No Hugging Face token found at ~/.cache/huggingface/token.');
    process.exit(2);
  }
  return createHfBeam({
    token,
    maxCompletionTokens: MAX_COMPLETION_TOKENS,
    fetch: async (input, init) => {
      const began = Date.now();
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
      void traceStream(response.clone(), began);
      return response;
    },
  });
}

/**
 * Says how a call's stream ended (finish reason, tokens, whether it was cut off), so that a
 * call that comes back empty can be told apart from one that ran out of room. Reads a copy of
 * the response, and prints only counts and the finish reason: never headers, never the token.
 */
async function traceStream(response: Response, began: number): Promise<void> {
  const seen = { status: response.status, reasoningChunks: 0, contentChars: 0, finishReason: null as string | null, usage: '', done: false, lastChunkAt: began };
  try {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    for (;;) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      seen.lastChunkAt = Date.now();
      pending += decoder.decode(chunk.value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') seen.done = true;
        try {
          const event = JSON.parse(data) as {
            choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null }; finish_reason?: string | null }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const choice = event.choices?.[0];
          if (choice?.delta?.reasoning_content || choice?.delta?.reasoning) seen.reasoningChunks++;
          seen.contentChars += choice?.delta?.content?.length ?? 0;
          if (choice?.finish_reason) seen.finishReason = choice.finish_reason;
          if (event.usage) seen.usage = `${event.usage.prompt_tokens} in / ${event.usage.completion_tokens} out`;
        } catch {
          // Not JSON (a keep-alive); ignore.
        }
      }
    }
    console.log(`    [trace] HTTP ${seen.status}; stream ended after ${Math.round((seen.lastChunkAt - began) / 1000)}s; ${seen.reasoningChunks} reasoning chunks, ${seen.contentChars} answer characters; finish_reason ${seen.finishReason}; usage ${seen.usage || 'none'}; [DONE] ${seen.done ? 'seen' : 'not seen'}`);
  } catch (error) {
    console.log(`    [trace] stream error after ${Math.round((Date.now() - began) / 1000)}s: ${error instanceof Error ? error.name : 'unknown'}; ${seen.reasoningChunks} reasoning chunks, ${seen.contentChars} answer characters so far`);
  }
}

/** The prompt's sentence that spells out the quarters, and what stands in for it with `--without-quarters`. */
const QUARTER_SENTENCE = /^Spread your picks across the whole timeline:.*$/m;
const SPREAD_SENTENCE =
  'Spread your picks across the whole timeline: take some from the first months, some from the middle and some from the last months.';
function withoutQuarterDates(beam: BeamPort): BeamPort {
  return {
    complete(request, onProgress) {
      if (!QUARTER_SENTENCE.test(request.system)) throw new Error('The prompt no longer has the quarter sentence this script replaces.');
      const system = request.system.replace(QUARTER_SENTENCE, SPREAD_SENTENCE);
      return beam.complete({ ...request, system }, onProgress);
    },
  };
}

const base: BeamPort = dry
  ? createFakeBeam((request) => {
      const quarters = /^Spread your picks.*$/m.exec(request.system)?.[0] ?? '(no spread sentence)';
      console.log(`[dry run] ${request.system.length + request.user.length} characters of prompt (about ${Math.round((request.system.length + request.user.length) / 3.5)} tokens)`);
      console.log(`[dry run] the spread sentence reads: ${quarters.slice(0, 160)}`);
      return { picks: [{ id: /^(s\d+) /m.exec(request.user)?.[1] ?? 's0', note: 'dry run' }] };
    })
  : realBeam();

/**
 * The same four quarters, but named by the Snippet IDs that fall in them (Snippets run in
 * date order, so each quarter is a stretch of IDs), so that Beam need not look dates up.
 */
function quartersByIds(beam: BeamPort): BeamPort {
  const bounds = quarterBoundaries(conversation);
  const ranges = [0, 1, 2, 3].map((quarter) => {
    const inQuarter = snippets.filter((snippet) => quarterOf(bounds, snippet.date) === quarter);
    return `Q${quarter + 1} ${inQuarter[0]!.id} to ${inQuarter[inQuarter.length - 1]!.id}`;
  });
  const sentence = `Spread your picks across the whole timeline: choose at least one Line from each quarter of it. By Snippet ID the quarters are: ${ranges.join('; ')}.`;
  return {
    complete(request, onProgress) {
      if (!QUARTER_SENTENCE.test(request.system)) throw new Error('The prompt no longer has the quarter sentence this script replaces.');
      return beam.complete({ ...request, system: request.system.replace(QUARTER_SENTENCE, sentence) }, onProgress);
    },
  };
}

const beam: BeamPort = withoutQuarters ? withoutQuarterDates(base) : quartersById ? quartersByIds(base) : base;

console.log(
  `${gallery.snippets} Snippets. Making: ${wanted.join(', ')}. At most ${dry ? 1 : maxAttempts} attempts each; $${budget.limitUsd.toFixed(2)} of the $${DEFAULT_BUDGET.limitUsd.toFixed(2)} budget left (a failed call counts as $${budget.perCallUsd.toFixed(2)}).${dry ? ' (dry run)' : ''}`,
);

const poems = { ...saved.poems };
const howMade = { ...saved.madeWith };
let started = Date.now();
const report = await generateGalleryPicks({
  texts,
  beam,
  occasions: wanted,
  maxAttempts: dry ? 1 : maxAttempts,
  budget,
  onAttempt(occasion, number, attempt, spentUsd) {
    const seconds = Math.round((Date.now() - started) / 1000);
    started = Date.now();
    console.log(`${occasion} #${number}: ${attempt.outcome} in ${seconds}s, about $${attempt.costUsd.toFixed(3)} (total $${spentUsd.toFixed(3)})`);
    for (const problem of attempt.problems) console.log(`    - ${problem}`);
    if (attempt.outcome === 'accepted' && attempt.picks && !dry) {
      poems[occasion] = attempt.picks;
      howMade[occasion] = madeWith;
      writeFileSync(PICKS_FILE, format({ gallery, poems, madeWith: howMade }));
      console.log(`    saved ${attempt.picks.length} picks`);
    }
  },
});

console.log('\nSummary');
for (const { occasion, accepted, attempts } of report.occasions) {
  const verdict = accepted ? 'accepted' : attempts.length === 0 ? 'not attempted' : 'NOT ACCEPTED';
  console.log(`  ${occasion.padEnd(12)} ${verdict.padEnd(14)} ${attempts.length} attempt${attempts.length === 1 ? '' : 's'}`);
}
console.log(`Estimated spend: $${report.spentUsd.toFixed(3)}`);
if (report.stopped) console.log(report.stopped);
if (report.occasions.some((occasion) => !occasion.accepted)) process.exit(1);
