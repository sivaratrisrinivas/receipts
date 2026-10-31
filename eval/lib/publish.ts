// Publishing the dataset folder as the public Hub dataset `Srini410/receipts-eval`.
// The write token comes from the caller (the CLI reads env HF_WRITE_TOKEN) and is only
// ever handed to the Hub client; it is never printed.

import { createRepo, repoExists, uploadFiles } from '@huggingface/hub';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertNoSecret } from './dataset';

export const DATASET_REPO = 'Srini410/receipts-eval';

/** The slice of the Hub client this script needs, so tests can stand in for it. */
export interface Hub {
  repoExists(repo: string, token: string): Promise<boolean>;
  createRepo(repo: string, token: string): Promise<void>;
  uploadFiles(repo: string, token: string, files: { path: string; content: URL }[], commitTitle: string): Promise<void>;
}

export const huggingFaceHub: Hub = {
  repoExists: (name, accessToken) => repoExists({ repo: { type: 'dataset', name }, accessToken }),
  createRepo: async (name, accessToken) => {
    await createRepo({ repo: { type: 'dataset', name }, accessToken, visibility: 'public' });
  },
  uploadFiles: async (name, accessToken, files, commitTitle) => {
    await uploadFiles({ repo: { type: 'dataset', name }, accessToken, files, commitTitle });
  },
};

export interface PublishOptions {
  /** The dataset folder (`eval/dataset`). */
  dir: string;
  /** A Hugging Face token that can write the repo. */
  token: string | undefined;
  repo?: string;
  hub?: Hub;
}

export async function publishDataset({ dir, token, repo = DATASET_REPO, hub = huggingFaceHub }: PublishOptions) {
  if (!token) {
    throw new Error(
      'No write token. The stored inference token cannot write repos: create a token with write access to ' +
        `${repo} at https://huggingface.co/settings/tokens and run \`HF_WRITE_TOKEN=<token> npm run eval:publish\`.`,
    );
  }
  assertNoSecret(dir, token);

  const files = filesUnder(dir).map((path) => ({
    path: relative(dir, path).split(sep).join('/'),
    content: pathToFileURL(path),
  }));
  if (!(await hub.repoExists(repo, token))) await hub.createRepo(repo, token);
  await hub.uploadFiles(repo, token, files, 'Receipts eval: traces, metrics and README');

  return { url: `https://huggingface.co/datasets/${repo}`, files: files.map((file) => file.path) };
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}
