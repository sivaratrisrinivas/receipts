// Shared helpers for the eval tests: a synthetic Gallery, scripted Beams and a temp dir.
//
// The synthetic Gallery is 55 invented letters in the Gutenberg layout, one every 10 days
// from 1 Jan 1845 (letter 0) to 25 Jun 1846 (letter 54), Robert on even letters and
// Elizabeth on odd ones. Each has three 20-word sentences, so every letter is three
// Snippets (165 in all, enough for a full Poem; its last 10% is 6 letters, 18 Snippets,
// enough for a small one). Sentence k of letter i starts "Letter 07 sentence 2".

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import type { BeamCompletion, BeamPort, BeamRequest, BeamUsage } from '../../src';

export const LETTERS = 55;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

/** The start of sentence `sentence` (1 to 3) of letter `letter`, enough to find its Snippet. */
export function fragment(letter: number, sentence: number): string {
  return `Letter ${String(letter).padStart(2, '0')} sentence ${sentence}`;
}

function volume(): string {
  const letters = Array.from({ length: LETTERS }, (_, i) => {
    const day = new Date(Date.UTC(1845, 0, 1 + 10 * i));
    const marker = i % 2 === 0 ? '_R.B. to E.B.B._' : '_E.B.B. to R.B._';
    const header = `                              ${MONTHS[day.getUTCMonth()]}. ${day.getUTCDate()}, ${day.getUTCFullYear()}.`;
    const body = [1, 2, 3]
      .map((k) => `${fragment(i, k)} is about the garden, the weather, the post and the long road between our two houses.`)
      .join(' ');
    return [marker, '', header, '', body, '', ''].join('\n');
  });
  return `*** START OF THE PROJECT GUTENBERG EBOOK LONG ***\n\n${letters.join('\n')}\n*** END OF THE PROJECT GUTENBERG EBOOK LONG ***\n`;
}

export const texts = [volume()];

/** A scratch directory that is removed after each test. */
export function useTempDir(): () => string {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  return () => {
    const dir = mkdtempSync(join(tmpdir(), 'receipts-eval-'));
    made.push(dir);
    return dir;
  };
}

/** The `<id> <text>` rows of the Snippets Beam was shown. */
export function snippetsIn(request: BeamRequest): { id: string; text: string }[] {
  return request.user.split('\n').flatMap((row) => {
    const match = /^(s\d+) (.+)$/.exec(row);
    return match ? [{ id: match[1]!, text: match[2]! }] : [];
  });
}

/** The ID of the Snippet containing `text`, as Beam would see it. */
export function idOf(request: BeamRequest, text: string): string {
  const found = snippetsIn(request).find((snippet) => snippet.text.includes(text));
  if (!found) throw new Error(`no Snippet containing "${text}" in the prompt`);
  return found.id;
}

/** Wraps a port so every completion reports the given token usage. */
export function withUsage(beam: BeamPort, usage: BeamUsage): BeamPort {
  return {
    async complete(request, onProgress): Promise<BeamCompletion> {
      return { ...(await beam.complete(request, onProgress)), usage };
    },
  };
}

/** A Beam that must never be called. */
export const noBeam: BeamPort = {
  complete() {
    throw new Error('Beam was called, but this group needs no Beam call');
  },
};

export const noSleep = async (): Promise<void> => {};
