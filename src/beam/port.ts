// The Beam port: the one interface the pipeline depends on. It runs in Node and
// in the browser, so nothing here may touch Node-only APIs.

/** A strict JSON-schema structured-output format. */
export interface ResponseFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface BeamRequest {
  system: string;
  user: string;
  responseFormat: ResponseFormat;
}

export interface BeamUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
}

export interface BeamCompletion {
  /** The final message content, or null when Beam produced none. */
  content: string | null;
  /** `stop` on a clean finish; `length` when the completion budget ran out. */
  finishReason: string | null;
  usage?: BeamUsage;
}

/** Reported while Beam reasons, before any content arrives. */
export interface BeamProgress {
  /** Reasoning tokens produced so far (approximate until the final usage arrives). */
  reasoningTokens: number;
}

export interface BeamPort {
  /**
   * Send the prompt, report reasoning progress as it streams, and resolve with the
   * final completion. Transport failures reject with a {@link BeamError}.
   */
  complete(request: BeamRequest, onProgress?: (progress: BeamProgress) => void): Promise<BeamCompletion>;
}

export type BeamErrorReason =
  /** Beam ran out of completion budget (or returned nothing) before answering. */
  | 'truncated'
  /** Beam answered, but not in the agreed shape, or with nothing usable. */
  | 'invalid-response'
  /** The HTTP request failed (status carried in the message). */
  | 'http'
  /** The request never reached Beam. */
  | 'network';

export class BeamError extends Error {
  readonly reason: BeamErrorReason;
  /** Whether trying the same request again might succeed. */
  readonly retryable: boolean;

  constructor(reason: BeamErrorReason, message: string, retryable: boolean) {
    super(message);
    this.name = 'BeamError';
    this.reason = reason;
    this.retryable = retryable;
  }
}

/**
 * The completion's content, or a retryable `truncated` error when Beam ran out of
 * budget (`finish_reason: length`) or returned no content.
 */
export function requireContent(completion: BeamCompletion): string {
  if (completion.finishReason === 'length' || completion.content === null || completion.content.trim() === '') {
    throw new BeamError(
      'truncated',
      'Beam ran out of room before finishing its answer. Trying again may work.',
      true,
    );
  }
  return completion.content;
}
