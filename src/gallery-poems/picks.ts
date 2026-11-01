// The shape of the Gallery Poems as stored: only each Poem's picks, never any text.

import type { Occasion, Sender, Snippet } from '../domain';

/** In the Gallery the Giver is Robert and the Recipient is Elizabeth (as in the live app). */
export const GALLERY_PEOPLE: { giver: Sender; recipient: Sender } = { giver: 'Robert', recipient: 'Elizabeth' };

/** One pick, as Beam returned it: a Snippet ID, a private Note, and the IDs the Note cites. */
export interface GalleryPick {
  id: string;
  note: string;
  callbacks: string[];
}

/** Which Snippets the IDs were chosen from. A Snippet ID is only a position in the Gallery's text. */
export interface GalleryFingerprint {
  snippets: number;
  hash: string;
}

export interface GalleryPicks {
  /** The Gallery text the picks were made against; the Poems are only rebuilt from the same text. */
  gallery: GalleryFingerprint;
  /** Each Occasion's picks. An Occasion may be missing while the file is being generated. */
  poems: Partial<Record<Occasion, GalleryPick[]>>;
}

/**
 * A fingerprint of the Gallery's Snippets (their IDs and text), to notice when the text
 * or the way it is cut into Snippets has changed. Not for security: picks are verified
 * against the text regardless.
 */
export function fingerprintOf(snippets: readonly Snippet[]): GalleryFingerprint {
  // cyrb53: a small, fast, well-mixed 53-bit hash; pure arithmetic, so it runs anywhere.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const snippet of snippets) {
    const row = `${snippet.id}\t${snippet.text}\n`;
    for (let i = 0; i < row.length; i++) {
      const code = row.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  return { snippets: snippets.length, hash };
}
