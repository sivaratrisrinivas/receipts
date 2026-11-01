// Seam 1 for WhatsApp exports: raw export text (or a zip), the Giver's choices and a fake
// Beam port go in; a Poem comes out. Assertions are on the Poem and on the prompt the
// fake Beam was handed, the only thing that ever leaves the browser.

import { strToU8, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { renderCardHtml } from '../src/card';
import {
  AmbiguousDatesError,
  createFakeBeam,
  dateQuestion,
  ExportError,
  exportText,
  inferDateOrder,
  makePoem,
  parseWhatsApp,
  senderCounts,
  tryMakePoem,
  type BeamRequest,
  type PoemRequest,
} from '../src';
import {
  ambiguousDates,
  android12h,
  android24h,
  FAMILY_GROUP_MESSAGES,
  familyGroup,
  filler,
  ios12h,
  ios24h,
  sameInitials,
  withContactDetails,
} from './fixtures/whatsapp';

function request(file: string | Uint8Array, overrides: Partial<PoemRequest> = {}): PoemRequest {
  return { source: { kind: 'whatsapp', file }, occasion: 'birthday', giver: 'Sam', recipient: 'Mom', ...overrides };
}

/** The prompt's Snippet rows (`<id> <text>`), as Beam sees them. */
function promptSnippets(beamRequest: BeamRequest): { id: string; text: string }[] {
  return beamRequest.user.split('\n').flatMap((row) => {
    const match = /^(s\d+) (.+)$/.exec(row);
    return match ? [{ id: match[1]!, text: match[2]! }] : [];
  });
}

/** A Beam that picks every Snippet containing one of the fragments, and records what it was sent. */
function pickingBeam(...fragments: string[]) {
  return createFakeBeam((beamRequest) => ({
    picks: fragments.map((fragment) => {
      const found = promptSnippets(beamRequest).find((snippet) => snippet.text.includes(fragment));
      if (!found) throw new Error(`no Snippet containing "${fragment}" in the prompt`);
      return { id: found.id, note: `Because of "${fragment}".` };
    }),
  }));
}

/** Everything Beam was shown: the instructions and the Conversation. */
const everythingSent = (beam: { requests: readonly BeamRequest[] }) =>
  beam.requests.map((sent) => `${sent.system}\n${sent.user}`).join('\n');

describe('an Android export', () => {
  test('becomes a verified Poem whose Lines are verbatim, date-sorted, with Receipts of who and when', async () => {
    const beam = pickingBeam('Happy birthday, Mom', 'lemon cake from the lake house', 'porch light', 'whatever the hour');

    const { poem } = await makePoem(request(android24h), beam);

    expect(poem.verified).toBe(true);
    expect(poem.lines.map((line) => [line.text, line.receipt.sender, line.receipt.dateLabel])).toEqual([
      ['Remember the lemon cake from the lake house, with the burnt edges?', 'Mom', '12 March 2024'],
      ['Call me when you land, I will keep the porch light on.', 'Mom', '13 March 2024'],
      ['Happy birthday, Mom, thank you for every single Sunday dinner.', 'Sam', '28 May 2024'],
      ['You always answered, whatever the hour, and I never said how much that meant.', 'Mom', '31 May 2024'],
    ]);
  });
});

describe('what in an export is a Message', () => {
  test('a multi-line Message stays whole in one Snippet, whitespace collapsed', async () => {
    const beam = pickingBeam('Come for dinner on Sunday');

    const { poem } = await makePoem(request(android24h), beam);

    expect(poem.lines.map((line) => line.text)).toEqual(['Come for dinner on Sunday? Bring the good plates. And the blue jug, please.']);
  });

  test.each([
    ['Android', android24h],
    ['iOS', ios24h],
  ])('media, system, deleted and edited markers never reach Beam (%s)', async (_platform, file) => {
    const beam = pickingBeam('lemon cake');

    await makePoem(request(file), beam);

    const sent = everythingSent(beam);
    for (const leak of [
      'omitted',
      'attached',
      'IMG-',
      'WA0004',
      'end-to-end',
      'encrypted',
      'created group',
      'changed the subject',
      'changed their phone number',
      'deleted',
      'edited',
      'null',
    ]) {
      expect(sent, leak).not.toContain(leak);
    }
  });

  test('an edited Message keeps its words and loses the marker', async () => {
    const beam = pickingBeam('porch light');

    const { poem } = await makePoem(request(android24h), beam);

    expect(poem.lines.map((line) => line.text)).toEqual(['Call me when you land, I will keep the porch light on.']);
  });
});

describe('long chat Messages are split into Snippets however they are written', () => {
  /** A chat of filler plus the one Message under test, from Sam; returns the Snippets Beam was shown from it. */
  async function snippetsFrom(message: string): Promise<string[]> {
    const chat = [
      ...filler(15, (i, who, text) => `${String(i + 1).padStart(2, '0')}/04/2024, 12:00 - ${who}: ${text}`),
      `28/05/2024, 08:00 - Sam: ${message}`,
    ].join('\n');
    const beam = pickingBeam('Everyday note number 1:');
    await makePoem(request(chat), beam);
    return promptSnippets(beam.requests[0]!)
      .map((snippet) => snippet.text)
      .filter((text) => !text.startsWith('Everyday note'));
  }

  test('sentences that begin in lower case are still sentences: letters need capitals, chats do not', async () => {
    const message =
      'i was thinking about the lake house today. remember the burnt cake and the blue jug. ' +
      'we laughed so hard that the neighbours knocked on the wall. i miss that kind of silly evening more than i can say. ' +
      'anyway call me when you land. love you lots, see you soon, safe travels.';

    expect(await snippetsFrom(message)).toEqual([
      'i was thinking about the lake house today.',
      'remember the burnt cake and the blue jug.',
      'we laughed so hard that the neighbours knocked on the wall.',
      'i miss that kind of silly evening more than i can say.',
      'anyway call me when you land.',
      'love you lots, see you soon, safe travels.',
    ]);
  });

  test('a long Message written one thought a line, with no punctuation, becomes one Snippet per line', async () => {
    const message = [
      'got the keys from the neighbour this morning',
      'the porch light is on and the kettle is warm',
      'the blue jug is on the table for you',
      'dinner is whenever you get here, no rush at all',
      'drive safe and text me when you turn off the main road',
    ].join('\n');

    expect(await snippetsFrom(message)).toEqual([
      'got the keys from the neighbour this morning',
      'the porch light is on and the kettle is warm',
      'the blue jug is on the table for you',
      'dinner is whenever you get here, no rush at all',
      'drive safe and text me when you turn off the main road',
    ]);
  });

  test('abbreviations and ellipses do not end a lower-case sentence early', async () => {
    const message =
      'dr. okafor said the results are fine and e.g. the cough is nothing to worry about, which made me happier than i expected. ' +
      'wait... what did you mean by that last thing about the lake house and the burnt cake from years ago, i honestly lost the thread.';

    expect(await snippetsFrom(message)).toEqual([
      'dr. okafor said the results are fine and e.g. the cough is nothing to worry about, which made me happier than i expected.',
      'wait... what did you mean by that last thing about the lake house and the burnt cake from years ago, i honestly lost the thread.',
    ]);
  });

  test('a stretch with no break and no punctuation that is still over 40 words gives nothing, rather than a cut sentence', async () => {
    const message = Array(45).fill('and').join(' ') + ' then we left';

    expect(await snippetsFrom(message)).toEqual([]);
  });
});

describe('other shapes of the same export', () => {
  test('dotted dates with "p.m.", single-digit days, and year-first dates are all understood', async () => {
    const chat = [
      '31.12.23, 9.41 p.m. - Mom: Happy new year, my love, see you at the lake.',
      '2.1.24, 9:41 a.m. - Sam: Happy new year to you too, Mom, I miss the lake already.',
      '2024-03-12, 09:16 - Mom: Remember the lemon cake from the lake house, with the burnt edges?',
      `[2024-03-13 18:02:10] ~ Sam: I still dream about that cake, honestly.`,
      ...filler(12, (i, who, text) => `[2024-04-${String(i + 1).padStart(2, '0')} 12:00:00] ${who}: ${text}`),
    ].join('\n');

    const { poem } = await makePoem(
      request(chat),
      pickingBeam('Happy new year, my love', 'Happy new year to you', 'lemon cake', 'still dream'),
    );

    expect(poem.lines.map((line) => [line.receipt.sender, line.receipt.dateLabel])).toEqual([
      ['Mom', '31 December 2023'],
      ['Sam', '2 January 2024'],
      ['Mom', '12 March 2024'],
      ['Sam', '13 March 2024'],
    ]);
  });

  test('"p. m." and "a. m." with a space inside, in any kind of space, are 12-hour times too (Spanish and Portuguese exports)', async () => {
    const chat = [
      '31/12/23, 9:41 p. m. - Mom: Happy new year, my love, see you at the lake.',
      '1/1/24, 9:41\u202Fa.\u00A0m. - Sam: Happy new year to you too, Mom, I miss the lake already.',
      '[2/1/24, 10:05:30\u202FP. M.] Mom: Remember the lemon cake from the lake house, with the burnt edges?',
      '3/1/24, 6:02 a.m. - Sam: I still dream about that cake, honestly.',
      ...filler(12, (i, who, text) => `${15 + i}/4/24, 12:00 p. m. - ${who}: ${text}`),
    ].join('\n');

    const { poem } = await makePoem(
      request(chat),
      pickingBeam('Happy new year, my love', 'Happy new year to you', 'lemon cake', 'still dream'),
    );

    expect(poem.lines.map((line) => [line.receipt.sender, line.receipt.dateLabel])).toEqual([
      ['Mom', '31 December 2023'],
      ['Sam', '1 January 2024'],
      ['Mom', '2 January 2024'],
      ['Sam', '3 January 2024'],
    ]);
  });

  test('a line that merely starts with a number is a continuation, not a new Message', async () => {
    const chat = [
      '12/03/2024, 09:16 - Mom: Three things I want for my birthday:',
      '1. a long walk by the lake',
      '2. your lemon cake',
      '13/03/2024, 09:16 - Sam: You shall have both, I promise you that.',
      ...filler(14, (i, who, text) => `${String(i + 1).padStart(2, '0')}/04/2024, 12:00 - ${who}: ${text}`),
    ].join('\n');

    const { poem } = await makePoem(request(chat), pickingBeam('Three things'));

    expect(poem.lines.map((line) => line.text)).toEqual(['Three things I want for my birthday: 1. a long walk by the lake 2. your lemon cake']);
  });
});

describe('an export file', () => {
  const lemonCake = 'Remember the lemon cake from the lake house, with the burnt edges?';
  const asLine = (poem: { lines: { text: string; receipt: { dateLabel: string } }[] }) =>
    poem.lines.map((line) => [line.text, line.receipt.dateLabel]);

  test('an iOS .zip is opened and its _chat.txt read, media beside it left alone', async () => {
    const zip = zipSync({
      '_chat.txt': strToU8(ios24h),
      '00000012-PHOTO-2024-03-13-18-02-10.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    });

    const { poem } = await makePoem(request(zip), pickingBeam(lemonCake));

    expect(asLine(poem)).toEqual([[lemonCake, '12 March 2024']]);
  });

  test('an Android .zip with a differently named .txt is read too', async () => {
    const zip = zipSync({ 'WhatsApp Chat with Mom.txt': strToU8(android24h), 'IMG-20240313-WA0004.jpg': new Uint8Array([1, 2, 3]) });

    const { poem } = await makePoem(request(zip), pickingBeam(lemonCake));

    expect(asLine(poem)).toEqual([[lemonCake, '12 March 2024']]);
  });

  test('a .txt handed over as bytes is read as UTF-8, byte-order mark and all', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8(`${android24h}\n01/06/2024, 10:00 - Mom: Café au lait on the balcony, my love.`)]);

    const { poem } = await makePoem(request(bytes), pickingBeam('Café au lait'));

    expect(asLine(poem)).toEqual([['Café au lait on the balcony, my love.', '1 June 2024']]);
  });

  test('a zip with no chat in it, a damaged zip, and a file that is not a chat are each refused in plain words', () => {
    const noChat = zipSync({ 'holiday.jpg': new Uint8Array([1, 2, 3]) });
    const damaged = noChat.slice(0, 20);

    expect(() => parseWhatsApp(exportText(noChat))).toThrow(ExportError);
    expect(() => exportText(noChat)).toThrow(/no chat/i);
    expect(() => exportText(damaged)).toThrow(ExportError);
    expect(() => parseWhatsApp('Dear diary,\nnothing happened today.')).toThrow(/No WhatsApp Messages/);
  });
});

describe('a group chat', () => {
  const bystanders = ['Dad', 'Aunt Priya', '98765', 'garage key', 'landlord', 'forty pounds', 'lake house this weekend', 'holiday'];

  test('lists everyone who spoke, so the Giver can say who they are and who it is for', () => {
    expect(senderCounts(parseWhatsApp(familyGroup)).map((sender) => [sender.name, sender.messages])).toEqual([
      ['Mom', 8],
      ['Dad', 8],
      ['Sam', 8],
      ['Aunt Priya', 2],
      ['+91 98765 43210', 1],
    ]);
  });

  test("only the Giver's and the Recipient's Messages are ever sent to Beam", async () => {
    const beam = pickingBeam('lemon cake');

    const { poem, conversation } = await makePoem(request(familyGroup), beam);

    const sent = everythingSent(beam);
    for (const bystander of bystanders) expect(sent, bystander).not.toContain(bystander);
    expect(sent).toContain('I still dream about that cake');
    expect(sent).toContain('whatever the hour');
    expect(conversation.senders).toEqual(['Mom', 'Sam']);
    expect(conversation.messages.map((message) => message.ordinal)).toEqual(conversation.messages.map((_, i) => i));
    expect(conversation.messages).toHaveLength(FAMILY_GROUP_MESSAGES);
    expect(poem.recipient).toBe('Mom');
  });

  test('the Recipient can be any one of the others', async () => {
    const beam = pickingBeam('forty pounds');

    const { poem } = await makePoem(request(familyGroup, { recipient: 'Dad' }), beam);

    const sent = everythingSent(beam);
    expect(sent).not.toContain('lemon cake');
    expect(sent).not.toContain('whatever the hour');
    expect(poem.lines.map((line) => line.receipt.sender)).toEqual(['Dad']);
    expect(poem.recipient).toBe('Dad');
  });

  test('the size table counts only the two people\'s Snippets, not the whole group\'s', async () => {
    const beam = pickingBeam('lemon cake');

    const result = await tryMakePoem(request(familyGroup, { recipient: 'Aunt Priya' }), beam);

    // Sam wrote 8 usable Snippets and Aunt Priya 2; the group as a whole wrote far more than 15.
    expect(result).toMatchObject({ refused: 'not-enough', usableSnippets: 10 });
    expect(beam.requests).toHaveLength(0);
  });

  test('a Recipient who never spoke leaves too little for a Poem, and nothing is sent', async () => {
    const beam = pickingBeam('lemon cake');

    const result = await tryMakePoem(request(familyGroup, { recipient: 'Grandma' }), beam);

    expect(result).toMatchObject({ refused: 'not-enough' });
    expect(beam.requests).toHaveLength(0);
  });
});

describe('the Card of a chat Poem', () => {
  test('says "For <Recipient>", and carries nothing from anyone else or any phone number', async () => {
    const chat = `${familyGroup}\n12/03/2024, 09:30 - Mom: Ring me on +91 98765 11111 when you land, I will wait.`;

    const { poem, conversation } = await makePoem(request(chat), pickingBeam('lemon cake', 'Ring me on'));
    const card = renderCardHtml(poem, conversation);

    expect(card).toContain('<p class="for">For Mom</p>');
    for (const leak of ['Dad', 'Aunt Priya', 'garage key', 'landlord', '98765', '11111']) expect(card, leak).not.toContain(leak);
    expect(card).toContain('Ring me on [phone number] when you land');
  });
});

describe('phone numbers and email addresses', () => {
  test('are stripped before any Snippet is formed, leaving the sentence readable', async () => {
    const beam = pickingBeam('if the train is late', 'My landline', 'whenever you like', 'florist', 'wrong number');

    const { poem } = await makePoem(request(withContactDetails), beam);

    const sent = everythingSent(beam);
    for (const secret of ['98765', '43210', '7946', '0958', '07700', '900123', 'lemoncake@', 'example.com', '5551234567', '555-123-4567', 'first.last', 'mail.example', '@']) {
      expect(sent, secret).not.toContain(secret);
    }
    expect(poem.lines.map((line) => line.text)).toEqual([
      'Ring me on [phone number] if the train is late, I will wait at the gate.',
      'My landline is [phone number] and my mobile is [phone number], so ring either one.',
      'Write to [email address] whenever you like, I read it every morning.',
      'Dial [phone number] or [phone number] for the florist, then send her the lemon cake order.',
      'Sorry, wrong number. Use [email address] instead, please.',
    ]);
  });

  test('numbers that are not phone numbers (a flat, a date, a span of years) are left alone', async () => {
    const { poem } = await makePoem(request(withContactDetails), pickingBeam('Our flat number'));

    expect(poem.lines.map((line) => line.text)).toEqual([
      'Our flat number is 4812 and we moved there on 2024-03-05 after waiting from 1999-2024.',
    ]);
  });

  test('a Sender who is only a phone number never reaches Beam, and cannot be mistaken for another Sender', async () => {
    const beam = pickingBeam('lemon cake');

    const { poem } = await makePoem(request(sameInitials, { recipient: '+44 7700 900123' }), beam);

    const sent = everythingSent(beam);
    expect(sent).not.toContain('7700');
    expect(sent).not.toContain('900123');
    expect(poem.recipient).toBe('+44 7700 900123');
  });
});

describe('telling the two Senders apart in the prompt', () => {
  test('Senders whose names start with the same letter still get different labels', async () => {
    const beam = pickingBeam('lemon cake');

    await makePoem(request(sameInitials, { recipient: 'Sasha' }), beam);

    const headers = beam.requests[0]!.user.split('\n').filter((row) => row.startsWith('## '));
    expect(headers.slice(0, 3)).toEqual(['## S1 2024-03-12', '## S2 2024-03-12', '## S1 2024-03-13']);
    expect(headers.every((header) => /^## S[12] /.test(header))).toBe(true);
    expect(beam.requests[0]!.system).toContain('Sam (S1) and Sasha (S2)');
  });
});

describe('day and month order', () => {
  const birthday = 'Happy birthday, Mom, thank you for every single Sunday dinner.';

  test('any date component over 12 settles it', () => {
    expect(inferDateOrder(parseWhatsApp(android24h))).toBe('day-first');
    expect(inferDateOrder(parseWhatsApp(android12h))).toBe('month-first');
    expect(inferDateOrder(parseWhatsApp(ios24h))).toBe('day-first');
    expect(inferDateOrder(parseWhatsApp(ios12h))).toBe('month-first');
  });

  test('when every date reads validly both ways, the Giver is shown one Message and the two readings', () => {
    const exported = parseWhatsApp(ambiguousDates);

    expect(inferDateOrder(exported)).toBeNull();
    expect(dateQuestion(exported, ['Sam', 'Mom'])).toEqual({
      sender: 'Mom',
      text: 'Remember the lemon cake from the lake house, with the burnt edges?',
      dayFirst: '2024-06-03',
      monthFirst: '2024-03-06',
    });
  });

  test('Poem-making refuses to guess: without the Giver\'s answer an ambiguous export is rejected', async () => {
    await expect(makePoem(request(ambiguousDates), pickingBeam(birthday))).rejects.toBeInstanceOf(AmbiguousDatesError);
  });

  test.each([
    ['day-first', '5 June 2024'],
    ['month-first', '6 May 2024'],
  ] as const)('the chosen order (%s) is what the Receipts say', async (dateOrder, label) => {
    const file = ambiguousDates;
    const { poem } = await makePoem({ ...request(file), source: { kind: 'whatsapp', file, dateOrder } }, pickingBeam(birthday));

    expect(poem.lines.map((line) => line.receipt.dateLabel)).toEqual([label]);
  });
});

describe('the formats of an export', () => {
  const lemonCake = 'Remember the lemon cake from the lake house, with the burnt edges?';
  const birthday = 'Happy birthday, Mom, thank you for every single Sunday dinner.';

  test.each([
    ['Android 24h, day first', android24h],
    ['Android 12h with U+202F, month first', android12h],
    ['iOS 24h with U+200E marks, day first', ios24h],
    ['iOS 12h with U+202F, month first', ios12h],
  ])('%s is understood', async (_name, file) => {
    const { poem } = await makePoem(request(file), pickingBeam(birthday, lemonCake));

    expect(poem.lines.map((line) => [line.text, line.receipt.sender, line.receipt.dateLabel])).toEqual([
      [lemonCake, 'Mom', '12 March 2024'],
      [birthday, 'Sam', '28 May 2024'],
    ]);
  });
});
