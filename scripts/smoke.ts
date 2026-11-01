// Live smoke test: one real Gallery Poem, end to end, through the real Beam adapter.
//
//   npm run smoke                  # costs about $0.15 (up to about $0.25) of Hugging Face credits
//   npm run smoke -- --occasion birthday
//   npm run smoke -- --dry         # no network, no token: just size the prompt
//
// The token is read from the Hugging Face cache (~/.cache/huggingface/token). It goes
// only into the Authorization header of the request; this script never prints it.

import { readFileSync } from 'node:fs';
import {
  BeamError,
  GALLERY_TEXT_PATHS,
  OCCASIONS,
  createFakeBeam,
  createHfBeam,
  makePoem,
  tokensCostUsd,
  type BeamPort,
  type BeamUsage,
  type Occasion,
} from '../src';
import { readHfToken } from '../eval/lib/token';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const occasionArg = args.includes('--occasion') ? args[args.indexOf('--occasion') + 1] : 'anniversary';
const occasion = OCCASIONS.find((o) => o === occasionArg);
if (!occasion) {
  console.error(`Unknown occasion "${occasionArg}". Choose one of: ${OCCASIONS.join(', ')}.`);
  process.exit(2);
}

const texts = GALLERY_TEXT_PATHS.map((path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8'));

let usage: BeamUsage | undefined;
function measured(beam: BeamPort): BeamPort {
  return {
    async complete(request, onProgress) {
      const completion = await beam.complete(request, onProgress);
      usage = completion.usage;
      return completion;
    },
  };
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
  return createHfBeam({ token });
}

const beam = dry
  ? createFakeBeam((request) => {
      console.log(`[dry run] prompt: ${request.system.length + request.user.length} characters (about ${Math.round((request.system.length + request.user.length) / 4)} tokens)`);
      // Eight is a whole Poem in either size tier (6 to 8 Lines, 8 to 14).
      const first = [...request.user.matchAll(/^(s\d+) /gm)].slice(0, 8).map((match) => match[1]!);
      return { picks: first.map((id) => ({ id, note: 'dry run' })) };
    })
  : measured(realBeam());

const started = Date.now();
try {
  const { poem, conversation, snippets } = await makePoem(
    { source: { kind: 'gallery', texts }, occasion: occasion as Occasion, giver: 'Robert', recipient: 'Elizabeth' },
    beam,
    {
      onProgress: ({ reasoningTokens }) => process.stderr.write(`\rBeam is reading... ${reasoningTokens} reasoning tokens`),
    },
  );
  process.stderr.write('\n');

  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`${conversation.messages.length} Messages, ${snippets.length} Snippets, ${seconds}s`);
  if (usage) {
    const cost = tokensCostUsd(usage.promptTokens, usage.completionTokens);
    console.log(`tokens: ${usage.promptTokens} in, ${usage.completionTokens} out (${usage.reasoningTokens} reasoning), about $${cost.toFixed(3)}`);
  }
  console.log(`\nPoem for ${poem.recipient} from ${poem.giver}: ${poem.occasion}`);
  console.log(`every line is real: ${poem.verified ? 'yes (badge set)' : 'NO (badge withheld)'}`);
  for (const [i, line] of poem.lines.entries()) {
    console.log(`\n${String(i + 1).padStart(2)}. ${line.text}`);
    console.log(`      -- ${line.receipt.sender}, ${line.receipt.dateLabel}   [${line.snippetId}]`);
    if (line.note) console.log(`      note: ${line.note}${line.callbacks.length ? ` (callbacks: ${line.callbacks.join(', ')})` : ''}`);
  }
} catch (error) {
  process.stderr.write('\n');
  if (error instanceof BeamError) {
    console.error(`Beam failed (${error.reason}${error.retryable ? ', retryable' : ''}): ${error.message}`);
  } else {
    console.error('Smoke test failed:', error instanceof Error ? error.message : error);
  }
  process.exit(1);
}
