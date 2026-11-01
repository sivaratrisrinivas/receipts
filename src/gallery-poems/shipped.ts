// The Gallery Poems that ship with the static build: the picks saved by
// `npm run gallery:poems` (scripts/make-gallery-poems.ts).

import picks from './picks.json';
import type { GalleryPicks } from './picks';

export const SHIPPED_GALLERY_PICKS: GalleryPicks = picks;
