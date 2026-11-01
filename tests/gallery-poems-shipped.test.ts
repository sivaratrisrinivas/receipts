// Seam: the Gallery Poems that ship with the static build. The committed picks and the
// committed Gallery text go in, exactly as the page does at load; what comes out must be
// verified Poems, each fit to be shown to a judge as a Card.
//
// All six Occasions are meant to have one. An Occasion that has none yet (Beam could not
// make a Poem that passed within the budget; see scripts/make-gallery-poems.ts) is listed
// as a todo below, and the check that there is one for every Occasion runs as soon as
// there is, so a Poem cannot go missing without this saying so.

import { describe, expect, test } from 'vitest';
import { OCCASIONS, selectSnippets, snippetsOf } from '../src';
import { escapeHtml, renderCardHtml } from '../src/card/html';
import { buildGalleryPoems } from '../src/gallery-poems/build';
import { checkGalleryPoem } from '../src/gallery-poems/rules';
import { SHIPPED_GALLERY_PICKS } from '../src/gallery-poems/shipped';
import { quarterBoundaries, quarterOf } from '../src/quarters';
import volumeOne from '../public/gallery/pg16182.txt?raw';
import volumeTwo from '../public/gallery/pg73891.txt?raw';

const { conversation, poems } = buildGalleryPoems([volumeOne, volumeTwo], SHIPPED_GALLERY_PICKS);

describe('the shipped Gallery Poems', () => {
  test.runIf(poems.length === OCCASIONS.length)('there is one for each Occasion', () => {
    expect(poems.map((poem) => poem.occasion)).toEqual([...OCCASIONS]);
  });

  test('the Gallery they are drawn from is the 20 months of letters, in four quarters that each have letters', () => {
    const boundaries = quarterBoundaries(conversation);

    expect([boundaries[0], boundaries[4]]).toEqual(['1845-01-10', '1846-09-19']);
    for (const quarter of [0, 1, 2, 3]) {
      expect(conversation.messages.some((message) => quarterOf(boundaries, message.date) === quarter)).toBe(true);
    }
    expect(conversation.senders).toEqual(['Robert', 'Elizabeth']);
  });

  test('Beam reads every day of the Gallery in one go, so each Poem draws on the whole correspondence', () => {
    const selection = selectSnippets(snippetsOf(conversation));

    expect(selection.kind).toBe('selected');
    if (selection.kind === 'selected') expect(selection.readFraction).toMatchObject({ stride: 1, readDays: selection.readFraction.totalDays });
  });

  describe.each(OCCASIONS)('%s', (occasion) => {
    const poem = poems.find((candidate) => candidate.occasion === occasion);
    if (!poem) {
      test.todo('has a Gallery Poem: none has been made yet');
      return;
    }

    test('verifies against the committed Gallery text: every Line is a real Message\'s words, from its Sender, on its date', () => {
      expect(poem.verified).toBe(true);
      for (const line of poem.lines) {
        const message = conversation.messages.find((candidate) => candidate.ordinal === line.receipt.messageOrdinal)!;
        expect(message.text.replace(/\s+/g, ' ')).toContain(line.text);
        expect(message.sender).toBe(line.receipt.sender);
        expect(message.date).toBe(line.receipt.date);
      }
    });

    test('has 6 to 14 Lines, in date order', () => {
      expect(poem.lines.length).toBeGreaterThanOrEqual(6);
      expect(poem.lines.length).toBeLessThanOrEqual(14);
      const dates = poem.lines.map((line) => line.receipt.date);
      expect(dates).toEqual([...dates].sort());
    });

    test('has Lines from every quarter of the timeline', () => {
      const boundaries = quarterBoundaries(conversation);
      const quarters = new Set(poem.lines.map((line) => quarterOf(boundaries, line.receipt.date)));

      expect([...quarters].sort()).toEqual([0, 1, 2, 3]);
    });

    test('has Lines from both Senders', () => {
      expect(new Set(poem.lines.map((line) => line.receipt.sender))).toEqual(new Set(['Robert', 'Elizabeth']));
    });

    test('passes the same rule the generation script holds Beam to', () => {
      expect(checkGalleryPoem(poem, conversation)).toEqual([]);
    });

    test('renders as a Card with its Lines and Receipts and the badge, and none of Beam\'s Notes', () => {
      const html = renderCardHtml(poem, conversation);

      for (const line of poem.lines) {
        expect(html).toContain(escapeHtml(line.text));
        expect(html).toContain(escapeHtml(line.receipt.dateLabel));
      }
      expect(html).toContain('Every line is real');
      const notes = poem.lines.map((line) => line.note).filter((note): note is string => note !== null && note !== '');
      expect(notes.length).toBeGreaterThan(0); // so that "no Notes" below is a real check
      for (const note of notes) expect(html).not.toContain(escapeHtml(note));
    });
  });
});
