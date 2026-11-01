// Rebuild the Gallery Poems at load: the stored picks go through the same verification as
// a live Poem (src/verification.ts) against the Gallery's own text. Nothing stored is
// shown as it is; every Line's text and Receipt is looked up from the letters.

import { OCCASIONS, type Conversation, type Poem } from '../domain';
import { readConversation } from '../sources';
import { GALLERY_PEOPLE } from '../sources/gallery';
import { snippetsOf } from '../snippets';
import { BeamError } from '../beam/port';
import { verifyAnswer } from '../verification';
import { fingerprintOf, type GalleryPicks } from './picks';

export interface GalleryPoems {
  /** The Gallery's letters, so a Card can show the messages around each Line. */
  conversation: Conversation;
  /** One verified Poem per Occasion that has picks, in the order of {@link OCCASIONS}. */
  poems: Poem[];
}

/**
 * Rebuild the Poems from `picks` against the Gallery `texts`.
 *
 * A Poem whose picks do not all verify is left out rather than shown. Picks made against
 * different Gallery text are refused outright, since their IDs would point at other
 * Snippets.
 */
export function buildGalleryPoems(texts: readonly string[], picks: GalleryPicks): GalleryPoems {
  const conversation = readConversation({ kind: 'gallery', texts: [...texts] });
  const snippets = snippetsOf(conversation);

  const made = fingerprintOf(snippets);
  if (made.snippets !== picks.gallery.snippets || made.hash !== picks.gallery.hash) {
    throw new Error('The Gallery Poems were picked from different Gallery text than this, so their Snippet IDs cannot be trusted.');
  }

  const poems: Poem[] = [];
  for (const occasion of OCCASIONS) {
    const occasionPicks = picks.poems[occasion];
    if (!occasionPicks) continue;
    try {
      const { lines, verified } = verifyAnswer(JSON.stringify({ lines: occasionPicks }), snippets);
      if (verified) poems.push({ occasion, ...GALLERY_PEOPLE, lines, verified });
    } catch (error) {
      // Nothing resolved to a real Snippet: this Poem is not shown.
      if (!(error instanceof BeamError)) throw error;
    }
  }
  return { conversation, poems };
}
