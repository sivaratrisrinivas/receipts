// The real Beam adapter, exercised at its edge with a fake `fetch` that streams
// synthetic server-sent events. (The live smoke script covers the real service.)

import { describe, expect, test } from 'vitest';
import { BeamError, type BeamRequest } from '../src';
import { createHfBeam } from '../src/beam/hf';

const request: BeamRequest = {
  system: 'Choose Snippets.',
  user: 's0 Hello there.',
  responseFormat: { name: 'poem', schema: { type: 'object', additionalProperties: false } },
};

/** A fake `fetch` that streams the given SSE text in awkward chunks, and records the request. */
function streamingFetch(sseText: string, sent: { init?: RequestInit } = {}): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.init = init as RequestInit;
    const bytes = new TextEncoder().encode(sseText);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let at = 0; at < bytes.length; at += 37) controller.enqueue(bytes.slice(at, at + 37));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }) as typeof fetch;
}

const event = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
const reasoning = (n: number) => Array.from({ length: n }, () => event({ choices: [{ delta: { reasoning_content: 'x' } }] })).join('');

describe('the Hugging Face Beam adapter', () => {
  test('asks for streamed, low-effort, strict-JSON-schema completion with a 60k budget, and reports progress', async () => {
    const sent: { init?: RequestInit } = {};
    const sse =
      reasoning(450) +
      event({ choices: [{ delta: { content: '{"lines":' }, finish_reason: null }] }) +
      event({ choices: [{ delta: { content: '[]}' }, finish_reason: 'stop' }] }) +
      event({ choices: [], usage: { prompt_tokens: 513_000, completion_tokens: 34_000, completion_tokens_details: { reasoning_tokens: 33_300 } } }) +
      'data: [DONE]\n\n';
    const beam = createHfBeam({ token: 'hf_test_token', fetch: streamingFetch(sse, sent) });
    const progress: number[] = [];

    const completion = await beam.complete(request, ({ reasoningTokens }) => progress.push(reasoningTokens));

    expect(JSON.parse(String(sent.init?.body))).toMatchObject({
      model: 'reflection/Beam-1.0-501B-A23B',
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: 'low',
      max_completion_tokens: 60_000,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'poem', strict: true, schema: request.responseFormat.schema },
      },
    });
    expect(completion).toEqual({
      content: '{"lines":[]}',
      finishReason: 'stop',
      usage: { promptTokens: 513_000, completionTokens: 34_000, reasoningTokens: 33_300 },
    });
    expect(progress).toEqual([200, 400, 33_300]);
  });

  test('a completion cut off by the token budget is a retryable error', async () => {
    const sse = reasoning(3) + event({ choices: [{ delta: {}, finish_reason: 'length' }] }) + 'data: [DONE]\n\n';
    const beam = createHfBeam({ token: 'hf_test_token', fetch: streamingFetch(sse) });

    await expect(beam.complete(request)).rejects.toMatchObject({ reason: 'truncated', retryable: true });
  });

  test('HTTP failures say what happened, are retryable only when trying again could help, and never leak the token', async () => {
    const failing = (status: number, body: string) =>
      createHfBeam({ token: 'hf_secret_value', fetch: (async () => new Response(body, { status })) as typeof fetch });

    const outOfCredits = await failing(402, JSON.stringify({ error: 'You have exceeded your credits' }))
      .complete(request)
      .catch((e: unknown) => e);
    const gateway = await failing(502, '<html>Bad gateway</html>').complete(request).catch((e: unknown) => e);

    expect(outOfCredits).toBeInstanceOf(BeamError);
    expect(outOfCredits).toMatchObject({ reason: 'http', retryable: false });
    expect((outOfCredits as BeamError).message).toContain('402');
    expect(gateway).toMatchObject({ reason: 'http', retryable: true });
    for (const error of [outOfCredits, gateway]) expect((error as BeamError).message).not.toContain('hf_secret_value');
  });

  test('an HTTP failure carries its status, so callers can tell out-of-credits from a sign-in that expired', async () => {
    const failing = (status: number) =>
      createHfBeam({ token: 'hf_test_token', fetch: (async () => new Response('nope', { status })) as typeof fetch });

    const statuses = await Promise.all(
      [401, 402, 429, 503].map((status) => failing(status).complete(request).catch((e: unknown) => (e as BeamError).status)),
    );

    expect(statuses).toEqual([401, 402, 429, 503]);
  });

  test('an error event in the middle of the stream is Beam stopping, not a lost connection', async () => {
    const sse = reasoning(3) + event({ error: { message: 'upstream overloaded' } }) + 'data: [DONE]\n\n';
    const beam = createHfBeam({ token: 'hf_test_token', fetch: streamingFetch(sse) });

    await expect(beam.complete(request)).rejects.toMatchObject({ reason: 'stopped', retryable: true });
  });

  test('a stream that breaks off is a retryable network error', async () => {
    const broken = (async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new TypeError('terminated'));
        },
      });
      return new Response(body, { status: 200 });
    }) as typeof fetch;

    await expect(createHfBeam({ token: 'hf_test_token', fetch: broken }).complete(request)).rejects.toMatchObject({ reason: 'network', retryable: true });
  });

  test('a request that never reaches Beam is a retryable network error', async () => {
    const beam = createHfBeam({
      token: 'hf_test_token',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });

    await expect(beam.complete(request)).rejects.toMatchObject({ reason: 'network', retryable: true });
  });
});
