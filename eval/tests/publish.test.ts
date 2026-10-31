// Seam 6: publishing the dataset folder to the Hub, against a recording stand-in for
// the Hub client. The real upload needs a write token this machine does not have.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { publishDataset, type Hub } from '../lib/publish';
import { readHfToken } from '../lib/token';
import { useTempDir } from './support';

const tempDir = useTempDir();
const WRITE_TOKEN = 'hf_writeTokenForTests1234567890';

function datasetFolder(): string {
  const dir = tempDir();
  mkdirSync(join(dir, 'traces'));
  writeFileSync(join(dir, 'README.md'), '# card\n');
  writeFileSync(join(dir, 'metrics.csv'), 'group\nfull\n');
  writeFileSync(join(dir, 'traces', 'full-00.json'), '{}\n');
  return dir;
}

function recordingHub(options: { exists: boolean }) {
  const calls: string[] = [];
  const uploaded: { path: string }[][] = [];
  const hub: Hub = {
    async repoExists() {
      calls.push('repoExists');
      return options.exists;
    },
    async createRepo(repo, token) {
      calls.push(`createRepo ${repo} ${token === WRITE_TOKEN}`);
    },
    async uploadFiles(repo, token, files, commitTitle) {
      calls.push(`uploadFiles ${repo} ${token === WRITE_TOKEN} ${commitTitle}`);
      uploaded.push(files.map(({ path }) => ({ path })));
    },
  };
  return { hub, calls, uploaded };
}

describe('publishing the dataset', () => {
  test('creates the public dataset repo when it is missing, then uploads every file with its folder path', async () => {
    const dir = datasetFolder();
    const { hub, calls, uploaded } = recordingHub({ exists: false });

    const result = await publishDataset({ dir, token: WRITE_TOKEN, hub });

    expect(calls).toEqual([
      'repoExists',
      'createRepo Srini410/receipts-eval true',
      expect.stringMatching(/^uploadFiles Srini410\/receipts-eval true /),
    ]);
    expect(uploaded[0]?.map((file) => file.path).sort()).toEqual(['README.md', 'metrics.csv', 'traces/full-00.json']);
    expect(result.url).toBe('https://huggingface.co/datasets/Srini410/receipts-eval');
  });

  test('does not create the repo again when it exists', async () => {
    const { hub, calls } = recordingHub({ exists: true });

    await publishDataset({ dir: datasetFolder(), token: WRITE_TOKEN, hub });

    expect(calls.some((call) => call.startsWith('createRepo'))).toBe(false);
    expect(calls.some((call) => call.startsWith('uploadFiles'))).toBe(true);
  });

  test('says what to do when there is no write token, without uploading anything', async () => {
    const { hub, calls } = recordingHub({ exists: true });

    await expect(publishDataset({ dir: datasetFolder(), token: '', hub })).rejects.toThrow(/HF_WRITE_TOKEN/);

    expect(calls).toEqual([]);
  });

  test('refuses to upload a folder that contains the token', async () => {
    const dir = datasetFolder();
    writeFileSync(join(dir, 'traces', 'full-01.json'), `{"oops":"${WRITE_TOKEN}"}`);
    const { hub, calls } = recordingHub({ exists: true });

    const error = await publishDataset({ dir, token: WRITE_TOKEN, hub }).catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/traces\/full-01\.json/);
    expect((error as Error).message).not.toContain(WRITE_TOKEN);
    expect(calls).toEqual([]);
  });
});

describe('reading the inference token', () => {
  test('takes HF_TOKEN from the environment first, then the Hugging Face cache file', () => {
    const home = tempDir();
    writeFileSync(join(home, 'token'), 'hf_fromTheCacheFile12345\n');

    expect(readHfToken({ env: { HF_TOKEN: 'hf_fromTheEnvironment1234' }, cacheDir: home })).toBe('hf_fromTheEnvironment1234');
    expect(readHfToken({ env: {}, cacheDir: home })).toBe('hf_fromTheCacheFile12345');
  });

  test('fails with a message that names where it looked but never any token', () => {
    const empty = tempDir();

    expect(() => readHfToken({ env: {}, cacheDir: empty })).toThrow(/HF_TOKEN/);
  });
});
