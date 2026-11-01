// Make the Gallery Poems live, through the real Beam adapter, and save their picks.
//
//   npm run gallery:poems                       # the Occasions that have no Poem yet
//   npm run gallery:poems -- --occasion sorry   # redo one Occasion
//   npm run gallery:poems -- --all              # redo every Occasion
//   npm run gallery:poems -- --dry              # no network, no token: size up the run only
//
// Each call costs about $0.20 of Hugging Face credits. A Poem is kept only if every pick
// verifies against the Gallery and it has Lines from every quarter of the timeline and
// from both Senders; Beam is tried at most 3 times per Occasion, and the run stops for
// good once the estimated spend could pass $3. Poems are saved as they are accepted, so
// an interrupted run loses nothing already paid for.
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
import { DEFAULT_BUDGET, MAX_ATTEMPTS_PER_OCCASION, generateGalleryPicks } from '../src/gallery-poems/generate';
import { fingerprintOf, type GalleryPicks } from '../src/gallery-poems/picks';

const PICKS_FILE = new URL('../src/gallery-poems/picks.json', import.meta.url);
/** A call that has not finished in this long is abandoned (and counts as a failed attempt). */
const CALL_TIMEOUT_MS = 8 * 60_000;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const redoAll = args.includes('--all');
const only = args.includes('--occasion') ? args[args.indexOf('--occasion') + 1] : undefined;
if (only !== undefined && !OCCASIONS.includes(only as Occasion)) {
  console.error(`Unknown occasion "${only}". Choose one of: ${OCCASIONS.join(', ')}.`);
  process.exit(2);
}

const texts = GALLERY_TEXT_PATHS.map((path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8'));
const gallery = fingerprintOf(snippetsOf(readConversation({ kind: 'gallery', texts })));

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
function format({ gallery: { snippets, hash }, poems }: GalleryPicks): string {
  const occasions = OCCASIONS.filter((occasion) => poems[occasion]).map((occasion) => {
    const picks = poems[occasion]!.map((pick) => `      ${JSON.stringify(pick)}`).join(',\n');
    return `    ${JSON.stringify(occasion)}: [\n${picks}\n    ]`;
  });
  return `{\n  "gallery": { "snippets": ${snippets}, "hash": ${JSON.stringify(hash)} },\n  "poems": {\n${occasions.join(',\n')}\n  }\n}\n`;
}

const saved = loadSaved();
const missing = OCCASIONS.filter((occasion) => (only !== undefined ? occasion === only : redoAll || !saved.poems[occasion]));
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
  return createHfBeam({ token, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) }) });
}

const beam: BeamPort = dry
  ? createFakeBeam((request) => {
      console.log(`[dry run] ${request.system.length + request.user.length} characters of prompt (about ${Math.round((request.system.length + request.user.length) / 3.5)} tokens)`);
      return { picks: [{ id: /^(s\d+) /m.exec(request.user)?.[1] ?? 's0', note: 'dry run' }] };
    })
  : realBeam();

console.log(
  `${gallery.snippets} Snippets. Making: ${wanted.join(', ')}. At most ${MAX_ATTEMPTS_PER_OCCASION} attempts each; stop at an estimated $${DEFAULT_BUDGET.limitUsd.toFixed(2)} ($${DEFAULT_BUDGET.perCallUsd.toFixed(2)} a call).${dry ? ' (dry run)' : ''}`,
);

const poems = { ...saved.poems };
let started = Date.now();
const report = await generateGalleryPicks({
  texts,
  beam,
  occasions: wanted,
  ...(dry ? { maxAttempts: 1 } : {}),
  onAttempt(occasion, number, attempt, spentUsd) {
    const seconds = Math.round((Date.now() - started) / 1000);
    started = Date.now();
    console.log(`${occasion} #${number}: ${attempt.outcome} in ${seconds}s, about $${attempt.costUsd.toFixed(3)} (total $${spentUsd.toFixed(3)})`);
    for (const problem of attempt.problems) console.log(`    - ${problem}`);
    if (attempt.outcome === 'accepted' && attempt.picks && !dry) {
      poems[occasion] = attempt.picks;
      writeFileSync(PICKS_FILE, format({ gallery, poems }));
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
