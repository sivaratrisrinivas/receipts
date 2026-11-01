// Seam 5 for the review step of an uploaded chat: what the Giver reads before anything is
// sent. The count is of the Messages that will actually be sent (a link, an emoji or a
// one-word reply is not), and there is always one plain, non-blocking line about Beam and
// languages, in stronger words when the chat is mostly in a script other than Latin.

import { describe, expect, test } from 'vitest';
import { strToU8 } from 'fflate';
import { createFakeBeam } from '../src';
import { createApp } from '../src/app/app';
import type { AuthPort, Session } from '../src/app/auth';
import { reviewOf } from '../src/app/upload';
import { android24h, ANDROID_24H_SENT, familyGroup } from './fixtures/whatsapp';
import { padPicks } from './support/prompt';

const session: Session = { accessToken: 'hf_test', expiresAt: Date.now() + 3_600_000, username: 'giver' };

async function atReview(text: string, giver = 'Sam', recipient = 'Mom') {
  const beam = createFakeBeam((sent) => ({ picks: padPicks(sent, [], 8) }));
  const auth: AuthPort = { restore: async () => ({ session }), signIn: async () => {}, signOut: () => {}, forget: () => {} };
  const app = createApp({ auth, loadSource: async () => ({ kind: 'gallery', texts: [] }), makeBeam: () => beam, now: () => 0 });
  await app.init();
  app.chooseChat();
  const bytes = strToU8(text);
  await app.uploadFile({ name: 'WhatsApp Chat.txt', size: bytes.length, read: async () => bytes });
  app.choosePerson('giver', giver);
  app.choosePerson('recipient', recipient);
  app.confirmPeople();
  return { app, beam };
}

const line = (i: number, sender: string, text: string) => `${String((i % 28) + 1).padStart(2, '0')}/${String(Math.floor(i / 28) + 1).padStart(2, '0')}/2024, 09:00 - ${sender}: ${text}`;
/** A chat in which Sam and Mom take turns saying these things. */
const chatSaying = (texts: readonly string[]) => texts.map((text, i) => line(i, i % 2 === 0 ? 'Sam' : 'Mom', text)).join('\n');

const BASE = 'Beam works best in English, so chats in other languages may give weaker results.';

describe('the count on the review step is what is sent', () => {
  test('a one-word reply is not counted, and the Giver is told how many Messages are left out', async () => {
    const { app } = await atReview(android24h);

    const review = reviewOf(app.getState().chat!);

    // android24h has 19 Messages from the two of them; "ok" is a one-word reply.
    expect(review.count).toBe(ANDROID_24H_SENT);
    expect(review.headline).toBe(`${ANDROID_24H_SENT} Messages from Mom and you`);
    expect(review.leftOut).toBe(1);
    expect(review.leftOutNote).toBe('1 Message with no words to read (a link, emoji or one-word reply) is left out.');
  });

  test('the count equals the number of Messages in the prompt Beam is then sent', async () => {
    const texts = [
      ...Array.from({ length: 20 }, (_, i) => `Ordinary Message ${i + 1} about the kettle and the post.`),
      'ok', '😂😂😂', 'https://youtu.be/abc', 'haha haha haha', 'lol', 'నేను నిన్ను మిస్ అవుతున్నాను',
    ];
    const { app, beam } = await atReview(chatSaying(texts));
    const review = reviewOf(app.getState().chat!);

    app.confirmChat();
    await app.start();

    const messagesInPrompt = beam.requests[0]!.user.split('\n').filter((row) => row.startsWith('## ')).length;
    expect(review.count).toBe(21);
    expect(messagesInPrompt).toBe(review.count);
    expect(review.leftOut).toBe(5);
    expect(review.leftOutNote).toBe('5 Messages with no words to read (a link, emoji or one-word reply) are left out.');
  });

  test('with nothing left out there is no such line', async () => {
    const { app } = await atReview(familyGroup);

    expect(reviewOf(app.getState().chat!)).toMatchObject({ count: 16, leftOut: 0, leftOutNote: null });
  });
});

describe('the language line on the review step', () => {
  test('every chat gets the one plain line, an English one included', async () => {
    const { app } = await atReview(android24h);

    expect(reviewOf(app.getState().chat!).languageNotice).toEqual({ text: BASE, strong: false });
  });

  test('a mostly Latin chat with some Telugu script in it keeps the plain line', async () => {
    const texts = [...Array.from({ length: 16 }, (_, i) => `nenu ippudu vastunna ra number ${i + 1}`), 'నేను నిన్ను మిస్ అవుతున్నాను', 'సరే రేపు కలుద్దాం అమ్మా'];
    const { app } = await atReview(chatSaying(texts));

    expect(reviewOf(app.getState().chat!).languageNotice).toEqual({ text: BASE, strong: false });
  });

  test('a chat mostly in Telugu script gets stronger wording, still advice and not a stop', async () => {
    const texts = Array.from({ length: 20 }, (_, i) => `నేను నిన్ను మిస్ అవుతున్నాను ${i + 1} సారి`);
    const { app } = await atReview(chatSaying(texts));

    const { languageNotice } = reviewOf(app.getState().chat!);

    expect(languageNotice.strong).toBe(true);
    expect(languageNotice.text).toBe(
      'This chat is mostly written in a script other than Latin. Beam works best in English, so the Poem may come out noticeably weaker. You can still continue.',
    );
    app.confirmChat();
    expect(app.getState()).toMatchObject({ step: 'compose', source: 'chat' });
  });

  test('it never stops the Giver: any chat can be confirmed and made into a Poem', async () => {
    const { app, beam } = await atReview(android24h);

    app.confirmChat();
    await app.start();

    expect(app.getState().step).toBe('poem');
    expect(beam.requests).toHaveLength(1);
  });
});
