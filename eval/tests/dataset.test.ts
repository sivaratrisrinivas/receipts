// Seam 5: the dataset folder. A trace directory goes in; the files that get published
// (poems, metrics table, README) come out. Seam 6: publishing it, against a mock Hub.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createFakeBeam, readConversation } from '../../src';
import { assertNoSecret, buildDataset } from '../lib/dataset';
import { runEval } from '../lib/runner';
import { fragment, idOf, texts, useTempDir, withUsage } from './support';

const tempDir = useTempDir();
const conversation = readConversation({ kind: 'gallery', texts });

/** A finished run of 2 Poems per group in `<dir>/traces`. */
async function finishedRun(dir: string) {
  const beam = withUsage(
    createFakeBeam((request) => {
      // Beam on the last 10% is not shown the first letters, so it picks from the end.
      const [first, reply] = request.user.includes(fragment(0, 1))
        ? [fragment(0, 1), fragment(1, 1)]
        : [fragment(53, 1), fragment(54, 1)];
      return {
        picks: [
          { id: idOf(request, first), note: 'The first letter.' },
          { id: idOf(request, reply), note: 'The reply.', callbacks: [idOf(request, first)] },
        ],
      };
    }),
    { promptTokens: 500_000, completionTokens: 30_000, reasoningTokens: 29_000 },
  );
  await runEval({ texts, traceDir: join(dir, 'traces'), perGroup: 2, beam });
}

describe('building the dataset folder', () => {
  test('writes one row per Poem, a three-row metrics table and the README next to the traces', async () => {
    const dir = tempDir();
    await finishedRun(dir);

    const { groups } = buildDataset({ dir, conversation });

    expect(readdirSync(dir).sort()).toEqual(['README.md', 'metrics.csv', 'metrics.json', 'poems.jsonl', 'traces']);
    expect(readdirSync(join(dir, 'traces'))).toHaveLength(6);

    const rows = readFileSync(join(dir, 'poems.jsonl'), 'utf8').trim().split('\n').map((row) => JSON.parse(row));
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => [row.condition, row.index])).toEqual([
      ['full', 0],
      ['full', 1],
      ['last10', 0],
      ['last10', 1],
      ['random', 0],
      ['random', 1],
    ]);
    expect(rows[0]).toMatchObject({
      status: 'ok',
      verified: true,
      occasion: 'birthday',
      prompt_tokens: 500_000,
      completion_tokens: 30_000,
      reasoning_tokens: 29_000,
      note_callbacks: 1,
      timeline_coverage: 0.1,
      sender_balance: 1,
    });
    expect(rows[0].lines[0]).toMatchObject({ sender: 'Robert', date: '1845-01-01', note: 'The first letter.' });

    const [header, ...table] = readFileSync(join(dir, 'metrics.csv'), 'utf8').trim().split('\n').map((row) => row.split(','));
    expect(header?.slice(0, 6)).toEqual(['group', 'poems', 'completed', 'verification_rate', 'timeline_coverage', 'sender_balance']);
    expect(table.map((row) => row[0])).toEqual(['full', 'last10', 'random']);
    expect(groups.map((group) => group.condition)).toEqual(['full', 'last10', 'random']);
    expect(JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8')).groups).toHaveLength(3);
  });

  test('the README has Hub front-matter, the method, a results table, the reasoning-effort finding and the Gutenberg credit', async () => {
    const dir = tempDir();
    await finishedRun(dir);

    buildDataset({ dir, conversation });
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');

    const frontMatter = /^---\n([\s\S]*?)\n---\n/.exec(readme)?.[1] ?? '';
    expect(frontMatter).toMatch(/^pretty_name: /m);
    expect(frontMatter).toMatch(/^license: /m);
    expect(frontMatter).toMatch(/data_files: poems\.jsonl/);
    expect(frontMatter).toMatch(/data_files: metrics\.csv/);
    expect(frontMatter).toMatch(/build-with-beam/);
    expect(readme).not.toContain('{{');
    for (const group of ['Beam on the full Conversation', 'Beam on the last 10%', 'Random Snippets']) expect(readme).toContain(group);
    for (const metric of ['Verification rate', 'Timeline coverage', 'Sender balance', 'Note callbacks']) expect(readme).toContain(metric);
    expect(readme).toMatch(/only `low` .*500k/s);
    expect(readme).toContain('reasoning_effort');
    expect(readme).toContain('gutenberg.org/ebooks/16182');
    expect(readme).toContain('gutenberg.org/ebooks/73891');
    expect(readme).toMatch(/public domain/i);
  });

  test('the README states what the run cost, from the traces', async () => {
    const dir = tempDir();
    await finishedRun(dir);

    buildDataset({ dir, conversation });

    // 4 Beam Poems (2 full, 2 last-10%) at 500k in and 30k out: 4 x $0.236.
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toContain('$0.94');
  });
});

describe('keeping the token out of the dataset', () => {
  test('passes a folder that does not contain the secret', async () => {
    const dir = tempDir();
    await finishedRun(dir);
    buildDataset({ dir, conversation });

    expect(() => assertNoSecret(dir, 'hf_notInAnyFile1234567890')).not.toThrow();
  });

  test('refuses a folder with the secret in any file, without repeating the secret', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'traces'));
    writeFileSync(join(dir, 'traces', 'full-00.json'), '{"error":"Bearer hf_leakedSecret1234567890"}');

    const check = () => assertNoSecret(dir, 'hf_leakedSecret1234567890');

    expect(check).toThrow(/traces\/full-00\.json/);
    expect(check).not.toThrow(/hf_leakedSecret/);
  });
});
