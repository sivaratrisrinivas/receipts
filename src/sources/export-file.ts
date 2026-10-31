// An export as the browser receives it: the chat's text, or the bytes of a file that
// holds it. WhatsApp hands over a `.txt`, or a `.zip` holding the chat as `_chat.txt`
// (iOS) or `WhatsApp Chat with ....txt` (Android) beside the photos and voice notes.

import { unzipSync } from 'fflate';
import { ExportError } from './whatsapp';

/** A chat longer than this, once unzipped, is not a chat; it also keeps a hostile zip from filling memory. */
const MAX_CHAT_BYTES = 200 * 1024 * 1024;

/** The chat text of an export file given as text or as bytes (a `.txt`, or a `.zip` with a `.txt` inside). */
export function exportText(file: string | Uint8Array): string {
  if (typeof file === 'string') return file;
  return new TextDecoder('utf-8').decode(isZip(file) ? chatInZip(file) : file);
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function chatInZip(zip: Uint8Array): Uint8Array {
  let texts: Record<string, Uint8Array>;
  try {
    // Only the text files are unpacked; the photos and voice notes stay compressed.
    texts = unzipSync(zip, { filter: (entry) => /\.txt$/i.test(entry.name) && entry.originalSize <= MAX_CHAT_BYTES });
  } catch {
    throw new ExportError('This zip file could not be opened. Export the chat from WhatsApp again, or upload its .txt file.');
  }
  const found = Object.entries(texts);
  const chat = found.find(([name]) => /(?:^|\/)_chat\.txt$/i.test(name)) ?? found.sort((a, b) => b[1].length - a[1].length)[0];
  if (!chat) throw new ExportError('There is no chat text in this zip file. Is it a WhatsApp export?');
  return chat[1];
}
