// Conversation source: a WhatsApp chat export (Android `.txt`, or iOS `.txt`), read into
// a Conversation of Messages.
//
// Android lines look like `31/12/2023, 21:41 - Mom: Hello` (or `12/31/23, 9:41 PM - ...`);
// iOS lines like `[31/12/2023, 21:41:05] Mom: Hello`. A line that does not start with a
// timestamp continues the Message before it. Exports are full of invisible characters
// (U+200E marks, U+202F before AM/PM), which are tolerated everywhere.
//
// Only real Messages survive: media placeholders, system messages, deleted messages and
// the "edited" marker (stripped from the text it trails) are dropped here, so they can
// never become Snippets.

import type { Conversation, IsoDate, Message, Sender } from '../domain';

export type DateOrder = 'day-first' | 'month-first';

/** One Sender of the export and how many Messages they sent. */
export interface SenderCount {
  name: Sender;
  messages: number;
}

/** A Message to show the Giver when the date order cannot be told from the export itself. */
export interface DateQuestion {
  sender: Sender;
  text: string;
  /** The date if the export is day first, e.g. `2024-03-06` for `06/03/24`. */
  dayFirst: IsoDate;
  /** The date if the export is month first, e.g. `2024-06-03` for `06/03/24`. */
  monthFirst: IsoDate;
}

/** An export that could not be used, with something the Giver can act on. */
export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

/** The dates are readable both ways round and no order was given. */
export class AmbiguousDatesError extends ExportError {
  constructor() {
    super('This chat can be read as day-first or month-first, and we need to know which.');
    this.name = 'AmbiguousDatesError';
  }
}

interface ExportedMessage {
  sender: Sender;
  text: string;
  year: number;
  /** The first and second numeric components, as written (`06/03` -> 6, 3). */
  first: number;
  second: number;
  /** `2024-03-06`: the order is fixed (year, month, day) and `first`/`second` are month/day. */
  yearFirst: boolean;
}

/** The Messages of an export, with their dates as written (the day/month order is not applied yet). */
export interface WhatsAppExport {
  readonly messages: readonly ExportedMessage[];
}

const DATE = String.raw`(\d{1,4})([/.\-])(\d{1,2})\2(\d{1,4})`;
// 12-hour times: `9:41 PM`, `9.41 p.m.`, and `9:41 p. m.` (Spanish, Portuguese), in any kind of space.
const TIME = String.raw`\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*[ap]\.?\s?m\.?)?`;
const ANDROID_LINE = new RegExp(String.raw`^${DATE},?\s+${TIME}\s+-\s+([\s\S]*)$`, 'i');
const IOS_LINE = new RegExp(String.raw`^\[${DATE},?\s+${TIME}\]\s*([\s\S]*)$`, 'i');

const LEADING_MARKS = /^[‎‏‪-‮⁦-⁩﻿]+/;
const ALL_MARKS = /[‎‏‪-‮⁦-⁩﻿]/g;

/** `Sender: text`, the sender being short and free of the quotes system messages carry. */
const SENDER_AND_TEXT = /^([^:\n]{1,80}?):(?:\s+([\s\S]*)|$)/;
const QUOTES = /["“”«»]/;

const EDITED_MARKER = /\s*‎?<This message was edited>\s*$/i;

/** Whole-message placeholders that are not something a person said. */
const NOT_SPEECH = [
  /^<[^<>\n]+>$/, // <Media omitted>, <attached: ...>, and their translations
  /^\S+\.\w{2,5}\s*\([^)\n]*\)$/, // IMG-20240313-WA0004.jpg (file attached)
  /^(?:🚫\s*)?(?:this message was deleted|you deleted this message)\.?$/i,
  /^null$/i,
  /^(?:image|video|audio|sticker|gif|document|contact card|voice message) omitted$/i,
  /^(?:missed (?:voice|video) call|(?:voice|video) call, .*)$/i,
  /^location: https?:\/\//i,
  /^waiting for this message\b/i,
];

/** Read the Messages out of an export's text. Throws {@link ExportError} when there are none. */
export function parseWhatsApp(text: string): WhatsAppExport {
  const messages: ExportedMessage[] = [];
  let open: { details: Omit<ExportedMessage, 'text'>; lines: string[] } | null = null;

  const close = () => {
    if (!open) return;
    const spoken = spokenText(open.lines.join('\n'));
    if (spoken !== null) messages.push({ ...open.details, text: spoken });
    open = null;
  };

  for (const line of text.replace(/^﻿/, '').split(/\r\n?|\n/)) {
    const header = readHeader(line.replace(LEADING_MARKS, ''));
    if (header === null) {
      open?.lines.push(line);
      continue;
    }
    close();
    // System text and attachments carry no sender, or start with U+200E after the colon.
    open = header.message ? { details: header.message.details, lines: [header.message.firstLine] } : null;
  }
  close();

  if (messages.length === 0) {
    throw new ExportError('No WhatsApp Messages were found in this file. Is it a chat exported from WhatsApp?');
  }
  return { messages };
}

interface Header {
  /** Null for a line that starts a system message: it is a header, but not a Message. */
  message: { details: Omit<ExportedMessage, 'text'>; firstLine: string } | null;
}

function readHeader(line: string): Header | null {
  const match = IOS_LINE.exec(line) ?? ANDROID_LINE.exec(line);
  if (!match) return null;
  const date = readDate(match[1]!, match[3]!, match[4]!);
  if (date === null) return null;

  const rest = match[5]!;
  const parts = SENDER_AND_TEXT.exec(rest);
  if (!parts || QUOTES.test(parts[1]!)) return { message: null };
  const body = parts[2] ?? '';
  if (/^\s*‎/.test(body)) return { message: null };

  const sender = parts[1]!.replace(ALL_MARKS, '').replace(/^~\s*/, '').replace(/\s+/g, ' ').trim();
  if (sender === '') return { message: null };
  return { message: { details: { sender, ...date }, firstLine: body } };
}

/** The date's parts, or null when it could not be a date in either order. */
function readDate(a: string, b: string, c: string): Pick<ExportedMessage, 'year' | 'first' | 'second' | 'yearFirst'> | null {
  if (a.length === 4) {
    // 2024-03-06: year, month, day.
    return c.length <= 2 && validDay(Number(b), Number(c))
      ? { year: Number(a), first: Number(b), second: Number(c), yearFirst: true }
      : null;
  }
  if (a.length > 2 || (c.length !== 2 && c.length !== 4)) return null;
  const first = Number(a);
  const second = Number(b);
  if (!(validDay(first, second) || validDay(second, first))) return null;
  return { year: c.length === 4 ? Number(c) : 2000 + Number(c), first, second, yearFirst: false };
}

function validDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** The Message's own words, or null when it is a placeholder, a deletion or empty. */
function spokenText(raw: string): string | null {
  const text = raw.replace(EDITED_MARKER, '').trim();
  return text === '' || NOT_SPEECH.some((placeholder) => placeholder.test(text)) ? null : text;
}

/** Who sent how many Messages, most first. */
export function senderCounts(exported: WhatsAppExport): SenderCount[] {
  const counts = new Map<Sender, number>();
  for (const message of exported.messages) counts.set(message.sender, (counts.get(message.sender) ?? 0) + 1);
  return [...counts].map(([name, messages]) => ({ name, messages })).sort((a, b) => b.messages - a.messages);
}

/**
 * The day/month order, when the export settles it: any first component over 12 is a day,
 * any second component over 12 is a day. Null when every date reads validly both ways
 * round, and the Giver has to say which. Order cannot matter, and is day first, when no
 * date has differing components.
 */
export function inferDateOrder(exported: WhatsAppExport): DateOrder | null {
  let dayFirst = 0;
  let monthFirst = 0;
  let matters = false;
  for (const message of exported.messages) {
    if (message.yearFirst) continue;
    if (message.first > 12) dayFirst++;
    if (message.second > 12) monthFirst++;
    if (message.first !== message.second) matters = true;
  }
  if (dayFirst + monthFirst > 0) return monthFirst > dayFirst ? 'month-first' : 'day-first';
  return matters ? null : 'day-first';
}

/** One Message from these people to ask the Giver about, or null when the order does not matter. */
export function dateQuestion(exported: WhatsAppExport, people: readonly Sender[]): DateQuestion | null {
  if (inferDateOrder(exported) !== null) return null;
  const candidates = exported.messages.filter((message) => !message.yearFirst && message.first !== message.second && people.includes(message.sender));
  const sample = candidates.find((message) => message.text.length <= 140) ?? candidates[0];
  if (!sample) return null;
  return {
    sender: sample.sender,
    text: sample.text,
    dayFirst: isoDate(sample.year, sample.second, sample.first),
    monthFirst: isoDate(sample.year, sample.first, sample.second),
  };
}

/** Apply a day/month order to the export's dates and return its Conversation. */
export function toConversation(exported: WhatsAppExport, order: DateOrder): Conversation {
  const dated = exported.messages.map((message, position) => ({ message, position, date: dateOf(message, order) }));
  // A chat export is already in time order; sorting (stably) only guards against odd files.
  dated.sort((a, b) => (a.date === b.date ? a.position - b.position : a.date < b.date ? -1 : 1));

  const messages = dated.map(
    ({ message, date }, ordinal): Message => ({ ordinal, sender: message.sender, date, approximate: false, text: message.text }),
  );
  return { kind: 'chat', senders: [...new Set(messages.map((message) => message.sender))], messages };
}

function dateOf(message: ExportedMessage, order: DateOrder): IsoDate {
  if (message.yearFirst) return isoDate(message.year, message.first, message.second);
  const [month, day] = order === 'day-first' ? [message.second, message.first] : [message.first, message.second];
  // A date impossible in the chosen order (31/04 read month first) can only have meant the other.
  return validDay(month, day) ? isoDate(message.year, month, day) : isoDate(message.year, day, month);
}

function isoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
