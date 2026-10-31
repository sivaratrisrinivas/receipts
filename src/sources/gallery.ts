// Conversation source: the Gallery, i.e. the Browning-Barrett letters (Project
// Gutenberg ebooks 16182 and 73891) read into a Conversation of Messages.

import type { Conversation, IsoDate, Message, Sender } from '../domain';

/** Where the committed Gutenberg texts live, relative to the static site root. */
export const GALLERY_TEXT_PATHS = ['gallery/pg16182.txt', 'gallery/pg73891.txt'] as const;

const MARKER = /^_(R\.B\. to E\.B\.B\.|E\.B\.B\. to R\.B\.)_$/m;
const SENDERS: Record<string, Sender> = {
  'R.B. to E.B.B.': 'Robert',
  'E.B.B. to R.B.': 'Elizabeth',
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const DATE = /\b(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(18\d\d)/;

interface Letter {
  sender: Sender;
  date: IsoDate | null;
  body: string;
}

/** Read the Gutenberg texts of the Gallery, in the order given, into one Conversation. */
export function readGallery(texts: readonly string[]): Conversation {
  const letters = texts.flatMap(readLetters);

  // A letter without a parseable date takes the nearest earlier letter's date.
  let lastDate: IsoDate | null = null;
  const messages: Message[] = [];
  for (const letter of letters) {
    const stated = letter.date !== null && (lastDate === null || letter.date >= lastDate);
    const date = stated ? letter.date : lastDate;
    if (date === null) continue;
    lastDate = date;
    messages.push({
      ordinal: messages.length,
      sender: letter.sender,
      date,
      approximate: !stated,
      text: letter.body,
    });
  }

  return { kind: 'letters', senders: [...new Set(messages.map((m) => m.sender))], messages };
}

function readLetters(text: string): Letter[] {
  const start = text.indexOf('*** START OF');
  const end = text.indexOf('*** END OF');
  const book = text.slice(start < 0 ? 0 : start, end < 0 ? undefined : end);

  const parts = book.split(MARKER);
  const letters: Letter[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const sender = SENDERS[parts[i]!]!;
    const lines = parts[i + 1]!.split('\n');

    let first = 0;
    const header: string[] = [];
    while (first < lines.length && (lines[first]!.trim() === '' || /^\s{8,}/.test(lines[first]!))) {
      if (lines[first]!.trim() !== '') header.push(lines[first]!.trim());
      first++;
    }

    const body = lines.slice(first).join('\n').replace(/\[[^\]]*\]/g, ' ');
    letters.push({ sender, date: parseDate(header.join(' ')), body });
  }
  return letters;
}

function parseDate(header: string): IsoDate | null {
  const match = DATE.exec(header);
  if (!match) return null;
  const month = MONTHS[match[1]!.slice(0, 3).toLowerCase()]!;
  return `${match[3]}-${String(month).padStart(2, '0')}-${match[2]!.padStart(2, '0')}`;
}
