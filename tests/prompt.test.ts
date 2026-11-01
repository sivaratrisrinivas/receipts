// Seam: the prompt Beam is sent. Issue #1: on a long Conversation Beam kept running out of its
// completion budget, "reading" the Snippets one by one in its reasoning. The prompt now marks the
// timeline's quarters inside the Conversation, says there are too many Snippets to go through one
// by one, and repeats the ask after the Conversation. What is held here is the prompt's shape (a
// pure function of the Conversation); whether Beam finishes is measured live, not here.

import { describe, expect, test } from 'vitest';
import { createFakeBeam, makePoem, readConversation, snippetsOf, type BeamRequest, type PoemRequest } from '../src';
import { POEM_RESPONSE_FORMAT, QUARTER_MARKER_PREFIX, buildPrompt, renderSnippets, senderLabels } from '../src/prompt';
import { quarterBoundaries } from '../src/quarters';
import type { Conversation } from '../src/domain';
import { lettersOnDays, shortBody, volumeOfLetters } from './fixtures/letters';
import { promptSnippets } from './support/prompt';

/** Letters on these dates, like the Gallery: the Conversation is far denser late on than early. */
function requestOn(days: string[], { perDay = 1 } = {}): PoemRequest {
  return {
    source: { kind: 'gallery', texts: [volumeOfLetters(lettersOnDays(days, perDay, shortBody))] },
    occasion: 'birthday',
    giver: 'Robert',
    recipient: 'Elizabeth',
  };
}

/** `count` dates, `step` days apart, from `start`. */
function daysFrom(start: string, count: number, step: number): string[] {
  return Array.from({ length: count }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * step * 86_400_000).toISOString().slice(0, 10));
}

/**
 * Three years, 3 / 6 / 12 / 24 Messages in the four quarters, the last Message on the last day. No Message
 * falls on a boundary day, and the quarters open on 1845-01-10, 1845-11-01, 1846-08-01 and 1847-05-01.
 */
const everyQuarter = [...daysFrom('1845-01-10', 3, 20), ...daysFrom('1845-11-01', 6, 20), ...daysFrom('1846-08-01', 12, 20), ...daysFrom('1847-05-01', 23, 10), '1848-01-10'];
/** 5 / 0 / 15 / 25 Messages: nothing is said in the second quarter (June to October 1845). */
const quietSecondQuarter = [...daysFrom('1845-01-10', 5, 10), ...daysFrom('1845-11-15', 15, 7), ...daysFrom('1846-03-20', 25, 5), '1846-08-02'];

async function promptFor(request: PoemRequest): Promise<BeamRequest> {
  const beam = createFakeBeam((sent) => ({ picks: [{ id: /^(s\d+) /m.exec(sent.user)![1]!, note: 'Any.' }] }));
  await makePoem(request, beam);
  return beam.requests[0]!;
}

const markersOf = (user: string) => user.split('\n').filter((row) => row.startsWith(QUARTER_MARKER_PREFIX));

describe('the quarters are marked inside the Conversation', () => {
  test('a marker line opens each quarter, just before its first Message, with the quarter\'s dates', async () => {
    const request = requestOn(everyQuarter);
    const { user } = await promptFor(request);
    const bounds = quarterBoundaries(readConversation(request.source));

    expect(markersOf(user)).toEqual([
      `=== QUARTER 1 of 4: ${bounds[0]} to ${bounds[1]} ===`,
      `=== QUARTER 2 of 4: ${bounds[1]} to ${bounds[2]} ===`,
      `=== QUARTER 3 of 4: ${bounds[2]} to ${bounds[3]} ===`,
      `=== QUARTER 4 of 4: ${bounds[3]} to ${bounds[4]} ===`,
    ]);
    // Each marker is followed at once by the Message header that opens its quarter (dated on or after the
    // quarter's first day), and the last Message before it is dated earlier.
    const rows = user.split('\n');
    const dateOf = (row: string | undefined) => /^## \S+ c?\.?(\d{4}-\d{2}-\d{2})$/.exec(row ?? '')?.[1];
    markersOf(user).forEach((marker, quarter) => {
      const at = rows.indexOf(marker);
      expect(dateOf(rows[at + 1])! >= bounds[quarter]!).toBe(true);
      const headerBefore = rows.slice(0, at).reverse().find((row) => row.startsWith('## '));
      if (quarter === 0) expect(headerBefore).toBeUndefined();
      else expect(dateOf(headerBefore)! < bounds[quarter]!).toBe(true);
    });
    expect(markersOf(user).map((marker) => dateOf(rows[rows.indexOf(marker) + 1]))).toEqual(['1845-01-10', '1845-11-01', '1846-08-01', '1847-05-01']);
  });

  test('a quarter in which nothing was said gets no marker, and the instructions say so', async () => {
    const { user, system } = await promptFor(requestOn(quietSecondQuarter));

    expect(markersOf(user).map((marker) => /QUARTER (\d) of 4/.exec(marker)![1])).toEqual(['1', '3', '4']);
    expect(system).toMatch(/A quarter with no Messages has no marker/);
  });

  test('the instructions explain the markers, and the user message says what a "===" line is', async () => {
    const { user, system } = await promptFor(requestOn(everyQuarter));

    expect(system).toContain('marker lines (=== QUARTER n of 4: first date to last date ===)');
    expect(system).toMatch(/at least one Line from each quarter/i);
    expect(user.split('\n')[0]).toContain('a line starting "===" is a marker, not a Snippet');
  });
});

describe('the ID and format contract is unchanged', () => {
  test('the Snippet rows Beam can pick from are exactly the Snippets, in order, and nothing else looks like one', async () => {
    const request = requestOn(everyQuarter, { perDay: 2 });
    const { user } = await promptFor(request);
    const snippets = snippetsOf(readConversation(request.source));

    expect(promptSnippets({ user } as BeamRequest)).toEqual(snippets.map(({ id, text }) => ({ id, text })));
    // Markers and the closing ask are lines nobody could mistake for a Message header or a Snippet row.
    const others = user.split('\n').filter((row) => !/^## /.test(row) && !/^s\d+ /.test(row));
    expect(others.length).toBeGreaterThan(4);
    expect(others.some((row) => /^## |^s\d+ /.test(row))).toBe(false);
  });

  test('without the markers and the closing ask, the Conversation is rendered as it always was', async () => {
    const request = requestOn(everyQuarter, { perDay: 2 });
    const { user } = await promptFor(request);
    const conversation = readConversation(request.source);
    const snippets = snippetsOf(conversation);

    const plain = renderSnippets(snippets, senderLabels(conversation.senders));
    const marked = user.split('\n').filter((row) => !row.startsWith('===') && !row.startsWith('CONVERSATION') && !row.startsWith('Now choose'));
    expect(marked.join('\n')).toBe(plain);
  });

  test('Beam still answers with Snippet IDs and Notes in the same strict shape', () => {
    const conversation = readConversation(requestOn(everyQuarter).source);

    expect(buildPrompt({ conversation, snippets: snippetsOf(conversation), occasion: 'birthday', giver: 'Robert', recipient: 'Elizabeth' }).responseFormat).toBe(
      POEM_RESPONSE_FORMAT,
    );
    expect(POEM_RESPONSE_FORMAT.schema).toMatchObject({
      required: ['lines'],
      properties: { lines: { items: { required: ['id', 'note', 'callbacks'], additionalProperties: false } } },
    });
  });

  test('the markers and the closing ask add only a few hundred characters to a Conversation', async () => {
    const request = requestOn(everyQuarter, { perDay: 2 });
    const { user } = await promptFor(request);
    const conversation = readConversation(request.source);
    const plain = renderSnippets(snippetsOf(conversation), senderLabels(conversation.senders));

    expect(user.length - plain.length).toBeLessThan(1_200);
  });
});

describe('the ask is repeated after the Conversation', () => {
  test('the prompt ends with the ask: how many Lines, a Line in each quarter, both Senders, and the reasoning format', async () => {
    const { user } = await promptFor(requestOn(everyQuarter, { perDay: 2 }));
    const rows = user.split('\n');
    const end = rows.indexOf('=== END OF CONVERSATION ===');

    expect(end).toBeGreaterThan(0);
    expect(rows.slice(0, end).some((row) => row.startsWith('Now choose'))).toBe(false);
    expect(rows.slice(end + 1)).toHaveLength(1);
    const ask = rows[end + 1]!;
    expect(ask).toContain('Now choose 8 to 14 Snippets by ID (never more than 14)');
    expect(ask).toContain('at least one Line after each of the quarter markers above');
    expect(ask).toContain('Lines from both Senders (Robert (R) and Elizabeth (E))');
    expect(ask).toContain('"Q1: s12 s40 s77"');
  });

  test('a long Conversation is told it has too many Snippets to go through one by one; a short one is not', async () => {
    const long = await promptFor(requestOn(Array.from({ length: 1_000 }, (_, i) => new Date(Date.UTC(1845, 0, 10 + i)).toISOString().slice(0, 10))));
    const short = await promptFor(requestOn(everyQuarter));

    expect(long.system).toContain('The Conversation has 1,000 Snippets, far too many to go through one by one');
    expect(long.system).toContain('Think in one short line per quarter, naming 2 to 4 candidate IDs and nothing else');
    expect(short.system).not.toContain('far too many');
    expect(short.system).toContain('Think in one short line per quarter');
  });
});

describe('redaction is unaffected', () => {
  test('a Sender who is a phone number or an email address never reaches Beam through the markers or the closing ask', () => {
    const conversation: Conversation = {
      kind: 'chat',
      senders: ['+44 7700 900123', 'anne@example.com'],
      messages: [
        { ordinal: 0, sender: '+44 7700 900123', date: '2024-01-02', approximate: false, text: 'Good morning to you, and happy new year.' },
        { ordinal: 1, sender: 'anne@example.com', date: '2024-09-02', approximate: false, text: 'The kettle is on and the post has come.' },
      ],
    };

    const { system, user } = buildPrompt({
      conversation,
      snippets: snippetsOf(conversation),
      occasion: 'thank you',
      giver: '+44 7700 900123',
      recipient: 'anne@example.com',
      note: 'Write to anne@example.com or ring +44 7700 900123.',
    });

    for (const secret of ['7700', '900123', 'anne@', 'example.com']) {
      expect(system).not.toContain(secret);
      expect(user).not.toContain(secret);
    }
    expect(user).toContain('Lines from both Senders ([phone number] (#1) and [email address] (#2))');
    expect(markersOf(user)).toHaveLength(2);
  });
});
