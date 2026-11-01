// What the Giver sees when making a Poem fails: a plain message, and what they can do next.

import { BeamError } from '../beam/port';
import type { NotEnough } from '../pipeline';

export type FailureKind =
  | 'credits'
  | 'network'
  | 'truncated'
  | 'bad-answer'
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
          'Beam ran out of room before it finished choosing. This happens now and then with a long Conversation; trying again usually works.',
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

function network(): Failure {
  return {
    kind: 'network',
    title: 'Lost the connection',
    message: 'The connection to Beam did not hold. Check your connection and try again.',
    recovery: RETRY,
  };
}
