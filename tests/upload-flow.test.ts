// Seam 5 for uploading a WhatsApp export: the Giver brings a chat, says which one is
// them and who the Poem is for, answers the date question only when it is real, sees the
// count and the privacy statement, and then makes the Poem. Auth, the Gallery texts and
// Beam are stand-ins; the screens are not involved, only the state they render.

import { strToU8, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { createFakeBeam } from '../src';
import { createApp, type ChatFile } from '../src/app/app';
import type { AuthPort, Session } from '../src/app/auth';
import { PRIVACY_STATEMENT, reviewOf } from '../src/app/upload';
import { volumeOne, volumeTwo } from './fixtures/gallery';
import { promptSnippets } from './support/prompt';
import { ambiguousDates, ANDROID_24H_MESSAGES, android24h, FAMILY_GROUP_MESSAGES, familyGroup, ios24h } from './fixtures/whatsapp';

const session: Session = { accessToken: 'hf_test', expiresAt: Date.now() + 3_600_000, username: 'giver' };

/**
 * A fake Beam that picks 8 Snippets spread evenly over the ones it is shown (a whole Poem in
 * either size tier, with a stretch of Conversation between its Lines), or the first as a replacement.
 */
function pickingBeam() {
  return createFakeBeam((request) => {
    const shown = promptSnippets(request);
    if (request.responseFormat.name === 'replacement') return { raw: JSON.stringify({ id: shown[0]!.id }) };
    const spread = Array.from({ length: 8 }, (_, i) => shown[Math.round((i * (shown.length - 1)) / 7)]!);
    return { picks: spread.map(({ id }) => ({ id, note: 'A spread-out thing.' })) };
  });
}

async function setup(options: { failFirst?: unknown } = {}) {
  const beam = pickingBeam();
  let failure = options.failFirst;
  const auth: AuthPort = { restore: async () => ({ session }), signIn: async () => {}, signOut: () => {}, forget: () => {} };
  const app = createApp({
    auth,
    loadSource: async () => ({ kind: 'gallery', texts: [volumeOne, volumeTwo] }),
    makeBeam: () => ({
      complete(request, onProgress) {
        if (failure === undefined) return beam.complete(request, onProgress);
        const error = failure;
        failure = undefined;
        return Promise.reject(error);
      },
    }),
    now: () => 0,
  });
  await app.init();
  return { app, beam };
}

const chatFile = (name: string, bytes: Uint8Array): ChatFile => ({ name, size: bytes.length, read: async () => bytes });
const file = (text: string, name = 'WhatsApp Chat with Mom.txt') => chatFile(name, strToU8(text));

describe('bringing a chat', () => {
  test('from the compose step the Giver can choose to use their own chat, and go back to the Gallery', async () => {
    const { app } = await setup();

    app.chooseChat();
    expect(app.getState()).toMatchObject({ step: 'upload', chat: null });

    app.back();
    expect(app.getState()).toMatchObject({ step: 'compose', source: 'gallery' });
  });

  test('an Android .txt and an iOS .zip both land on "which one is you"', async () => {
    for (const upload of [file(android24h), chatFile('WhatsApp Chat - Mom.zip', zipSync({ '_chat.txt': strToU8(ios24h) }))]) {
      const { app } = await setup();
      app.chooseChat();

      await app.uploadFile(upload);

      const state = app.getState();
      expect(state).toMatchObject({ step: 'people', upload: { busy: false, error: null } });
      expect(state.chat?.fileName).toBe(upload.name);
      expect(state.chat?.senders.map((sender) => sender.name).sort()).toEqual(['Mom', 'Sam']);
      expect(state.chat).toMatchObject({ giver: null, recipient: null });
    }
  });

  test('a file that is not a WhatsApp chat is explained in plain words, and the Giver can try another', async () => {
    const { app } = await setup();
    app.chooseChat();

    await app.uploadFile(file('Dear diary, nothing happened today.', 'diary.txt'));
    expect(app.getState()).toMatchObject({ step: 'upload', chat: null, upload: { busy: false } });
    expect(app.getState().upload.error).toMatch(/No WhatsApp Messages/);

    await app.uploadFile(file(android24h));
    expect(app.getState()).toMatchObject({ step: 'people', upload: { error: null } });
  });

  test('a file too big to be a chat is refused without being read, with a hint to export without media', async () => {
    const { app } = await setup();
    app.chooseChat();
    let read = false;

    await app.uploadFile({ name: 'WhatsApp Chat with media.zip', size: 900 * 1024 * 1024, read: async () => ((read = true), new Uint8Array()) });

    expect(read).toBe(false);
    expect(app.getState().step).toBe('upload');
    expect(app.getState().upload.error).toMatch(/without media/i);
  });

  test('a file the browser cannot read is explained too', async () => {
    const { app } = await setup();
    app.chooseChat();

    await app.uploadFile({ name: 'chat.txt', size: 10, read: () => Promise.reject(new Error('NotReadableError')) });

    expect(app.getState().upload).toMatchObject({ busy: false, error: expect.stringMatching(/could not be read/) });
  });

  test('a chat where only one person ever spoke has nobody to make a Poem for', async () => {
    const { app } = await setup();
    app.chooseChat();

    await app.uploadFile(file('12/03/2024, 09:16 - Sam: Note to self, buy the lemons for the cake.'));

    expect(app.getState().step).toBe('upload');
    expect(app.getState().upload.error).toMatch(/only one person/i);
  });
});

describe('which one is you, and who is it for', () => {
  async function atPeople(text: string) {
    const ready = await setup();
    ready.app.chooseChat();
    await ready.app.uploadFile(file(text));
    return ready;
  }

  test('in a two-person chat, saying who you are says who it is for', async () => {
    const { app } = await atPeople(android24h);

    app.choosePerson('giver', 'Sam');

    expect(app.getState().chat).toMatchObject({ giver: 'Sam', recipient: 'Mom' });
  });

  test('in a group chat the Giver also picks the Recipient, and cannot be their own', async () => {
    const { app } = await atPeople(familyGroup);

    app.choosePerson('giver', 'Sam');
    expect(app.getState().chat).toMatchObject({ giver: 'Sam', recipient: null });
    app.choosePerson('recipient', 'Sam');
    expect(app.getState().chat?.recipient).toBeNull();
    app.choosePerson('recipient', 'Mom');
    expect(app.getState().chat).toMatchObject({ giver: 'Sam', recipient: 'Mom' });

    app.choosePerson('giver', 'Mom');
    expect(app.getState().chat).toMatchObject({ giver: 'Mom', recipient: null });
  });

  test('nothing moves on until both are chosen', async () => {
    const { app } = await atPeople(familyGroup);
    app.choosePerson('giver', 'Sam');

    app.confirmPeople();

    expect(app.getState().step).toBe('people');
  });
});

describe('before sending', () => {
  async function atReview(text: string, giver = 'Sam', recipient = 'Mom') {
    const ready = await setup();
    ready.app.chooseChat();
    await ready.app.uploadFile(file(text));
    ready.app.choosePerson('giver', giver);
    ready.app.choosePerson('recipient', recipient);
    ready.app.confirmPeople();
    return ready;
  }

  test('the Giver sees how many Messages will be sent, and the privacy statement, before anything is', async () => {
    const { app, beam } = await atReview(android24h);

    const state = app.getState();
    expect(state.step).toBe('review');
    expect(reviewOf(state.chat!)).toMatchObject({
      count: ANDROID_24H_MESSAGES,
      headline: `${ANDROID_24H_MESSAGES} Messages from Mom and you`,
      privacy: PRIVACY_STATEMENT,
      others: false,
    });
    expect(PRIVACY_STATEMENT).toContain("never touches Receipts' server");
    expect(PRIVACY_STATEMENT).toContain('straight to Beam');
    expect(PRIVACY_STATEMENT).toContain('Hugging Face');
    expect(PRIVACY_STATEMENT).toContain('your own account');
    expect(beam.requests).toHaveLength(0);
  });

  test("in a group chat only the two people's Messages are counted, and the Giver is told others are left out", async () => {
    const { app } = await atReview(familyGroup);

    const review = reviewOf(app.getState().chat!);

    expect(review.headline).toBe(`${FAMILY_GROUP_MESSAGES} Messages from Mom and you`);
    expect(review.others).toBe(true);
  });

  test('a big chat has thousands separators', async () => {
    const lines = Array.from({ length: 4812 }, (_, i) => `12/03/2024, 09:${String(i % 60).padStart(2, '0')} - ${i % 2 ? 'Sam' : 'Mom'}: Message number ${i} of many.`);
    const { app } = await atReview(lines.join('\n'));

    expect(reviewOf(app.getState().chat!).headline).toBe('4,812 Messages from Mom and you');
  });

  test('the date question is skipped when the export settles the order', async () => {
    const { app } = await atReview(android24h);

    expect(app.getState().chat).toMatchObject({ question: null, dateOrder: 'day-first' });
  });

  test('going back from the review returns to choosing people', async () => {
    const { app } = await atReview(android24h);

    app.back();

    expect(app.getState().step).toBe('people');
  });
});

describe('when the date order cannot be told', () => {
  async function atDateOrder() {
    const ready = await setup();
    ready.app.chooseChat();
    await ready.app.uploadFile(file(ambiguousDates));
    ready.app.choosePerson('giver', 'Sam');
    ready.app.confirmPeople();
    return ready;
  }

  test('the Giver is shown one Message with both readings of its date', async () => {
    const { app } = await atDateOrder();

    expect(app.getState().step).toBe('date-order');
    expect(app.getState().chat?.question).toEqual({
      sender: 'Mom',
      text: 'Remember the lemon cake from the lake house, with the burnt edges?',
      dayFirst: '2024-06-03',
      monthFirst: '2024-03-06',
    });
  });

  test('their answer carries on to the review, and is what the Poem\'s Receipts say', async () => {
    const { app, beam } = await atDateOrder();

    app.chooseDateOrder('month-first');
    expect(app.getState()).toMatchObject({ step: 'review', chat: { dateOrder: 'month-first' } });
    app.confirmChat();
    await app.start();

    const poem = app.getState().outcome!.poem;
    expect(poem.lines[0]?.receipt.dateLabel).toBe('6 March 2024');
    expect(beam.requests[0]?.user).toContain('## M 2024-03-06');
  });

  test('going back from the review returns to the question', async () => {
    const { app } = await atDateOrder();
    app.chooseDateOrder('day-first');

    app.back();

    expect(app.getState().step).toBe('date-order');
  });
});

describe('making the Poem from the chat', () => {
  async function composed(text: string, giver = 'Sam', recipient = 'Mom', options: { failFirst?: unknown } = {}) {
    const ready = await setup(options);
    ready.app.chooseChat();
    await ready.app.uploadFile(file(text));
    ready.app.choosePerson('giver', giver);
    ready.app.choosePerson('recipient', recipient);
    ready.app.confirmPeople();
    ready.app.confirmChat();
    return ready;
  }

  test('the Poem is made for the Recipient from the chat, and Beam never sees anyone else', async () => {
    const { app, beam } = await composed(familyGroup);
    expect(app.getState()).toMatchObject({ step: 'compose', source: 'chat' });
    app.edit({ occasion: 'birthday', note: 'she just turned sixty' });

    await app.start();

    const state = app.getState();
    expect(state.step).toBe('poem');
    expect(state.outcome?.poem).toMatchObject({ occasion: 'birthday', giver: 'Sam', recipient: 'Mom', verified: true });
    const sent = `${beam.requests[0]?.system}\n${beam.requests[0]?.user}`;
    expect(sent).toContain('she just turned sixty');
    for (const bystander of ['Dad', 'Aunt Priya', '98765', 'garage key', 'landlord']) expect(sent).not.toContain(bystander);
  });

  test('replacing a Line in a chat Poem only ever sends the Giver\'s and the Recipient\'s words to Beam', async () => {
    const { app, beam } = await composed(familyGroup);
    await app.start();
    const line = app.getState().outcome!.poem.lines[0]!;

    await app.replaceLine(line.snippetId);

    const replacement = beam.requests.find((request) => request.responseFormat.name === 'replacement');
    expect(replacement).toBeDefined();
    const sent = `${replacement!.system}\n${replacement!.user}`;
    expect(sent).toContain('lemon cake');
    for (const bystander of ['Dad', 'Aunt Priya', '98765', 'garage key', 'landlord', 'football bet']) expect(sent).not.toContain(bystander);
    expect(app.getState().outcome!.poem.lines[0]!.snippetId).not.toBe(line.snippetId);
    expect(app.getState().outcome!.poem.lines[0]!.receipt.sender).toMatch(/^(Mom|Sam)$/);
  });

  test('a failed attempt is retried with the same chat, people and date order', async () => {
    const { app, beam } = await composed(ambiguousDates, 'Sam', 'Mom', { failFirst: new TypeError('Failed to fetch') });
    app.chooseDateOrder('day-first');
    app.confirmChat();

    await app.start();
    expect(app.getState().step).toBe('failed');
    await app.retry();

    expect(app.getState().step).toBe('poem');
    expect(app.getState().outcome?.poem).toMatchObject({ giver: 'Sam', recipient: 'Mom' });
    expect(app.getState().outcome?.poem.lines[0]?.receipt.dateLabel).toBe('3 June 2024');
    expect(beam.requests).toHaveLength(1);
  });

  test('"Make another Poem" keeps the chat, and the Giver can still swap back to the Gallery', async () => {
    const { app } = await composed(android24h);
    await app.start();

    app.again();
    expect(app.getState()).toMatchObject({ step: 'compose', source: 'chat' });

    app.useGallery();
    expect(app.getState()).toMatchObject({ step: 'compose', source: 'gallery', chat: null });
    await app.start();
    expect(app.getState().outcome?.poem).toMatchObject({ giver: 'Robert', recipient: 'Elizabeth' });
  });

  test('signing out forgets the chat', async () => {
    const { app } = await composed(android24h);

    app.signOut();

    expect(app.getState()).toMatchObject({ step: 'sign-in', source: 'gallery', chat: null });
  });
});
