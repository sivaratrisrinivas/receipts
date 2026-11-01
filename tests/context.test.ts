// What the Giver sees when they look behind a Line: the original Message it came from, and
// the Snippets a Note points back to. Both are for the Giver only; neither is part of a
// Line's Receipt or of anything that is exported.

import { describe, expect, test } from 'vitest';
import { createFakeBeam, makePoem, type Conversation, type PoemOutcome } from '../src';
import { contextOf, noteParts, unlinkedCallbacks } from '../src/context';
import { lineOf } from '../src/verification';
import { volumeOne, volumeTwo } from './fixtures/gallery';
import { idOf } from './support/prompt';

async function galleryPoem(fragments: string[]): Promise<PoemOutcome> {
  const beam = createFakeBeam((request) => ({ picks: fragments.map((fragment) => ({ id: idOf(request, fragment), note: 'A pick.' })) }));
  return makePoem(
    { source: { kind: 'gallery', texts: [volumeOne, volumeTwo] }, occasion: 'birthday', giver: 'Robert', recipient: 'Elizabeth' },
    beam,
  );
}

describe('tapping a Line shows the original Message', () => {
  test('a Line that is one sentence of a long letter shows the whole letter, with the sentence marked', async () => {
    const { poem, conversation } = await galleryPoem(['Dr. Chambers says I may walk']);

    const context = contextOf(conversation, poem.lines[0]!);

    expect(context).toEqual({
      sender: 'Elizabeth',
      dateLabel: '20 May 1845',
      before: 'You were kind to come, and kinder to go away when I was tired. ',
      snippet: 'Dr. Chambers says I may walk to the end of the street if the wind is quiet.',
      after: ' My sisters teased me all evening about the visitor and the flowers.',
    });
  });

  test('a Line that is a whole Message shows just that Message', async () => {
    const { poem, conversation } = await galleryPoem(['Thank you a thousand times for the flowers']);

    expect(contextOf(conversation, poem.lines[0]!)).toMatchObject({
      sender: 'Elizabeth',
      dateLabel: '13 January 1845',
      before: '',
      snippet: 'Thank you a thousand times for the flowers, which are standing on my table and have made the whole room smell of June.',
      after: '',
    });
  });

  test('a letter without a date of its own shows the approximate date its Receipt carries', async () => {
    const { poem, conversation } = await galleryPoem(['The post comes at nine']);

    expect(contextOf(conversation, poem.lines[0]!)?.dateLabel).toBe('c. 13 January 1845');
  });

  test('a short letter written in several paragraphs is shown whole, with its Line marked across the break', () => {
    const conversation: Conversation = {
      kind: 'letters',
      senders: ['Robert'],
      messages: [{ ordinal: 0, sender: 'Robert', date: '1845-03-02', approximate: false, text: 'Dear friend,\n\nCome on Tuesday.\n\nBring the book.' }],
    };
    const line = lineOf(
      { id: 's0', index: 0, messageOrdinal: 0, sender: 'Robert', date: '1845-03-02', approximate: false, text: 'Come on Tuesday. Bring the book.' },
      null,
      [],
    );

    expect(contextOf(conversation, line)).toMatchObject({ before: 'Dear friend,\n\n', snippet: 'Come on Tuesday.\n\nBring the book.', after: '' });
  });

  test('if the Line cannot be found inside its Message, the whole Message is shown unmarked', async () => {
    const { poem, conversation } = await galleryPoem(['Thank you a thousand times for the flowers']);

    const context = contextOf(conversation, { ...poem.lines[0]!, text: 'Words that are nowhere in that letter.' });

    expect(context).toMatchObject({ before: expect.stringContaining('Thank you a thousand times'), snippet: '', after: '' });
  });
});

describe('a Note points back to Snippets', () => {
  test('IDs the Note cites become links; everything else stays text', () => {
    expect(noteParts('A callback to s12, answering s7, unlike s9 or s120.', ['s12', 's7'])).toEqual([
      { text: 'A callback to ' },
      { callback: 's12' },
      { text: ', answering ' },
      { callback: 's7' },
      { text: ', unlike s9 or s120.' },
    ]);
  });

  test('a Note with no callbacks is one run of text', () => {
    expect(noteParts('The first thing he ever wrote to her.', [])).toEqual([{ text: 'The first thing he ever wrote to her.' }]);
  });

  test('a Note that opens or closes on an ID has no empty text around it', () => {
    expect(noteParts('s3 comes back as s4', ['s3', 's4'])).toEqual([{ callback: 's3' }, { text: ' comes back as ' }, { callback: 's4' }]);
  });
});

describe('callbacks the Note does not spell out', () => {
  test('Beam rarely writes the ID in the Note text, so every callback still gets a link of its own', () => {
    expect(unlinkedCallbacks('The first thing he ever wrote to her, echoed later.', ['s12', 's7'])).toEqual(['s12', 's7']);
  });

  test('a callback the Note text already links is not repeated, and each ID is listed once', () => {
    expect(unlinkedCallbacks('A callback to s12.', ['s12', 's7', 's7'])).toEqual(['s7']);
  });

  test('a Line with no callbacks has none to list', () => {
    expect(unlinkedCallbacks('Just a note.', [])).toEqual([]);
  });
});
