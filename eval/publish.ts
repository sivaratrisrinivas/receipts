// Uploads the dataset folder to the public Hub dataset Srini410/receipts-eval.
//
//   HF_WRITE_TOKEN=<token> npm run eval:publish
//
// The stored inference token cannot write repos, so this needs its own token, from
// https://huggingface.co/settings/tokens, with write access to Srini410/receipts-eval.
// The token is read from the environment and never printed; the upload is refused if
// it appears in any file of the folder.

import { DATASET_DIR } from './lib/paths';
import { publishDataset } from './lib/publish';

try {
  const { url, files } = await publishDataset({ dir: DATASET_DIR, token: process.env['HF_WRITE_TOKEN']?.trim() });
  console.log(`Uploaded ${files.length} files to ${url}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Publishing failed.');
  process.exit(1);
}
