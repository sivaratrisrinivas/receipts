// Fetches the committed Gallery texts (Project Gutenberg 16182 and 73891) from the
// static site, once, for as many Poems as the Giver makes.

import { GALLERY_TEXT_PATHS } from '../sources/gallery';
import type { RawSource } from '../sources';

export function createGalleryLoader(fetchText: typeof fetch = (...args) => fetch(...args)): () => Promise<RawSource> {
  let cached: Promise<RawSource> | null = null;
  return () => {
    cached ??= load(fetchText).catch((error: unknown) => {
      cached = null; // a failed load can be retried
      throw error;
    });
    return cached;
  };
}

async function load(fetchText: typeof fetch): Promise<RawSource> {
  const texts = await Promise.all(
    GALLERY_TEXT_PATHS.map(async (path) => {
      const response = await fetchText(path);
      // A TypeError is what a failed fetch throws, and is what the app treats as a connection problem.
      if (!response.ok) throw new TypeError(`Could not load ${path} (HTTP ${response.status})`);
      return response.text();
    }),
  );
  return { kind: 'gallery', texts };
}
