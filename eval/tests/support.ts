// Shared helpers for the eval tests: a synthetic Gallery, scripted Beams and a temp dir.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import type { BeamCompletion, BeamPort, BeamRequest, BeamUsage } from '../../src';
import { volumeOne, volumeTwo } from '../../tests/fixtures/gallery';

export const texts = [volumeOne, volumeTwo];

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

/** The ID of the Snippet containing `fragment`, as Beam would see it. */
export function idOf(request: BeamRequest, fragment: string): string {
  const found = snippetsIn(request).find((snippet) => snippet.text.includes(fragment));
  if (!found) throw new Error(`no Snippet containing "${fragment}" in the prompt`);
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
