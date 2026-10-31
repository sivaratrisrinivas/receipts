// Seam 5: the app's flow. A Giver signs in, picks an Occasion, and makes a Poem; things
// go wrong and they retry. Auth, the Gallery texts and Beam are all stand-ins; the UI is
// not involved, only the state it renders.

import { describe, expect, test } from 'vitest';
import { BeamError, createFakeBeam, type BeamPort } from '../src';
import { createApp, type AppDeps } from '../src/app/app';
import type { AuthPort, Session } from '../src/app/auth';
import { volumeOne, volumeTwo } from './fixtures/gallery';

const session: Session = { accessToken: 'hf_test', expiresAt: Date.now() + 3_600_000, username: 'giver' };

/** A fake Beam that always picks the first Snippet it is shown. */
function pickingBeam() {
  return createFakeBeam(
    (request) => ({ picks: [{ id: /^(s\d+) /m.exec(request.user)![1]!, note: 'The very first thing.' }] }),
    { reasoningProgress: [200, 400] },
  );
}

/** Wraps a Beam port so that its first calls fail with the given errors. */
function failingFirst(beam: BeamPort, ...errors: unknown[]): BeamPort {
  return {
    complete(request, onProgress) {
      return errors.length > 0 ? Promise.reject(errors.shift()) : beam.complete(request, onProgress);
    },
  };
}

function setup(options: { restored?: Session | null; notice?: string; beam?: BeamPort; loadSource?: AppDeps['loadSource'] } = {}) {
  const calls = { signIn: 0, signOut: 0, forgot: 0 };
  const auth: AuthPort = {
    restore: async () => ({ session: options.restored === undefined ? session : options.restored, ...(options.notice ? { notice: options.notice } : {}) }),
    signIn: async () => void calls.signIn++,
    signOut: () => void calls.signOut++,
    forget: () => void calls.forgot++,
  };
  const beam = options.beam ?? pickingBeam();
  const app = createApp({
    auth,
    loadSource: options.loadSource ?? (async () => ({ kind: 'gallery', texts: [volumeOne, volumeTwo] })),
    makeBeam: () => beam,
    now: () => 0,
  });
  return { app, calls, beam };
}

describe('the Giver signs in', () => {
  test('without a session the Giver is asked to sign in; with one they go straight to choosing an Occasion', async () => {
    const signedOut = setup({ restored: null });
    await signedOut.app.init();
    const signedIn = setup();
    await signedIn.app.init();

    expect(signedOut.app.getState().step).toBe('sign-in');
    expect(signedIn.app.getState().step).toBe('compose');
    expect(signedIn.app.getState().session?.username).toBe('giver');
  });

  test('a sign-in that went wrong shows its notice on the sign-in step', async () => {
    const { app } = setup({ restored: null, notice: 'access_denied: you declined' });
    await app.init();

    expect(app.getState()).toMatchObject({ step: 'sign-in', notice: 'access_denied: you declined' });
  });

  test('signing out forgets the session and goes back to sign-in', async () => {
    const { app, calls } = setup();
    await app.init();

    app.signOut();

    expect(calls.signOut).toBe(1);
    expect(app.getState()).toMatchObject({ step: 'sign-in', session: null });
  });
});

describe('making a Gallery Poem', () => {
  test('the Giver picks an Occasion and a note, Beam reads, and the Poem is ready with its Receipts', async () => {
    const { app, beam } = setup();
    await app.init();
    app.edit({ occasion: 'birthday', note: 'she just retired' });

    const finished = app.start();
    expect(app.getState().step).toBe('reading');
    await finished;

    const state = app.getState();
    expect(state.step).toBe('poem');
    expect(state.outcome?.poem).toMatchObject({ occasion: 'birthday', giver: 'Robert', recipient: 'Elizabeth', verified: true });
    expect(state.outcome?.poem.lines[0]?.receipt.sender).toBe('Robert');
    expect((beam as ReturnType<typeof pickingBeam>).requests[0]?.system).toContain('she just retired');
  });

  test('while Beam reads, the Giver can see how far along it is', async () => {
    const { app } = setup();
    await app.init();
    const seen: number[] = [];
    app.subscribe((state) => {
      if (state.step === 'reading' && state.attempt) seen.push(state.attempt.progress.reasoningTokens);
    });

    await app.start();

    expect(seen).toContain(400);
  });

  test('an empty note is left out, not sent as blank context', async () => {
    const { app, beam } = setup();
    await app.init();
    app.edit({ note: '   ' });

    await app.start();

    expect((beam as ReturnType<typeof pickingBeam>).requests[0]?.system).not.toContain('Context from the Giver');
  });

  test('after the Poem, the Giver can go back and make another', async () => {
    const { app } = setup();
    await app.init();
    app.edit({ occasion: 'farewell', note: 'moving away' });
    await app.start();

    app.again();

    expect(app.getState()).toMatchObject({ step: 'compose', outcome: null, compose: { occasion: 'farewell', note: 'moving away' } });
  });
});

describe('when making the Poem fails', () => {
  test('out of credits: a clear message, then a retry that repeats the same request and succeeds', async () => {
    const beam = pickingBeam();
    const { app } = setup({ beam: failingFirst(beam, new BeamError('http', 'Beam request failed (HTTP 402)', false, 402)) });
    await app.init();
    app.edit({ occasion: 'sorry', note: 'I forgot the dinner' });

    await app.start();
    expect(app.getState()).toMatchObject({ step: 'failed', failure: { kind: 'credits', recovery: { action: 'retry' } } });

    await app.retry();

    expect(app.getState().step).toBe('poem');
    expect(app.getState().outcome?.poem.occasion).toBe('sorry');
    expect(beam.requests[0]?.system).toContain('I forgot the dinner');
  });

  test('a dropped connection and a truncated answer can each be retried until Beam gets through', async () => {
    const { app } = setup({
      beam: failingFirst(
        pickingBeam(),
        new BeamError('network', 'The connection dropped.', true),
        new BeamError('truncated', 'Beam ran out of room.', true),
      ),
    });
    await app.init();

    await app.start();
    expect(app.getState().failure?.kind).toBe('network');
    await app.retry();
    expect(app.getState().failure?.kind).toBe('truncated');
    await app.retry();

    expect(app.getState()).toMatchObject({ step: 'poem', failure: null });
  });

  test('failing to load the Conversation is a network failure that can be retried', async () => {
    let attempts = 0;
    const { app } = setup({
      loadSource: async () => {
        if (attempts++ === 0) throw new TypeError('Failed to fetch');
        return { kind: 'gallery', texts: [volumeOne, volumeTwo] };
      },
    });
    await app.init();

    await app.start();
    expect(app.getState().failure?.kind).toBe('network');
    await app.retry();

    expect(app.getState().step).toBe('poem');
  });

  test('an expired sign-in forgets the session, and "Sign in again" starts sign-in rather than retrying', async () => {
    const { app, calls } = setup({ beam: failingFirst(pickingBeam(), new BeamError('http', 'Beam request failed (HTTP 401)', false, 401)) });
    await app.init();

    await app.start();

    expect(calls.forgot).toBe(1);
    expect(app.getState()).toMatchObject({ step: 'failed', session: null, failure: { kind: 'signed-out', recovery: { action: 'sign-in' } } });

    await app.recover();

    expect(calls.signIn).toBe(1);
  });

  test('choosing a different Occasion after a failure goes back to the picker with the choices kept', async () => {
    const { app } = setup({ beam: failingFirst(pickingBeam(), new BeamError('truncated', 'Beam ran out of room.', true)) });
    await app.init();
    app.edit({ occasion: 'missing you', note: 'since March' });
    await app.start();

    app.again();

    expect(app.getState()).toMatchObject({ step: 'compose', failure: null, compose: { occasion: 'missing you', note: 'since March' } });
  });
});
