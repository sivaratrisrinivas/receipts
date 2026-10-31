// Conversation sources: one adapter per kind of raw input, each producing a
// Conversation.

import type { Conversation } from '../domain';
import { exportText } from './export-file';
import { readGallery } from './gallery';
import { AmbiguousDatesError, inferDateOrder, parseWhatsApp, toConversation, type DateOrder } from './whatsapp';

export type RawSource =
  /** The Gallery: the Gutenberg texts of the Browning-Barrett letters, as plain strings. */
  | { kind: 'gallery'; texts: string[] }
  /**
   * A WhatsApp export (Android or iOS): its text, or the bytes of the `.txt` or `.zip`.
   * `dateOrder` is the Giver's answer when the export's dates can be read both ways.
   */
  | { kind: 'whatsapp'; file: string | Uint8Array; dateOrder?: DateOrder };

export function readConversation(source: RawSource): Conversation {
  switch (source.kind) {
    case 'gallery':
      return readGallery(source.texts);
    case 'whatsapp': {
      const exported = parseWhatsApp(exportText(source.file));
      const order = source.dateOrder ?? inferDateOrder(exported);
      if (order === null) throw new AmbiguousDatesError();
      return toConversation(exported, order);
    }
  }
}
