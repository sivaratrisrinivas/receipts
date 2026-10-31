// Conversation sources: one adapter per kind of raw input, each producing a
// Conversation. Later sources (WhatsApp Android, WhatsApp iOS) join the union here.

import type { Conversation } from '../domain';
import { readGallery } from './gallery';

export type RawSource =
  /** The Gallery: the Gutenberg texts of the Browning-Barrett letters, as plain strings. */
  { kind: 'gallery'; texts: string[] };

export function readConversation(source: RawSource): Conversation {
  switch (source.kind) {
    case 'gallery':
      return readGallery(source.texts);
  }
}
