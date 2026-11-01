// Rebuilds the dataset folder (poems.jsonl, metrics, README) from the traces already
// on disk. No Beam call, no token, no cost.
//
//   npm run eval:report

import { readConversation } from '../src';
import { buildDataset } from './lib/dataset';
import { DATASET_DIR, loadGalleryTexts } from './lib/paths';

const { groups } = buildDataset({ dir: DATASET_DIR, conversation: readConversation({ kind: 'gallery', texts: loadGalleryTexts() }) });
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
