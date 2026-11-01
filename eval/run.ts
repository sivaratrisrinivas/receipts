// Runs the eval: 3 groups of Poems over the Gallery, through the real Beam adapter,
// then builds the dataset folder from the traces.
//
//   npm run eval -- --per-group 1     # dry run: 1 Poem per group, about $0.30
//   npm run eval                      # all 60 Poems, about $6; finished Poems are skipped
//   npm run eval -- --redo-failed     # make Poems again that failed on an earlier run
//   npm run eval -- --cap 6.5         # stricter spend cap in USD (the default is $8)
//
// The token is read from HF_TOKEN or ~/.cache/huggingface/token. It goes only into the
// Authorization header of Beam requests; this script never prints or writes it, and
// refuses to finish if it finds it in the dataset folder.

import { join } from 'node:path';
import { createHfBeam, readConversation } from '../src';
import { assertNoSecret, buildDataset } from './lib/dataset';
import { DATASET_DIR, loadGalleryTexts } from './lib/paths';
import { runEval } from './lib/runner';
import { DEFAULT_SPEND_CAP_USD, MAX_COMPLETION_TOKENS, SpendCapExceeded } from './lib/spend';
import { readHfToken } from './lib/token';

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

const perGroup = Number(option('per-group') ?? 20);
const spendCapUsd = Number(option('cap') ?? DEFAULT_SPEND_CAP_USD);
if (!Number.isInteger(perGroup) || perGroup < 1 || !(spendCapUsd > 0)) {
  console.error('Usage: npm run eval -- [--per-group N] [--cap USD] [--redo-failed]');
  process.exit(2);
}

const token = readHfToken();
const texts = loadGalleryTexts();

try {
  const report = await runEval({
    texts,
    traceDir: join(DATASET_DIR, 'traces'),
    perGroup,
    beam: createHfBeam({ token, maxCompletionTokens: MAX_COMPLETION_TOKENS }),
    maxCompletionTokens: MAX_COMPLETION_TOKENS,
    spendCapUsd,
    redoFailed: process.argv.includes('--redo-failed'),
    onEvent(event) {
      if (event.kind === 'retry') {
        console.log(`  ${event.condition}-${event.index}: attempt ${event.failedAttempts} failed (${event.error}); retrying in ${event.waitMs / 1000}s`);
        return;
      }
      const { trace } = event;
      const result = trace.status === 'ok' ? `${trace.poem?.lines.length} Lines, ${trace.poem?.verified ? 'verified' : 'NOT verified'}` : `FAILED (${trace.error?.reason})`;
      console.log(`${trace.condition} #${trace.index}: ${result}, ${Math.round(trace.seconds)}s, $${trace.costUsd.toFixed(3)}; spent so far $${event.spentUsd.toFixed(2)}`);
    },
  });

  const { groups } = buildDataset({ dir: DATASET_DIR, conversation: readConversation({ kind: 'gallery', texts }) });
  assertNoSecret(DATASET_DIR, token);

  console.log(`\nDone: ${report.traces.length} Poems, about $${report.spentUsd.toFixed(2)} spent in total.`);
  console.table(
    groups.map((group) => ({
      group: group.condition,
      completed: `${group.completed}/${group.attempted}`,
      verification: group.verificationRate.toFixed(2),
      coverage: group.timelineCoverage.toFixed(2),
      balance: group.senderBalance.toFixed(2),
      callbacks: group.noteCallbacks.toFixed(1),
    })),
  );
  console.log(`Dataset folder: ${DATASET_DIR}`);
} catch (error) {
  console.error(error instanceof SpendCapExceeded ? error.message : `Eval stopped: ${error instanceof Error ? error.message : 'unknown error'}`);
  console.error('Finished Poems are kept in the traces folder; rerun to resume.');
  process.exit(1);
}
