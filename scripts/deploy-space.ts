// Deploy the built site (dist/) to the static Space Srini410/receipts.
//
//   HF_WRITE_TOKEN=hf_... npm run deploy:space     # build, check, then upload
//   npm run deploy:space -- --dry                  # build and check; needs no token, uploads nothing
//
// HF_WRITE_TOKEN must be a token that can write repos in the Srini410 namespace
// (https://huggingface.co/settings/tokens). It is used only as the Hub credential and is
// never printed, including in error messages. The usual inference-only token (the one the
// smoke script reads) cannot do this.
//
// The upload is one commit: the contents of dist/ at the Space's repo root (README.md with
// the Space's front-matter, index.html, assets/, gallery/), minus any stale hashed bundles.

import { commit, createRepo, listFiles, repoExists, type CommitOperation } from '@huggingface/hub';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = { type: 'space', name: 'Srini410/receipts' } as const;
const DIST = new URL('../dist/', import.meta.url).pathname;
const HUB_URL = process.env.HF_ENDPOINT; // only set to point at a test server

const dry = process.argv.includes('--dry');
const token = process.env.HF_WRITE_TOKEN?.trim();

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const posix = (path: string) => relative(DIST, path).split(sep).join('/');

/** What must be true of dist/ before anything is uploaded. Returns the problems found. */
function checkBuild(files: string[]): string[] {
  const problems: string[] = [];
  const names = new Set(files.map(posix));
  if (!names.has('index.html')) problems.push('dist/index.html is missing: run the build first.');

  if (!names.has('README.md')) {
    problems.push('dist/README.md is missing (it comes from public/README.md).');
  } else {
    const readme = readFileSync(join(DIST, 'README.md'), 'utf8');
    for (const required of ['sdk: static', 'hf_oauth: true', '- inference-api', 'reflection/Beam-1.0-501B-A23B']) {
      if (!readme.includes(required)) problems.push(`README.md front-matter lacks "${required}".`);
    }
  }

  const textual = /\.(html|js|css|md|json|map)$/;
  for (const file of files.filter((path) => textual.test(path))) {
    const text = readFileSync(file, 'utf8');
    if (text.includes('__dev/hf-token') || text.includes('receipts-dev-hf-token')) {
      problems.push(`${posix(file)} contains the local-development token route; it must not be deployed.`);
    }
    if (/hf_[A-Za-z0-9]{30,}/.test(text)) problems.push(`${posix(file)} contains something that looks like a Hugging Face token.`);
  }
  return problems;
}

function redact(message: string): string {
  return token ? message.split(token).join('***') : message;
}

async function main(): Promise<void> {
  const files = walk(DIST);
  const problems = checkBuild(files);
  if (problems.length > 0) {
    console.error(`Not deploying:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exit(1);
  }
  const bytes = files.reduce((total, file) => total + statSync(file).size, 0);
  console.log(`dist/ checks out: ${files.length} files, ${(bytes / 1_000_000).toFixed(1)} MB.`);

  if (dry) {
    console.log(`--dry: would upload to https://huggingface.co/spaces/${REPO.name}:`);
    for (const file of files) console.log(`  ${posix(file)}`);
    return;
  }
  if (!token) {
    console.error('Set HF_WRITE_TOKEN to a Hugging Face token that can write repos in the Srini410 namespace\n(https://huggingface.co/settings/tokens), then run this again. Use --dry to check the build without a token.');
    process.exit(2);
  }

  const credentials = { accessToken: token, ...(HUB_URL ? { hubUrl: HUB_URL } : {}) };
  if (!(await repoExists({ repo: REPO, ...credentials }))) {
    await createRepo({ repo: REPO, sdk: 'static', visibility: 'public', ...credentials });
    console.log(`Created the Space ${REPO.name}.`);
  }

  // Hashed bundles from earlier deploys would otherwise pile up in the repo.
  const keep = new Set(files.map(posix));
  const operations: CommitOperation[] = [];
  for await (const entry of listFiles({ repo: REPO, recursive: true, ...credentials })) {
    if (entry.type === 'file' && entry.path.startsWith('assets/') && !keep.has(entry.path)) {
      operations.push({ operation: 'delete', path: entry.path });
    }
  }
  for (const file of files) operations.push({ operation: 'addOrUpdate', path: posix(file), content: pathToFileURL(file) });

  await commit({ repo: REPO, title: 'Deploy the Receipts site', operations, ...credentials });
  console.log(`Deployed ${files.length} files to https://huggingface.co/spaces/${REPO.name}`);
}

main().catch((error: unknown) => {
  console.error(`Deploy failed: ${redact(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
});
