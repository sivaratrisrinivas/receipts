// Seam 5, continued: after the reveal the Giver works with the Poem through the app:
// removes a Line, replaces one, or regenerates the whole thing. Auth, the Gallery texts
// and Beam are stand-ins; the UI is not involved, only the state it renders.

import { describe, expect, test } from 'vitest';
import { BeamError, createFakeBeam, type BeamPort, type BeamRequest } from '../src';
import { createApp } from '../src/app/app';
import type { Session } from '../src/app/auth';
import { volumeOne, volumeTwo } from './fixtures/gallery';
import { idOf } from './support/prompt';

const session: Session = { accessToken: 'hf_test', expiresAt: Date.now() + 3_600_000, username: 'giver' };

const FIRST_POEM = [
  'I wrote this on a wet afternoon',
  'Come and see the sea',
  'The post comes at nine',
  'Dr. Chambers says I may walk',
  'I have read your letter again',
  'I am unhappy enough',
  'I never write more gladly',
];
const SECOND_POEM = ['Mr. Kenyon says', 'Thank you a thousand times', 'You were kind to come', 'Tell me what to mend', 'The winter will be long', 'At from half-past three'];

/**
 * A Beam that makes the first Poem, then the second on regenerating, and answers a
 * replacement with whatever `replacement` names (a fragment of the Snippet to choose).
 */
function scriptedBeam(options: { replacement?: string | ((request: BeamRequest) => string) } = {}) {
  let poems = 0;
  return createFakeBeam((request) => {
    if (request.responseFormat.name === 'replacement') {
      const choose = options.replacement ?? 'Thank you a thousand times';
      return { raw: JSON.stringify({ id: typeof choose === 'function' ? choose(request) : idOf(request, choose) }) };
    }
    const fragments = poems++ === 0 ? FIRST_POEM : SECOND_POEM;
    return { picks: fragments.map((fragment) => ({ id: idOf(request, fragment), note: `Why: ${fragment}.` })) };
  });
}

function setup(beam: BeamPort = scriptedBeam()) {
  let forgot = 0;
  const app = createApp({
    auth: { restore: async () => ({ session }), signIn: async () => {}, signOut() {}, forget: () => void forgot++ },
    loadSource: async () => ({ kind: 'gallery', texts: [volumeOne, volumeTwo] }),
    makeBeam: () => beam,
    now: () => 0,
  });
  return { app, beam, forgot: () => forgot };
}

const linesOf = (app: ReturnType<typeof setup>['app']) => app.getState().outcome!.poem.lines.map((line) => line.text.slice(0, 18));

async function withPoem(beam?: BeamPort) {
  const context = setup(beam);
  await context.app.init();
  context.app.edit({ occasion: 'birthday', note: 'she just retired' });
  await context.app.start();
  return context;
}

describe('removing a Line', () => {
  test('the Line is gone, the rest stay in date order, and it will not be offered as a replacement', async () => {
    const { app } = await withPoem();
    const [, , third] = app.getState().outcome!.poem.lines;

    app.removeLine(third!.snippetId);

    expect(linesOf(app)).toEqual(['I wrote this on a ', 'Come and see the s', 'Dr. Chambers says ', 'I have read your l', 'I am unhappy enoug', 'My own dearest, if']);
    expect(app.getState().editing.removed).toEqual([third!.snippetId]);
  });

  test('a Poem cannot go below 6 Lines: the seventh can be removed, the sixth cannot', async () => {
    const { app } = await withPoem();
    const [first, second] = app.getState().outcome!.poem.lines;
    expect(app.getState().outcome!.poem.lines).toHaveLength(7);

    app.removeLine(first!.snippetId);
    expect(app.getState().outcome!.poem.lines).toHaveLength(6);
    app.removeLine(second!.snippetId);

    expect(app.getState().outcome!.poem.lines).toHaveLength(6);
    expect(app.getState().editing.removed).toEqual([first!.snippetId]);
  });
});

describe('replacing a Line', () => {
  test('while Beam looks the Line is marked as being replaced; then the new Line takes its place', async () => {
    const { app } = await withPoem();
    const third = app.getState().outcome!.poem.lines[2]!;
    const seen: (string | null)[] = [];
    app.subscribe((state) => seen.push(state.editing.replacement?.snippetId ?? null));

    await app.replaceLine(third.snippetId);

    expect(seen).toEqual([third.snippetId, null]);
    expect(linesOf(app)).toEqual(['I wrote this on a ', 'Come and see the s', 'Thank you a thousa', 'Dr. Chambers says ', 'I have read your l', 'I am unhappy enoug', 'My own dearest, if']);
    expect(app.getState().editing).toEqual({ removed: [third.snippetId], replacement: null });
  });

  test('a replacement is one more Beam call, made under the Giver\'s account', async () => {
    const { app, beam } = await withPoem();

    await app.replaceLine(app.getState().outcome!.poem.lines[2]!.snippetId);

    expect((beam as ReturnType<typeof scriptedBeam>).requests.map((request) => request.responseFormat.name)).toEqual(['poem', 'replacement']);
  });

  test('if Beam names a Snippet that is not allowed, the Poem is untouched and the Giver is told', async () => {
    const { app } = await withPoem(scriptedBeam({ replacement: () => 's99999' }));
    const before = app.getState().outcome!.poem;

    await app.replaceLine(before.lines[2]!.snippetId);

    expect(app.getState().outcome!.poem).toBe(before);
    expect(app.getState().editing.replacement).toEqual({
      snippetId: before.lines[2]!.snippetId,
      problem: { message: 'Beam answered, but we could not use the answer. Trying again usually works.' },
    });
  });

  test('when Beam cannot be reached the Giver can try the same Line again', async () => {
    let failures = 1;
    const inner = scriptedBeam();
    const flaky: BeamPort = {
      complete: (request, onProgress) =>
        request.responseFormat.name === 'replacement' && failures-- > 0
          ? Promise.reject(new BeamError('network', 'The connection dropped.', true))
          : inner.complete(request, onProgress),
    };
    const { app } = await withPoem(flaky);
    const third = app.getState().outcome!.poem.lines[2]!;

    await app.replaceLine(third.snippetId);
    expect(app.getState().editing.replacement).toMatchObject({ snippetId: third.snippetId, problem: { message: expect.stringContaining('connection') } });

    await app.replaceLine(third.snippetId);
    expect(app.getState().editing.replacement).toBeNull();
    expect(linesOf(app)[2]).toBe('Thank you a thousa');
  });

  test('being out of credits comes with the link to add some', async () => {
    const inner = scriptedBeam();
    const broke: BeamPort = {
      complete: (request, onProgress) =>
        request.responseFormat.name === 'replacement'
          ? Promise.reject(new BeamError('http', 'Beam request failed (HTTP 402)', false, 402))
          : inner.complete(request, onProgress),
    };
    const { app } = await withPoem(broke);

    await app.replaceLine(app.getState().outcome!.poem.lines[2]!.snippetId);

    expect(app.getState().editing.replacement?.problem?.help?.href).toBe('https://huggingface.co/settings/billing');
  });

  test('with nothing else to choose from the Giver is told, and Beam is not asked', async () => {
    const { app, beam } = await withPoem(
      createFakeBeam((request) => ({
        picks: ['I wrote this on a wet afternoon', 'Mr. Kenyon says', 'I laughed aloud in the omnibus', 'I have read your letter again', 'I am unhappy enough', 'I never write more gladly'].map((fragment) => ({ id: idOf(request, fragment), note: 'Close together.' })),
      })),
    );

    await app.replaceLine(app.getState().outcome!.poem.lines[1]!.snippetId);

    expect(app.getState().editing.replacement?.problem?.message).toBe('There is nothing else from that time to replace this Line with.');
    expect((beam as ReturnType<typeof scriptedBeam>).requests).toHaveLength(1);
  });

  test('a sign-in that has expired mid-way sends the Giver to sign in again', async () => {
    const inner = scriptedBeam();
    const expired: BeamPort = {
      complete: (request, onProgress) =>
        request.responseFormat.name === 'replacement'
          ? Promise.reject(new BeamError('http', 'Beam request failed (HTTP 401)', false, 401))
          : inner.complete(request, onProgress),
    };
    const { app, forgot } = await withPoem(expired);

    await app.replaceLine(app.getState().outcome!.poem.lines[2]!.snippetId);

    expect(forgot()).toBe(1);
    expect(app.getState()).toMatchObject({ step: 'failed', failure: { kind: 'signed-out' } });
  });

  test('other edits wait while a replacement is under way', async () => {
    const { app } = await withPoem();
    const [first, , third] = app.getState().outcome!.poem.lines;

    const replacing = app.replaceLine(third!.snippetId);
    app.removeLine(first!.snippetId);
    void app.replaceLine(first!.snippetId);
    await replacing;

    expect(linesOf(app)[0]).toBe('I wrote this on a ');
    expect(app.getState().editing.removed).toEqual([third!.snippetId]);
  });
});

describe('regenerating the Poem', () => {
  test('makes a fresh Poem from the same choices, and forgets the edits to the old one', async () => {
    const { app, beam } = await withPoem();
    const original = app.getState().outcome!.poem;
    app.removeLine(original.lines[1]!.snippetId);

    const regenerated = app.regenerate();
    expect(app.getState().step).toBe('reading');
    await regenerated;

    const state = app.getState();
    expect(state.step).toBe('poem');
    expect(state.outcome!.poem.lines.map((line) => line.text.slice(0, 18))).toEqual([
      'Mr. Kenyon says yo',
      'Thank you a thousa',
      'You were kind to c',
      'I have read your l',
      'The winter will be',
      'At from half-past ',
    ]);
    expect(state.outcome!.poem).not.toEqual(original);
    expect(state.outcome!.poem).toMatchObject({ occasion: 'birthday', giver: 'Robert', recipient: 'Elizabeth' });
    expect(state.editing).toEqual({ removed: [], replacement: null });
    const requests = (beam as ReturnType<typeof scriptedBeam>).requests;
    expect(requests.map((request) => request.responseFormat.name)).toEqual(['poem', 'poem']);
    expect(requests[1]!.system).toContain('she just retired');
  });

  test('if Beam fails the Giver can retry, as with any attempt', async () => {
    const inner = scriptedBeam();
    let failures = 1;
    const flaky: BeamPort = {
      complete: (request, onProgress) =>
        failures-- === 0 ? Promise.reject(new BeamError('truncated', 'Beam ran out of room.', true)) : inner.complete(request, onProgress),
    };
    const { app } = await withPoem(flaky);

    await app.regenerate();
    expect(app.getState()).toMatchObject({ step: 'failed', failure: { kind: 'truncated' } });
    await app.retry();

    expect(app.getState().step).toBe('poem');
  });

  test('only a finished Poem can be regenerated', async () => {
    const { app, beam } = setup();
    await app.init();

    await app.regenerate();

    expect(app.getState().step).toBe('compose');
    expect((beam as ReturnType<typeof scriptedBeam>).requests).toHaveLength(0);
  });
});
