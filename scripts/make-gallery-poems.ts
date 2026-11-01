// Make the Gallery Poems live, through the real Beam adapter, and save their picks.
//
//   npm run gallery:poems                                # the Occasions that have no Poem yet
//   npm run gallery:poems -- --occasions sorry,farewell  # just these (redoing them if they have a Poem)
//   npm run gallery:poems -- --all                       # redo every Occasion
//   npm run gallery:poems -- --dry                       # no network, no token: size up the run only
//   npm run gallery:poems -- --budget 1.50 --max-attempts 2
//       # spend at most $1.50 on this run (the default is the $3 of src/gallery-poems/generate.ts),
//       # and try each Occasion at most twice
//
// The prompt is the app's own (src/prompt.ts), and the call is the app's own: the same Beam
// adapter at its defaults (reasoning effort low, 60,000 completion tokens, strict JSON schema),
// so a Poem saved here is a Poem the app can make. Nothing is changed to help a call finish.
//
// Each call costs $0.14 to $0.22 of Hugging Face credits. A Poem is kept only if every pick
// verifies against the Gallery and it has Lines from every quarter of the timeline and
// from both Senders; Beam is tried at most 3 times per Occasion, and the run stops for
// good once the estimated spend could pass the budget. Poems are saved as they are accepted,
// so an interrupted run loses nothing already paid for. The saved file records how each Poem
// was made.
//
// Why the prompt marks the quarters in the Conversation itself (issue #1): with the quarters
// given only as date ranges in the instructions, Beam ran out of its 60,000 completion tokens
// on most Gallery calls (see src/prompt.ts for what changed and the evidence).
//
// The token is read from the Hugging Face cache (~/.cache/huggingface/token). It goes
// only into the Authorization header of the requests; this script never prints it.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  GALLERY_TEXT_PATHS,
  OCCASIONS,
  createFakeBeam,
  createHfBeam,
  readConversation,
  snippetsOf,
  tokensCostUsd,
  type BeamPort,
  type Occasion,
} from '../src';
import { readHfToken } from '../eval/lib/token';
import { QUARTER_MARKER_PREFIX } from '../src/prompt';
import { DEFAULT_BUDGET, MAX_ATTEMPTS_PER_OCCASION, generateGalleryPicks, type Budget } from '../src/gallery-poems/generate';
import { fingerprintOf, type GalleryPicks } from '../src/gallery-poems/picks';

const PICKS_FILE = new URL('../src/gallery-poems/picks.json', import.meta.url);
/** A call that has not finished in this long is abandoned (and counts as a failed attempt). */
const CALL_TIMEOUT_MS = 8 * 60_000;

/** What the app asks of Beam (src/beam/hf.ts); the script does not set these, it checks the request that goes out carries them. */
const APP_MAX_COMPLETION_TOKENS = 60_000;
/** What a call is charged when it fails without reporting its tokens: the Gallery prompt (352k tokens) and a whole completion budget. */
const FAILED_CALL_USD = Number(tokensCostUsd(352_300, APP_MAX_COMPLETION_TOKENS).toFixed(3));

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
const maxAttempts = Number(valueOf('--max-attempts') ?? MAX_ATTEMPTS_PER_OCCASION);
const budgetUsd = Number(valueOf('--budget') ?? DEFAULT_BUDGET.limitUsd);
if (!(maxAttempts >= 1 && maxAttempts <= MAX_ATTEMPTS_PER_OCCASION) || !(budgetUsd > 0)) {
  console.error(`--max-attempts must be 1 to ${MAX_ATTEMPTS_PER_OCCASION}, and --budget a dollar amount.`);
  process.exit(2);
}
const madeWith = `reflection/Beam-1.0-501B-A23B, reasoning low, up to ${APP_MAX_COMPLETION_TOKENS} completion tokens, the app's prompt (src/prompt.ts)`;
const budget: Budget = { limitUsd: budgetUsd, perCallUsd: FAILED_CALL_USD };

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
    // Only the file `hf auth login` writes, never HF_TOKEN: these scripts spend real credits.
    token = readHfToken({ env: {} });
  } catch {
    console.error('No Hugging Face token found at ~/.cache/huggingface/token.');
    process.exit(2);
  }
  return createHfBeam({
    token,
    fetch: async (input, init) => {
      assertAppSettings(init?.body);
      const began = Date.now();
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
      void traceStream(response.clone(), began);
      return response;
    },
  });
}

/** The request about to go out must carry the app's settings, so a Poem saved here proves the app's call works. */
function assertAppSettings(body: RequestInit['body']): void {
  const sent = JSON.parse(String(body)) as { reasoning_effort?: string; max_completion_tokens?: number; response_format?: { json_schema?: { strict?: boolean } } };
  if (sent.reasoning_effort !== 'low' || sent.max_completion_tokens !== APP_MAX_COMPLETION_TOKENS || sent.response_format?.json_schema?.strict !== true) {
    throw new Error('The Beam request does not carry the app settings (reasoning low, 60,000 completion tokens, strict schema).');
  }
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

const base: BeamPort = dry
  ? createFakeBeam((request) => {
      console.log(`[dry run] ${request.system.length + request.user.length} characters of prompt (about ${Math.round((request.system.length + request.user.length) / 3.5)} tokens)`);
      console.log(`[dry run] ${request.user.split('\n').filter((row) => row.startsWith(QUARTER_MARKER_PREFIX)).length} quarter markers in the Conversation`);
      return { picks: [{ id: /^(s\d+) /m.exec(request.user)?.[1] ?? 's0', note: 'dry run' }] };
    })
  : realBeam();

const beam: BeamPort = base;

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
