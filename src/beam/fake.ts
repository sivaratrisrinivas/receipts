// A scriptable Beam port for tests, local development and the eval harness.

import type { BeamCompletion, BeamPort, BeamProgress, BeamRequest } from './port';

/** One pick as Beam would return it; extra fields model a misbehaving Beam. */
export interface FakePick {
  id: string;
  note: string;
  callbacks?: string[];
  [extra: string]: unknown;
}

export type FakeReply =
  /** A well-formed answer. */
  | { picks: FakePick[] }
  /** Beam ran out of completion budget while reasoning. */
  | { truncated: true }
  /** Arbitrary content, for malformed answers. */
  | { raw: string | null };

export interface FakeBeamOptions {
  /** Reasoning-token counts to report as progress before answering. */
  reasoningProgress?: number[];
}

export interface FakeBeam extends BeamPort {
  /** Every request the pipeline sent, in order. */
  readonly requests: readonly BeamRequest[];
}

/** The script sees the request, so it can pick Snippet IDs out of the prompt it was given. */
export function createFakeBeam(script: (request: BeamRequest) => FakeReply, options: FakeBeamOptions = {}): FakeBeam {
  const requests: BeamRequest[] = [];
  return {
    requests,
    async complete(request, onProgress?: (progress: BeamProgress) => void): Promise<BeamCompletion> {
      requests.push(request);
      for (const reasoningTokens of options.reasoningProgress ?? []) onProgress?.({ reasoningTokens });
      const reply = script(request);
      if ('truncated' in reply) return { content: null, finishReason: 'length' };
      if ('raw' in reply) return { content: reply.raw, finishReason: 'stop' };
      const lines = reply.picks.map((pick) => ({ callbacks: [], ...pick }));
      return { content: JSON.stringify({ lines }), finishReason: 'stop' };
    },
  };
}
