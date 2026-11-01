// Seam 2: what the Giver sees when making a Poem fails. An error goes in; a plain
// message and what the Giver can do next come out.

import { describe, expect, test } from 'vitest';
import { BeamError } from '../src';
import { describeFailure } from '../src/app/failure';

describe('describing a failure to the Giver', () => {
  test('out of credits says so, links to billing, and offers a retry once they have topped up', () => {
    const failure = describeFailure(new BeamError('http', 'Beam request failed (HTTP 402): exceeded credits', false, 402));

    expect(failure.kind).toBe('credits');
    expect(failure.message).toMatch(/credits/i);
    expect(failure.help).toEqual({ label: 'Add credits on Hugging Face', href: 'https://huggingface.co/settings/billing' });
    expect(failure.recovery).toEqual({ action: 'retry', label: 'Try again' });
  });

  test.each([
    ['Beam could not be reached', new BeamError('network', 'Could not reach Beam.', true)],
    ['the connection dropped mid-answer', new BeamError('network', 'The connection dropped.', true)],
    ['a request outside Beam, such as loading the Gallery, never got through', new TypeError('Failed to fetch')],
  ])('a network error (%s) asks the Giver to check their connection and offers a retry', (_case, error) => {
    const failure = describeFailure(error);

    expect(failure.kind).toBe('network');
    expect(failure.message).toMatch(/connection/i);
    expect(failure.help).toBeUndefined();
    expect(failure.recovery).toEqual({ action: 'retry', label: 'Try again' });
  });

  test('a truncated answer says Beam ran out of room on a long Conversation, without promising a retry will work', () => {
    const failure = describeFailure(new BeamError('truncated', 'Beam ran out of room.', true));

    expect(failure.kind).toBe('truncated');
    expect(failure.message).toMatch(/runs out of room/i);
    expect(failure.message).toMatch(/long/i);
    expect(failure.message).not.toMatch(/usually/i);
    expect(failure.recovery).toEqual({ action: 'retry', label: 'Try again' });
  });

  test.each([400, 413, 422])('Beam refusing the request (HTTP %i) says the Conversation is probably too long, not that the connection failed', (status) => {
    const failure = describeFailure(new BeamError('http', `Beam request failed (HTTP ${status})`, false, status));

    expect(failure.kind).toBe('too-long');
    expect(failure.message).toMatch(/too long|longer than/i);
    expect(failure.message).not.toMatch(/connection/i);
    expect(failure.recovery).toEqual({ action: 'retry', label: 'Try again' });
  });

  test.each([500, 502, 503, 504])('a server error (HTTP %i) says Beam or Hugging Face had a problem, not that the connection failed', (status) => {
    const failure = describeFailure(new BeamError('http', `Beam request failed (HTTP ${status})`, true, status));

    expect(failure.kind).toBe('unavailable');
    expect(failure.message).toMatch(/problem|trouble/i);
    expect(failure.message).toContain(String(status));
    expect(failure.message).not.toMatch(/check your connection/i);
    expect(failure.recovery).toEqual({ action: 'retry', label: 'Try again' });
  });

  test('Beam stopping part-way through its answer is not described as a lost connection', () => {
    const failure = describeFailure(new BeamError('stopped', 'Beam stopped mid-answer: overloaded', true));

    expect(failure.kind).toBe('unavailable');
    expect(failure.message).toMatch(/stopped/i);
    expect(failure.message).not.toMatch(/check your connection/i);
    expect(failure.recovery).toEqual({ action: 'retry', label: 'Try again' });
  });

  test('an HTTP status nobody planned for is reported as unexpected, with the status', () => {
    const failure = describeFailure(new BeamError('http', 'Beam request failed (HTTP 404)', false, 404));

    expect(failure.kind).toBe('unknown');
    expect(failure.message).toContain('404');
    expect(failure.recovery.action).toBe('retry');
  });

  test('an answer that is not a usable Poem says Beam stumbled, and a retry may work', () => {
    const failure = describeFailure(new BeamError('invalid-response', 'Beam did not pick any real Snippet.', true));

    expect(failure.kind).toBe('bad-answer');
    expect(failure.message).toMatch(/could not use/i);
    expect(failure.recovery).toEqual({ action: 'retry', label: 'Try again' });
  });

  test.each([401, 403])('an expired or refused sign-in (HTTP %i) asks the Giver to sign in again instead of retrying', (status) => {
    const failure = describeFailure(new BeamError('http', `Beam request failed (HTTP ${status})`, false, status));

    expect(failure.kind).toBe('signed-out');
    expect(failure.message).toMatch(/sign in/i);
    expect(failure.recovery).toEqual({ action: 'sign-in', label: 'Sign in again' });
  });

  test('being rate limited asks the Giver to wait a moment, then retry', () => {
    const failure = describeFailure(new BeamError('http', 'Beam request failed (HTTP 429)', true, 429));

    expect(failure.kind).toBe('rate-limit');
    expect(failure.message).toMatch(/moment/i);
    expect(failure.recovery.action).toBe('retry');
  });

  test('anything unexpected still gets a message and a retry, rather than a blank screen', () => {
    const failure = describeFailure(new Error('boom'));

    expect(failure.kind).toBe('unknown');
    expect(failure.recovery).toEqual({ action: 'retry', label: 'Try again' });
    expect(describeFailure('not even an Error').kind).toBe('unknown');
  });
});
