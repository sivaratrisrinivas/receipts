// What the Giver sees when making a Poem fails: a plain message, and what they can do next.

import { BeamError } from '../beam/port';
import type { NotEnough } from '../pipeline';

export type FailureKind =
  | 'credits'
  | 'network'
  | 'too-long'
  | 'unavailable'
  | 'truncated'
  | 'bad-answer'
  | 'wrong-size'
  | 'signed-out'
  | 'rate-limit'
  | 'not-enough'
  | 'unknown';

export interface Failure {
  kind: FailureKind;
  title: string;
  message: string;
  /** An optional link that helps the Giver fix the cause. */
  help?: { label: string; href: string };
  /** What the one main button does: run the same request again, sign in first, or go back to the choices. */
  recovery: { action: 'retry' | 'sign-in' | 'change'; label: string };
}

export const BILLING_URL = 'https://huggingface.co/settings/billing';

const RETRY = { action: 'retry', label: 'Try again' } as const;

export function describeFailure(error: unknown): Failure {
  if (error instanceof BeamError) {
    if (error.status === 402) {
      return {
        kind: 'credits',
        title: 'Out of credits',
        message:
          'Your Hugging Face account has run out of Inference credits, so Beam cannot read the Conversation. Add credits, then try again.',
        help: { label: 'Add credits on Hugging Face', href: BILLING_URL },
        recovery: RETRY,
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        kind: 'signed-out',
        title: 'Signed out',
        message: 'Hugging Face no longer accepts your sign-in, most likely because it expired. Sign in again to carry on.',
        recovery: { action: 'sign-in', label: 'Sign in again' },
      };
    }
    if (error.status === 429) {
      return {
        kind: 'rate-limit',
        title: 'Too many requests',
        message: 'Hugging Face asked us to slow down. Wait a moment, then try again.',
        recovery: RETRY,
      };
    }
    if (error.reason === 'truncated') {
      return {
        kind: 'truncated',
        title: 'Beam did not finish',
        message:
          'Beam sometimes runs out of room on a very long Conversation before it finishes choosing. Try again; it can take a few attempts.',
        recovery: RETRY,
      };
    }
    if (error.reason === 'invalid-response') {
      return {
        kind: 'bad-answer',
        title: 'Beam stumbled',
        message: 'Beam answered, but we could not use the answer. Trying again usually works.',
        recovery: RETRY,
      };
    }
    if (error.reason === 'wrong-size') {
      // The error's own message is the plain reason, with the numbers.
      return { kind: 'wrong-size', title: 'Beam gave the wrong number of Lines', message: error.message, recovery: RETRY };
    }
    if (error.reason === 'stopped') {
      return {
        kind: 'unavailable',
        title: 'Beam stopped early',
        message: 'Beam stopped part-way through its answer. This can happen with a very long Conversation. Try again.',
        recovery: RETRY,
      };
    }
    if (error.reason === 'http') return describeStatus(error.status);
    return network();
  }
  // `fetch` rejects with a TypeError when a request never gets through (offline, blocked).
  if (error instanceof TypeError) return network();
  return {
    kind: 'unknown',
    title: 'Something went wrong',
    message: 'Something unexpected happened while making your Poem. Trying again may help.',
    recovery: RETRY,
  };
}

/**
 * The Conversation is too small for a Poem. Not an error and not worth retrying: the
 * Giver is told so, and can go back to their choices.
 */
export function describeNotEnough({ usableSnippets, needed }: NotEnough): Failure {
  return {
    kind: 'not-enough',
    title: 'Not enough here yet for a Poem',
    message:
      usableSnippets === 0
        ? `Nothing in this Conversation can go in a Poem yet. It takes at least ${needed} things the two of you have said to each other.`
        : `Only ${usableSnippets} of the things the two of you have said can go in a Poem, and it takes at least ${needed}. Come back when there is more to draw on.`,
    recovery: { action: 'change', label: 'Change my choices' },
  };
}

/** An HTTP failure other than the ones with a meaning of their own (credits, sign-in, rate limit). */
function describeStatus(status: number | undefined): Failure {
  if (status === 400 || status === 413 || status === 422) {
    return {
      kind: 'too-long',
      title: 'Too much to read at once',
      message:
        'Beam would not take this request, most likely because the Conversation is longer than it can read in one go. Trying again may fail the same way; a shorter chat is more likely to work.',
      recovery: RETRY,
    };
  }
  if (status === 408 || (status !== undefined && status >= 500)) {
    return {
      kind: 'unavailable',
      title: 'Beam is not answering',
      message: `Beam, or the Hugging Face service in front of it, had a problem on its side (error ${status}). Very long Conversations can time out there. Wait a moment, then try again.`,
      recovery: RETRY,
    };
  }
  return {
    kind: 'unknown',
    title: 'Something went wrong',
    message: `Beam answered with an error we did not expect${status === undefined ? '' : ` (error ${status})`}. Trying again may help.`,
    recovery: RETRY,
  };
}

function network(): Failure {
  return {
    kind: 'network',
    title: 'Lost the connection',
    message: 'The connection to Beam did not hold. Check your connection and try again.',
    recovery: RETRY,
  };
}
