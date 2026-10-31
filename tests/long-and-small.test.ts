// Seams 3 and 5 for long and small Conversations: what the Giver is told. A Conversation
// too small for a Poem ends in "Not enough here yet for a Poem" and no Beam call; one read
// only in part says how much of the timeline Beam read.

import { describe, expect, test } from 'vitest';
import { createFakeBeam } from '../src';
import { createApp } from '../src/app/app';
import type { AuthPort, Session } from '../src/app/auth';
import { readFractionMessage } from '../src/app/read-fraction';
import { heavyBody, lettersOnDays, shortBody, spreadDays, volumeOfLetters } from './fixtures/letters';

const session: Session = { accessToken: 'hf_test', expiresAt: Date.now() + 3_600_000, username: 'giver' };

function setup(volume: string) {
  const beam = createFakeBeam((request) => ({ picks: [{ id: /^(s\d+) /m.exec(request.user)![1]!, note: 'Any.' }] }));
  const auth: AuthPort = {
    restore: async () => ({ session }),
    signIn: async () => {},
    signOut: () => {},
    forget: () => {},
  };
  const app = createApp({
    auth,
    loadSource: async () => ({ kind: 'gallery', texts: [volume] }),
    makeBeam: () => beam,
    now: () => 0,
  });
  return { app, beam };
}

const conversationWith = (usable: number) => volumeOfLetters(lettersOnDays(spreadDays(usable, 1), 1, shortBody));

describe('a Conversation too small for a Poem', () => {
  test('the Giver is told there is not enough yet, how many there were, and Beam is never called', async () => {
    const { app, beam } = setup(conversationWith(14));
    await app.init();

    await app.start();

    const { step, failure } = app.getState();
    expect(step).toBe('failed');
    expect(failure).toMatchObject({ kind: 'not-enough', title: 'Not enough here yet for a Poem' });
    expect(failure?.message).toMatch(/\b14\b/);
    expect(failure?.message).toMatch(/\b15\b/);
    expect(beam.requests).toHaveLength(0);
  });

  test('a Conversation with nothing usable says so plainly', async () => {
    const { app } = setup(conversationWith(0));
    await app.init();

    await app.start();

    expect(app.getState().failure).toMatchObject({ kind: 'not-enough', title: 'Not enough here yet for a Poem' });
    expect(app.getState().failure?.message).toMatch(/nothing/i);
  });

  test('there is nothing to retry: the one button takes the Giver back to their choices', async () => {
    const { app, beam } = setup(conversationWith(14));
    await app.init();
    app.edit({ occasion: 'birthday' });
    await app.start();

    await app.recover();

    expect(app.getState()).toMatchObject({ step: 'compose', failure: null, compose: { occasion: 'birthday' } });
    expect(beam.requests).toHaveLength(0);
  });

  test('a Conversation just big enough still gets its Poem', async () => {
    const { app } = setup(conversationWith(15));
    await app.init();

    await app.start();

    expect(app.getState().step).toBe('poem');
  });
});

describe('a Conversation read only in part', () => {
  test('the Poem result carries the fraction read, for the screen to show', async () => {
    const days = spreadDays(1800, 9);
    const { app } = setup(volumeOfLetters(lettersOnDays(days, 4, heavyBody)));
    await app.init();

    await app.start();

    const { outcome } = app.getState();
    expect(outcome?.readFraction).toMatchObject({ stride: 2, readDays: 900, totalDays: 1800 });
    expect(readFractionMessage(outcome!.readFraction)).toBe('Beam read every 2nd day across the 9 years.');
  });
});

describe('telling the Giver how much Beam read', () => {
  const nineYears = { firstDate: '1845-01-10', lastDate: '1854-01-09' };

  test('nothing is said when Beam read every day', () => {
    expect(readFractionMessage({ ...nineYears, stride: 1, readDays: 3000, totalDays: 3000 })).toBeNull();
  });

  test.each([
    [2, 'every 2nd day'],
    [3, 'every 3rd day'],
    [4, 'every 4th day'],
    [11, 'every 11th day'],
    [12, 'every 12th day'],
    [13, 'every 13th day'],
    [21, 'every 21st day'],
    [22, 'every 22nd day'],
    [23, 'every 23rd day'],
    [101, 'every 101st day'],
  ])('reading every %i days is said as "%s"', (stride, phrase) => {
    const message = readFractionMessage({ ...nineYears, stride, readDays: 100, totalDays: 100 * stride });

    expect(message).toBe(`Beam read ${phrase} across the 9 years.`);
  });

  test.each([
    ['1845-01-10', '1846-09-19', 'the 20 months'],
    ['1845-01-10', '1845-02-24', 'the 45 days'],
    ['1845-01-10', '1850-01-10', 'the 5 years'],
  ])('the stretch of time %s to %s is said as "%s"', (firstDate, lastDate, stretch) => {
    const message = readFractionMessage({ firstDate, lastDate, stride: 2, readDays: 10, totalDays: 20 });

    expect(message).toBe(`Beam read every 2nd day across ${stretch}.`);
  });
});
