// Seam: Gallery Poems at load. Stored picks and the Gallery's text go in; Poems come out,
// rebuilt through the same verification as a live Poem, so what is shown is verified by
// code and never trusted text.

import { describe, expect, test } from 'vitest';
import { readConversation, snippetsOf, type Occasion, type Snippet } from '../src';
import { buildGalleryPoems } from '../src/gallery-poems/build';
import { fingerprintOf, type GalleryPick, type GalleryPicks } from '../src/gallery-poems/picks';
import { volumeOne, volumeTwo } from './fixtures/gallery';

const texts = [volumeOne, volumeTwo];
const snippets: Snippet[] = snippetsOf(readConversation({ kind: 'gallery', texts }));

/** The ID of the Snippet containing `fragment`, as picks refer to it. */
function idOf(fragment: string): string {
  const found = snippets.find((snippet) => snippet.text.includes(fragment));
  if (!found) throw new Error(`no Snippet containing "${fragment}"`);
  return found.id;
}

function picksFor(poems: Partial<Record<Occasion, GalleryPick[]>>): GalleryPicks {
  return { gallery: fingerprintOf(snippets), poems };
}

const first = { id: idOf('I wrote this on a wet afternoon'), note: 'Where it began.', callbacks: [] };
const middle = { id: idOf('Come and see the sea'), note: 'An invitation, answered much later.', callbacks: [] };
const last = { id: idOf('Thank you a thousand times for the note'), note: 'Gratitude, still, a year on.', callbacks: [first.id] };

describe('Gallery Poems are rebuilt from picks, never trusted', () => {
  test('each Occasion\'s picks become a verified Poem of verbatim Lines with Receipts, in date order', () => {
    const { poems } = buildGalleryPoems(texts, picksFor({ birthday: [last, first, middle] }));

    expect(poems).toHaveLength(1);
    expect(poems[0]).toMatchObject({ occasion: 'birthday', giver: 'Robert', recipient: 'Elizabeth', verified: true });
    expect(poems[0]!.lines.map((line) => [line.text, line.receipt.sender, line.receipt.dateLabel])).toEqual([
      ['I wrote this on a wet afternoon and I mean every word of it, dear Miss Barrett.', 'Robert', '10 January 1845'],
      ['Come and see the sea with me in the spring.', 'Robert', '13 January 1845'],
      ['Thank you a thousand times for the note, my own Ba. The boxes are safely sent and all is well.', 'Robert', '14 September 1846'],
    ]);
  });

  test('Notes and callbacks come along with their Lines', () => {
    const { poems } = buildGalleryPoems(texts, picksFor({ sorry: [first, last] }));

    expect(poems[0]!.lines.map((line) => [line.note, line.callbacks])).toEqual([
      ['Where it began.', []],
      ['Gratitude, still, a year on.', [first.id]],
    ]);
  });

  test('Poems follow the order of the Occasions, and an Occasion with no picks has none', () => {
    const { poems } = buildGalleryPoems(texts, picksFor({ farewell: [first], birthday: [middle], 'thank you': [last] }));

    expect(poems.map((poem) => poem.occasion)).toEqual(['birthday', 'thank you', 'farewell']);
  });

  test('the Conversation comes back too, so a Card can show the messages around each Line', () => {
    const { conversation } = buildGalleryPoems(texts, picksFor({}));

    expect(conversation.senders).toEqual(['Robert', 'Elizabeth']);
    expect(conversation.messages.length).toBeGreaterThan(5);
  });

  test('a pick that is not a real Snippet leaves its whole Poem out, while the others still show', () => {
    const { poems } = buildGalleryPoems(texts, picksFor({ birthday: [first, { id: 's99999', note: 'Made up.', callbacks: [] }], sorry: [first, middle] }));

    expect(poems.map((poem) => poem.occasion)).toEqual(['sorry']);
  });

  test('picks made against different Gallery text are refused outright, because their IDs would point elsewhere', () => {
    const edited = [volumeOne.replace('I wrote this on a wet afternoon', 'I wrote this on a dry afternoon'), volumeTwo];

    expect(() => buildGalleryPoems(edited, picksFor({ birthday: [first] }))).toThrow(/different/i);
  });
});
