// Domain vocabulary, as defined in GLOSSARY.md.

/** Who sent a Message. For now the Sender's display name is their identity. */
export type Sender = string;

/** Calendar date as `YYYY-MM-DD`; sorts correctly as a string. */
export type IsoDate = string;

export const OCCASIONS = [
  'birthday',
  'anniversary',
  'thank you',
  'sorry',
  'missing you',
  'farewell',
] as const;
export type Occasion = (typeof OCCASIONS)[number];

/** An Occasion as the Giver reads it on a button or a heading: `thank you` -> `Thank you`. */
export function occasionLabel(occasion: Occasion): string {
  return occasion.charAt(0).toUpperCase() + occasion.slice(1);
}

/** One thing one person sent the other: a chat message or a letter. */
export interface Message {
  /** Position in the Conversation, 0-based. Breaks ties between Messages on the same date. */
  ordinal: number;
  sender: Sender;
  date: IsoDate;
  /** True when the date was inferred rather than stated ("c." in the Receipt). */
  approximate: boolean;
  text: string;
}

/** The full exchange a Poem is drawn from. */
export interface Conversation {
  kind: 'letters' | 'chat';
  /** Distinct Senders, in order of first appearance. */
  senders: Sender[];
  /** In Conversation order (dates never decrease). */
  messages: Message[];
}

/** A verbatim piece of a Message; the smallest unit a Poem is built from. */
export interface Snippet {
  /** Short, stable within one Conversation (`s0`, `s1`, ...). What Beam refers to. */
  id: string;
  /** Position among all Snippets of the Conversation, 0-based. */
  index: number;
  messageOrdinal: number;
  sender: Sender;
  date: IsoDate;
  approximate: boolean;
  text: string;
}

/** The Sender and date shown under a Line. */
export interface Receipt {
  sender: Sender;
  date: IsoDate;
  approximate: boolean;
  /** Human date, e.g. `13 January 1845`, prefixed `c. ` when approximate. */
  dateLabel: string;
  /** The Message this Line came from, for linking back to context. */
  messageOrdinal: number;
}

/** A Snippet placed in a Poem. */
export interface Line {
  snippetId: string;
  /** Always the Snippet's own text, looked up from the Conversation. */
  text: string;
  receipt: Receipt;
  /** Beam's private Note, or null when absent or dropped for citing unknown Snippets. */
  note: string | null;
  /** Snippet IDs the Note refers back to; always empty when `note` is null. */
  callbacks: string[];
}

/** An ordered set of Lines, every one a real Snippet, chosen for an Occasion. */
export interface Poem {
  occasion: Occasion;
  giver: Sender;
  recipient: Sender;
  /** Sorted by date, ties by Message order. */
  lines: Line[];
  /**
   * The "every line is real" badge: set only when Beam named nothing that failed
   * verification (every pick resolved to a real Snippet).
   */
  verified: boolean;
}
