// The random-Snippet baseline as a Beam port: it "answers" by picking Snippets at
// random, with no network call. Running it through the real pipeline means a random
// Poem is verified and Receipted exactly like a Beam Poem.

import type { BeamPort } from '../../src';

export const RANDOM_MIN_LINES = 8;
export const RANDOM_MAX_LINES = 14;

/** Seeded, so a rerun draws the same Poems. mulberry32 over an FNV-1a hash of the seed. */
function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks 8 to 14 distinct Snippets uniformly at random from `snippetCount` Snippets
 * (the same span of Lines Beam is asked for). Snippet IDs are `s0`..`s<n-1>`.
 */
export function createRandomPicker(snippetCount: number, seed: string): BeamPort {
  return {
    async complete() {
      const random = seededRandom(seed);
      const wanted = RANDOM_MIN_LINES + Math.floor(random() * (RANDOM_MAX_LINES - RANDOM_MIN_LINES + 1));
      const pool = Array.from({ length: snippetCount }, (_, i) => i);
      const picked: number[] = [];
      while (picked.length < wanted && pool.length > 0) {
        const at = Math.floor(random() * pool.length);
        picked.push(pool[at]!);
        pool[at] = pool[pool.length - 1]!;
        pool.pop();
      }
      const lines = picked.map((index) => ({ id: `s${index}`, note: '', callbacks: [] }));
      return { content: JSON.stringify({ lines }), finishReason: 'stop' };
    },
  };
}
