// The real Beam adapter: the Hugging Face router (provider Baseten), called with the
// Giver's own token, streaming. Uses only `fetch` and web streams, so it runs in Node
// and in the browser alike.
//
// Settings come from the prototype's findings: `reasoning_effort: "low"` is the only
// level that finishes on a ~500k-token input; `medium` and `high` spend the whole
// completion budget reasoning and return no content. Long non-streaming calls can hit
// a gateway error page, so the call always streams.

import {
  BeamError,
  type BeamCompletion,
  type BeamPort,
  type BeamProgress,
  type BeamRequest,
  type BeamUsage,
  requireContent,
} from './port';

export const BEAM_MODEL = 'reflection/Beam-1.0-501B-A23B';
export const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';

export interface HfBeamOptions {
  /** The Giver's Hugging Face token. Sent only as the Authorization header; never logged. */
  token: string;
  model?: string;
  url?: string;
  maxCompletionTokens?: number;
  fetch?: typeof fetch;
}

/** Report reasoning progress every this many streamed reasoning chunks. */
const PROGRESS_EVERY = 200;

export function createHfBeam(options: HfBeamOptions): BeamPort {
  const { token, model = BEAM_MODEL, url = HF_ROUTER_URL, maxCompletionTokens = 60_000 } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async complete(request: BeamRequest, onProgress?: (progress: BeamProgress) => void): Promise<BeamCompletion> {
      let response: Response;
      try {
        response = await doFetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user },
            ],
            stream: true,
            stream_options: { include_usage: true },
            reasoning_effort: 'low',
            max_completion_tokens: maxCompletionTokens,
            response_format: {
              type: 'json_schema',
              json_schema: { name: request.responseFormat.name, strict: true, schema: request.responseFormat.schema },
            },
          }),
        });
      } catch {
        throw new BeamError('network', 'Could not reach Beam. Check your connection and try again.', true);
      }

      if (!response.ok || response.body === null) throw await httpError(response);

      const completion = await readStream(response.body, onProgress);
      // A completion that ran out of budget, or came back empty, is a retryable error here too.
      requireContent(completion);
      return completion;
    },
  };
}

async function httpError(response: Response): Promise<BeamError> {
  let detail = '';
  try {
    const body = (await response.text()).slice(0, 500);
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } | string };
      detail = typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? '');
    } catch {
      detail = body.startsWith('<') ? 'the gateway returned an error page' : body;
    }
  } catch {
    // No readable body; the status alone will do.
  }
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
  return new BeamError(
    'http',
    `Beam request failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
    retryable,
    response.status,
  );
}

interface StreamEvent {
  choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  error?: { message?: string } | string;
}

async function readStream(
  body: ReadableStream<Uint8Array>,
  onProgress: ((progress: BeamProgress) => void) | undefined,
): Promise<BeamCompletion> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  // One object, so TypeScript does not narrow these to their initial values inside `handle`.
  const seen = { content: '', finishReason: null as string | null, usage: undefined as BeamUsage | undefined, reasoningChunks: 0 };

  const handle = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '' || data === '[DONE]') return;

    let event: StreamEvent;
    try {
      event = JSON.parse(data) as StreamEvent;
    } catch {
      return; // A garbled keep-alive; the next event carries on.
    }
    if (event.error) {
      const message = typeof event.error === 'string' ? event.error : (event.error.message ?? 'unknown error');
      throw new BeamError('http', `Beam stopped mid-answer: ${message}`, true);
    }
    if (event.usage) {
      seen.usage = {
        promptTokens: event.usage.prompt_tokens ?? 0,
        completionTokens: event.usage.completion_tokens ?? 0,
        reasoningTokens: event.usage.completion_tokens_details?.reasoning_tokens ?? 0,
      };
    }
    const choice = event.choices?.[0];
    if (!choice) return;
    seen.content += choice.delta?.content ?? '';
    if (choice.delta?.reasoning_content || choice.delta?.reasoning) {
      seen.reasoningChunks++;
      if (seen.reasoningChunks % PROGRESS_EVERY === 0) onProgress?.({ reasoningTokens: seen.reasoningChunks });
    }
    seen.finishReason = choice.finish_reason ?? seen.finishReason;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        handle(pending.slice(0, newline).trim());
        pending = pending.slice(newline + 1);
      }
    }
    handle(pending.trim());
  } catch (error) {
    if (error instanceof BeamError) throw error;
    throw new BeamError('network', 'The connection to Beam dropped while it was answering. Try again.', true);
  }

  // The final usage figure is exact; it replaces the running estimate.
  onProgress?.({ reasoningTokens: seen.usage?.reasoningTokens || seen.reasoningChunks });

  const completion: BeamCompletion = { content: seen.content === '' ? null : seen.content, finishReason: seen.finishReason };
  if (seen.usage) completion.usage = seen.usage;
  return completion;
}
