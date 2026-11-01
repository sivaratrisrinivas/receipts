// Seam: generating the Gallery Poems. A Beam port, the Gallery text and a budget go in;
// the picks of every Poem that earned a place come out, with an honest account of the
// attempts made and the money spent. Beam is a stand-in here; nothing is spent.

import { describe, expect, test } from 'vitest';
import { BeamError, createFakeBeam, readConversation, snippetsOf, type BeamCompletion, type BeamPort, type FakePick, type Occasion } from '../src';
import { generateGalleryPicks, type GenerateOptions } from '../src/gallery-poems/generate';
import { fingerprintOf } from '../src/gallery-poems/picks';
import { volumeOne, volumeTwo } from './fixtures/gallery';

const texts = [volumeOne, volumeTwo];
const snippets = snippetsOf(readConversation({ kind: 'gallery', texts }));

function idOf(fragment: string): string {
  const found = snippets.find((snippet) => snippet.text.includes(fragment));
  if (!found) throw new Error(`no Snippet containing "${fragment}"`);
  return found.id;
}
const pick = (fragment: string, note = `Because of "${fragment.slice(0, 12)}".`): FakePick => ({ id: idOf(fragment), note, callbacks: [] });

// In this fixture the timeline's quarters are Q1 Jan-Jun 1845, Q2 Jun-Nov 1845, Q3 Nov 1845-Apr 1846
// and Q4 Apr-Sep 1846, and each has its own words. Robert wrote the first letter, Elizabeth the second.
const q1Robert = pick('I wrote this on a wet afternoon');
const q1Elizabeth = pick('I thank you, dear Mr. Browning');
const q1More = pick('Come and see the sea');
const q2 = pick('I am unhappy enough');
const q3 = pick('My own dearest, if you should detect');
const q4 = pick('At from half-past three to four');

const whole = [q1Robert, q1Elizabeth, q1More, q2, q3, q4];
const noQ4 = [q1Robert, q1Elizabeth, q1More, q2, q3, pick('Thank you a thousand times for the flowers')];

function setup(replies: (call: number, occasion: Occasion) => FakePick[], overrides: Partial<GenerateOptions> = {}) {
  let call = 0;
  const beam = createFakeBeam((request) => {
    const occasion = /Occasion: ([a-z ]+)\./.exec(request.system)![1] as Occasion;
    return { picks: replies(++call, occasion) };
  });
  const generate = () => generateGalleryPicks({ texts, beam, occasions: ['birthday', 'sorry'], ...overrides });
  return { beam, generate };
}

describe('generating Gallery Poems', () => {
  test('a Poem that verifies and spans the timeline is kept as its picks: IDs, Notes and callbacks', async () => {
    const callback = { ...q4, callbacks: [q1Robert.id] };
    const { beam, generate } = setup(() => [q1Robert, q1Elizabeth, q1More, q2, q3, callback]);

    const report = await generate();

    expect(beam.requests).toHaveLength(2);
    expect(report.gallery).toEqual(fingerprintOf(snippets));
    expect(Object.keys(report.picks)).toEqual(['birthday', 'sorry']);
    expect(report.picks.birthday).toEqual(
      [q1Robert, q1Elizabeth, q1More, q2, q3, callback].map(({ id, note, callbacks }) => ({ id, note, callbacks })),
    );
    expect(report.occasions.map((o) => o.attempts.map((a) => a.outcome))).toEqual([['accepted'], ['accepted']]);
  });

  test('a Poem that leaves a quarter out is turned down, and Beam is asked again', async () => {
    const { beam, generate } = setup((call) => (call === 1 ? noQ4 : whole), { occasions: ['birthday'] });

    const report = await generate();

    expect(beam.requests).toHaveLength(2);
    const [first, second] = report.occasions[0]!.attempts;
    expect(first).toMatchObject({ outcome: 'rejected' });
    expect(first!.problems.join(' ')).toMatch(/Q4/);
    expect(second).toMatchObject({ outcome: 'accepted', problems: [] });
    expect(report.picks.birthday!.map((p) => p.id)).toEqual(whole.map((p) => p.id));
  });

  test('a made-up Snippet ID is turned down: the badge would be withheld', async () => {
    const { generate } = setup((call) => (call === 1 ? [...whole, { id: 's99999', note: 'Made up.' }] : whole), { occasions: ['birthday'] });

    const report = await generate();

    expect(report.occasions[0]!.attempts[0]).toMatchObject({ outcome: 'rejected' });
    expect(report.occasions[0]!.attempts[0]!.problems.join(' ')).toMatch(/verif/i);
  });

  test('after 3 attempts an Occasion is given up on, honestly, and the rule is not loosened', async () => {
    const { beam, generate } = setup((_, occasion) => (occasion === 'birthday' ? noQ4 : whole));

    const report = await generate();

    expect(beam.requests.filter((r) => r.system.includes('Occasion: birthday')).length).toBe(3);
    expect(report.occasions[0]).toMatchObject({ occasion: 'birthday', accepted: false });
    expect(report.occasions[0]!.attempts.map((a) => a.outcome)).toEqual(['rejected', 'rejected', 'rejected']);
    expect(report.picks.birthday).toBeUndefined();
    // The other Occasion is not held up by it.
    expect(report.occasions[1]).toMatchObject({ occasion: 'sorry', accepted: true });
  });

  test('a failed call (Beam ran out of room) counts as an attempt and is retried', async () => {
    let calls = 0;
    const flaky: BeamPort = {
      async complete(request, onProgress) {
        if (++calls === 1) throw new BeamError('truncated', 'Beam ran out of room.', true);
        return createFakeBeam(() => ({ picks: whole })).complete(request, onProgress);
      },
    };

    const report = await generateGalleryPicks({ texts, beam: flaky, occasions: ['birthday'] });

    expect(report.occasions[0]!.attempts.map((a) => a.outcome)).toEqual(['failed', 'accepted']);
    expect(report.occasions[0]!.attempts[0]!.problems.join(' ')).toMatch(/ran out of room/);
  });

  test('being out of credits or signed out stops everything at once, with the reason', async () => {
    let calls = 0;
    const broke: BeamPort = {
      async complete() {
        calls++;
        throw new BeamError('http', 'Beam request failed (HTTP 402)', false, 402);
      },
    };

    const report = await generateGalleryPicks({ texts, beam: broke, occasions: ['birthday', 'sorry'] });

    expect(calls).toBe(1);
    expect(report.stopped).toMatch(/402/);
    expect(report.occasions.map((o) => o.attempts.length)).toEqual([1, 0]);
  });
});

describe('the spending cap', () => {
  const usage = (promptTokens: number, completionTokens: number) => ({ promptTokens, completionTokens, reasoningTokens: 0 });
  /** A Beam that answers with a whole Poem and reports what the call cost in tokens. */
  function metered(tokens: ReturnType<typeof usage>): BeamPort & { calls: number } {
    const inner = createFakeBeam(() => ({ picks: whole }));
    return {
      calls: 0,
      async complete(request, onProgress) {
        this.calls++;
        const completion = await inner.complete(request, onProgress);
        return { ...completion, usage: tokens } satisfies BeamCompletion;
      },
    };
  }

  test('no call is made that could take the estimated spend past the limit', async () => {
    // Every call fails: each is charged the $0.20 estimate, so $0.50 allows two calls.
    let calls = 0;
    const failing: BeamPort = {
      async complete() {
        calls++;
        throw new BeamError('network', 'The connection dropped.', true);
      },
    };

    const report = await generateGalleryPicks({ texts, beam: failing, occasions: ['birthday', 'sorry'], budget: { limitUsd: 0.5, perCallUsd: 0.2 } });

    expect(calls).toBe(2);
    expect(report.spentUsd).toBeCloseTo(0.4);
    expect(report.stopped).toMatch(/spend/i);
  });

  test('a call that reports its tokens is charged what it used: $0.40 per million in, $1.20 per million out', async () => {
    const beam = metered(usage(300_000, 10_000));

    const report = await generateGalleryPicks({ texts, beam, occasions: ['birthday'] });

    expect(report.spentUsd).toBeCloseTo(0.132); // 0.12 + 0.012
  });

  test('with the default limit of $3 and $0.20 a call, at most 15 calls are made', async () => {
    let calls = 0;
    const failing: BeamPort = {
      async complete() {
        calls++;
        throw new BeamError('truncated', 'Beam ran out of room.', true);
      },
    };

    const report = await generateGalleryPicks({ texts, beam: failing, occasions: ['birthday', 'anniversary', 'thank you', 'sorry', 'missing you', 'farewell'] });

    expect(calls).toBe(15);
    expect(report.spentUsd).toBeCloseTo(3);
    // The sixth Occasion was never tried, and the report says so.
    expect(report.occasions.map((o) => o.attempts.length)).toEqual([3, 3, 3, 3, 3, 0]);
  });
});
