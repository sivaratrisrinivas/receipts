// Seam 1: the Poem pipeline. Raw source text, an Occasion and a fake Beam port go in;
// a Poem comes out. Nothing here reaches inside the pipeline.

import { describe, expect, test } from 'vitest';
import { createFakeBeam, makePoem, type BeamRequest, type PoemRequest } from '../src';
import { volumeOne, volumeTwo } from './fixtures/gallery';

const galleryRequest: PoemRequest = {
  source: { kind: 'gallery', texts: [volumeOne, volumeTwo] },
  occasion: 'anniversary',
  giver: 'Robert',
  recipient: 'Elizabeth',
};

/** The prompt's Snippet rows (`<id> <text>`), as Beam sees them. */
function promptSnippets(request: BeamRequest): { id: string; text: string }[] {
  return request.user.split('\n').flatMap((row) => {
    const match = /^(s\d+) (.+)$/.exec(row);
    return match ? [{ id: match[1]!, text: match[2]! }] : [];
  });
}

/** The ID Beam would see for the Snippet containing `fragment`. */
function idOf(request: BeamRequest, fragment: string): string {
  const found = promptSnippets(request).find((snippet) => snippet.text.includes(fragment));
  if (!found) throw new Error(`no Snippet containing "${fragment}" in the prompt`);
  return found.id;
}

describe('making a Poem from the Gallery', () => {
  test('every Line is a verbatim Snippet with a Receipt of who said it and when', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [
        { id: idOf(request, 'I wrote this on a wet afternoon'), note: 'The first letter.' },
        { id: idOf(request, 'I am unhappy enough'), note: 'A confession.' },
      ],
    }));

    const { poem } = await makePoem(galleryRequest, beam);

    expect(poem.lines.map((line) => [line.text, line.receipt.sender, line.receipt.dateLabel])).toEqual([
      ['I wrote this on a wet afternoon and I mean every word of it, dear Miss Barrett.', 'Robert', '10 January 1845'],
      ['I am unhappy enough even where I am happy, but ungrateful nowhere.', 'Elizabeth', '12 September 1845'],
    ]);
  });

  test('Lines are sorted by date, with ties broken by Message order, whatever order Beam picked', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [
        { id: idOf(request, 'I am unhappy enough'), note: 'Latest.' },
        { id: idOf(request, 'Thank you a thousand times for the flowers'), note: 'Same day, second letter.' },
        { id: idOf(request, 'Come and see the sea'), note: 'Same day, first letter.' },
        { id: idOf(request, 'I wrote this on a wet afternoon'), note: 'Earliest.' },
      ],
    }));

    const { poem } = await makePoem(galleryRequest, beam);

    expect(poem.lines.map((line) => [line.receipt.dateLabel, line.text.slice(0, 20)])).toEqual([
      ['10 January 1845', 'I wrote this on a we'],
      ['13 January 1845', 'Come and see the sea'],
      ['13 January 1845', 'Thank you a thousand'],
      ['12 September 1845', 'I am unhappy enough '],
    ]);
  });

  test('Line text always comes from the Conversation, never from Beam', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [
        {
          id: idOf(request, 'I wrote this on a wet afternoon'),
          note: 'Beam tries to smuggle in words of its own.',
          text: 'I have secretly always loved you.',
        },
      ],
    }));

    const { poem } = await makePoem(galleryRequest, beam);

    expect(poem.lines.map((line) => line.text)).toEqual([
      'I wrote this on a wet afternoon and I mean every word of it, dear Miss Barrett.',
    ]);
  });
});

describe('verifying what Beam picked', () => {
  test('the badge is set when every pick is a real Snippet', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [
        { id: idOf(request, 'I wrote this on a wet afternoon'), note: 'First.' },
        { id: idOf(request, 'I am unhappy enough'), note: 'Last.' },
      ],
    }));

    const { poem } = await makePoem(galleryRequest, beam);

    expect(poem.verified).toBe(true);
  });

  test('unknown IDs are rejected and the badge is withheld', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [
        { id: idOf(request, 'I wrote this on a wet afternoon'), note: 'Real.' },
        { id: 's99999', note: 'Beam made this ID up.' },
        { id: 'not-an-id', note: 'So did this.' },
        { id: idOf(request, 'I am unhappy enough'), note: 'Real.' },
      ],
    }));

    const { poem } = await makePoem(galleryRequest, beam);

    expect(poem.lines.map((line) => line.snippetId)).toEqual([
      expect.stringMatching(/^s\d+$/),
      expect.stringMatching(/^s\d+$/),
    ]);
    expect(poem.lines.map((line) => line.text)).toEqual([
      'I wrote this on a wet afternoon and I mean every word of it, dear Miss Barrett.',
      'I am unhappy enough even where I am happy, but ungrateful nowhere.',
    ]);
    expect(poem.verified).toBe(false);
  });

  test('a Note keeps the callbacks that point at real Snippets', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [
        {
          id: idOf(request, 'I am unhappy enough'),
          note: 'Answers the first letter.',
          callbacks: [idOf(request, 'I wrote this on a wet afternoon')],
        },
      ],
    }));

    const { poem, snippets } = await makePoem(galleryRequest, beam);

    const first = snippets.find((snippet) => snippet.text.startsWith('I wrote this on a wet afternoon'));
    expect(poem.lines[0]).toMatchObject({ note: 'Answers the first letter.', callbacks: [first?.id] });
  });

  test('a Note citing an unknown callback ID is dropped, but its Line stays and still verifies', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [
        {
          id: idOf(request, 'I am unhappy enough'),
          note: 'Echoes something that was never said.',
          callbacks: [idOf(request, 'I wrote this on a wet afternoon'), 's99999'],
        },
      ],
    }));

    const { poem } = await makePoem(galleryRequest, beam);

    expect(poem.lines).toHaveLength(1);
    expect(poem.lines[0]).toMatchObject({ note: null, callbacks: [] });
    expect(poem.verified).toBe(true);
  });
});
