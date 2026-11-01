// Bringing a WhatsApp chat: the state of the steps between "use my own chat" and "ready
// to choose an Occasion", and the words the Giver reads on the way. Pure: no I/O, no DOM.
// The parsed export itself stays in app.ts; the state holds what the screens show.
//
// The steps: upload -> people (which one is you, who is it for) -> date-order (only when
// the export cannot say) -> review (the count and the privacy statement) -> compose.

import type { Sender } from '../domain';
import type { ChatReading } from './chat-reading';
import type { DateOrder, DateQuestion, SenderCount } from '../sources/whatsapp';
import type { Action, AppState, StepId } from './state';

/** Said to the Giver before anything is sent. */
export const PRIVACY_STATEMENT =
  "Your chat never touches Receipts' server. It goes from this browser straight to Beam, through Hugging Face, under your own account.";

/** A chat the Giver has brought, and what they have said about it so far. */
export interface ChatDraft {
  fileName: string;
  /** Everyone who wrote at least one Message, most Messages first. */
  senders: SenderCount[];
  giver: Sender | null;
  recipient: Sender | null;
  /** What the export itself settles; null when the Giver has to say. */
  inferredOrder: DateOrder | null;
  /** The Message to ask about, once the people are chosen and the order is still open. */
  question: DateQuestion | null;
  /** The order the Poem will use: inferred, or the Giver's answer. Null until known. */
  dateOrder: DateOrder | null;
  /** What will be sent, once the people are chosen; null until then. */
  reading: ChatReading | null;
}

/** The upload step: reading the file, and why a file was refused. */
export interface UploadStatus {
  busy: boolean;
  error: string | null;
}

export const idleUpload: UploadStatus = { busy: false, error: null };

export type UploadAction =
  | { type: 'upload-begun' }
  | { type: 'upload-reading' }
  | { type: 'upload-failed'; message: string }
  | { type: 'upload-read'; chat: ChatDraft }
  | { type: 'person-chosen'; role: 'giver' | 'recipient'; name: Sender }
  | { type: 'people-confirmed'; question: DateQuestion | null; reading: ChatReading }
  | { type: 'date-order-chosen'; order: DateOrder }
  | { type: 'chat-confirmed' }
  | { type: 'source-gallery' }
  | { type: 'back' };

const UPLOAD_ACTIONS: ReadonlySet<string> = new Set<UploadAction['type']>([
  'upload-begun',
  'upload-reading',
  'upload-failed',
  'upload-read',
  'person-chosen',
  'people-confirmed',
  'date-order-chosen',
  'chat-confirmed',
  'source-gallery',
  'back',
]);

export function isUploadAction(action: Action): action is UploadAction {
  return UPLOAD_ACTIONS.has(action.type);
}

export function reduceUpload(state: AppState, action: UploadAction): AppState {
  const { chat } = state;
  switch (action.type) {
    case 'upload-begun':
      return { ...state, step: 'upload', source: 'gallery', chat: null, upload: idleUpload };
    case 'upload-reading':
      return { ...state, upload: { busy: true, error: null } };
    case 'upload-failed':
      return { ...state, upload: { busy: false, error: action.message } };
    case 'upload-read':
      return { ...state, step: 'people', chat: action.chat, upload: idleUpload };
    case 'person-chosen': {
      if (!chat || !chat.senders.some((sender) => sender.name === action.name)) return state;
      // A new choice invalidates anything worked out from the old one.
      const reset = { question: null, dateOrder: null, reading: null };
      if (action.role === 'recipient') {
        return action.name === chat.giver ? state : { ...state, chat: { ...chat, ...reset, recipient: action.name } };
      }
      const others = chat.senders.filter((sender) => sender.name !== action.name);
      // In a chat between two, saying who you are says who it is for.
      const recipient = others.length === 1 ? others[0]!.name : chat.recipient === action.name ? null : chat.recipient;
      return { ...state, chat: { ...chat, ...reset, giver: action.name, recipient } };
    }
    case 'people-confirmed': {
      if (!chat?.giver || !chat.recipient) return state;
      // When the order cannot matter for these two people, there is nothing to ask.
      const dateOrder = chat.inferredOrder ?? (action.question ? null : 'day-first');
      return {
        ...state,
        step: action.question ? 'date-order' : 'review',
        chat: { ...chat, question: action.question, dateOrder, reading: action.reading },
      };
    }
    case 'date-order-chosen':
      return chat ? { ...state, step: 'review', chat: { ...chat, dateOrder: action.order } } : state;
    case 'chat-confirmed':
      return chat?.giver && chat.recipient && chat.dateOrder ? { ...state, step: 'compose', source: 'chat' } : state;
    case 'source-gallery':
      return { ...state, step: 'compose', source: 'gallery', chat: null, upload: idleUpload };
    case 'back': {
      const step = previousStep(state);
      if (step === null) return state;
      return step === 'upload' ? { ...state, step, chat: null, upload: idleUpload } : { ...state, step };
    }
  }
}

/** Where "Back" goes from the current step, or null where it goes nowhere. */
export function previousStep({ step, chat }: AppState): StepId | null {
  switch (step) {
    case 'upload':
      return 'compose';
    case 'people':
      return 'upload';
    case 'date-order':
      return 'people';
    case 'review':
      return chat?.question ? 'date-order' : 'people';
    default:
      return null;
  }
}

/** Said on the review step of every chat: Beam's model card says it was developed predominantly for English. */
export const LANGUAGE_NOTICE = 'Beam works best in English, so chats in other languages may give weaker results.';

/** Said instead when most of the letters are outside the Latin script. */
export const NON_LATIN_NOTICE =
  'This chat is mostly written in a script other than Latin. Beam works best in English, so the Poem may come out noticeably weaker. You can still continue.';

/** From this share of letters outside the Latin script, a chat counts as being mostly in another script. */
const MOSTLY_NON_LATIN = 0.5;

/** What the Giver is told before sending: how many Messages, where they go, and how well Beam is likely to read them. */
export function reviewOf(chat: ChatDraft): {
  count: number;
  headline: string;
  privacy: string;
  others: boolean;
  leftOut: number;
  leftOutNote: string | null;
  languageNotice: { text: string; strong: boolean };
} {
  const chosen = [chat.giver, chat.recipient];
  // Until the people are chosen only the file's own count is known; the screens that show this come after.
  const count = chat.reading?.sent ?? chat.senders.filter((sender) => chosen.includes(sender.name)).reduce((total, sender) => total + sender.messages, 0);
  const leftOut = chat.reading?.leftOut ?? 0;
  const noun = count === 1 ? 'Message' : 'Messages';
  const strong = (chat.reading?.nonLatinShare ?? 0) >= MOSTLY_NON_LATIN;
  return {
    count,
    headline: `${count.toLocaleString('en-US')} ${noun} from ${chat.recipient ?? 'them'} and you`,
    privacy: PRIVACY_STATEMENT,
    // Anyone else in the chat (a group) is left out entirely.
    others: chat.senders.some((sender) => !chosen.includes(sender.name)),
    leftOut,
    leftOutNote:
      leftOut === 0
        ? null
        : `${leftOut.toLocaleString('en-US')} ${leftOut === 1 ? 'Message with no words' : 'Messages with no words'} to read (a link, emoji or one-word reply) ${leftOut === 1 ? 'is' : 'are'} left out.`,
    languageNotice: { text: strong ? NON_LATIN_NOTICE : LANGUAGE_NOTICE, strong },
  };
}

/** The words on the Occasion step: they depend on whether the Poem is from the Gallery or from the Giver's chat. */
export function composeCopy({ source, chat }: Pick<AppState, 'source' | 'chat'>): {
  heading: string;
  lede: string;
  make: string;
  cost: string;
} {
  if (source === 'chat' && chat?.recipient) {
    return {
      heading: `Make a Poem for ${chat.recipient}`,
      lede: `Made only from things you and ${chat.recipient} really said to each other. Every line is a real Message, with who sent it and when.`,
      make: `Make the Poem for ${chat.recipient}`,
      cost: 'Beam reads your whole chat in one go, which usually takes under a minute and uses your Hugging Face credits.',
    };
  }
  return {
    heading: 'Make a Gallery Poem',
    lede: 'The Gallery is the 1845–1846 letters between Robert Browning and Elizabeth Barrett. You are Robert; the Poem is for Elizabeth.',
    make: 'Make my Gallery Poem',
    cost: 'Beam reads every letter in one go, which usually takes under a minute and costs about $0.15 (up to about $0.25) of your Hugging Face credits.',
  };
}
