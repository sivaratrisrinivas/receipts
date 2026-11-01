// Seam 1, continued: the Giver works with the Poem. A real Poem made through the pipeline
// with a fake Beam goes in; removing and replacing Lines comes out. Nothing here reaches
// inside the editing module.

import { describe, expect, test } from 'vitest';
import { BeamError, createFakeBeam, makePoem, type PoemOutcome } from '../src';
import { renderCardHtml } from '../src/card';
import { EditError, draftOf, removeLine, replaceLine } from '../src/editing';
import { volumeOne, volumeTwo } from './fixtures/gallery';
import { idOf, promptSnippets } from './support/prompt';

/** Six Lines spread over the Gallery, picked in a scrambled order. */
const PICKED = [
  'Nobody else has ever looked',
  'I wrote this on a wet afternoon',
  'I am unhappy enough',
  'Come and see the sea',
  'I never write more gladly',
  'The post comes at nine',
];

async function galleryPoem(fragments: string[] = PICKED): Promise<PoemOutcome> {
  const beam = createFakeBeam((request) => ({
    picks: fragments.map((fragment) => ({ id: idOf(request, fragment), note: `Why: ${fragment}.` })),
  }));
  return makePoem(
    { source: { kind: 'gallery', texts: [volumeOne, volumeTwo] }, occasion: 'anniversary', giver: 'Robert', recipient: 'Elizabeth' },
    beam,
  );
}

const startsOf = (lines: { text: string }[]) => lines.map((line) => line.text.slice(0, 18));

describe('removing a Line', () => {
  test('drops that Line and keeps the rest in date order', async () => {
    const { poem } = await galleryPoem();
    expect(startsOf(poem.lines)).toEqual([
      'I wrote this on a ',
      'Come and see the s',
      'I did not sleep, a',
      'I have read your l',
      'I am unhappy enoug',
      'My own dearest, if',
    ]);

    const afterwards = removeLine(draftOf(poem), poem.lines[2]!.snippetId);

    expect(startsOf(afterwards.poem.lines)).toEqual([
      'I wrote this on a ',
      'Come and see the s',
      'I have read your l',
      'I am unhappy enoug',
      'My own dearest, if',
    ]);
    expect(afterwards.poem.lines.map((line) => line.receipt.date)).toEqual([
      '1845-01-10',
      '1845-01-13',
      '1845-05-22',
      '1845-09-12',
      '1846-03-24',
    ]);
  });
});

/** A fake Beam for a replacement: it answers with the ID of the offered Snippet containing `fragment`. */
function replacingWith(fragment: string) {
  return createFakeBeam((request) => ({ raw: JSON.stringify({ id: idOf(request, fragment) }) }));
}

describe('replacing a Line', () => {
  test('asks Beam once, and the new Line is a Snippet from the same period, in the same place', async () => {
    const { poem, snippets } = await galleryPoem();
    const beam = replacingWith('Thank you a thousand times for the flowers');

    const { poem: edited } = await replaceLine({ draft: draftOf(poem), snippetId: poem.lines[2]!.snippetId, snippets, beam });

    expect(beam.requests).toHaveLength(1);
    expect(edited.lines.map((line) => [line.receipt.sender, line.receipt.dateLabel, line.text.slice(0, 18)])).toEqual([
      ['Robert', '10 January 1845', 'I wrote this on a '],
      ['Robert', '13 January 1845', 'Come and see the s'],
      ['Elizabeth', '13 January 1845', 'Thank you a thousa'],
      ['Robert', '22 May 1845', 'I have read your l'],
      ['Elizabeth', '12 September 1845', 'I am unhappy enoug'],
      ['Robert', '24 March 1846', 'My own dearest, if'],
    ]);
  });

  test('Beam is shown only the Snippets between the neighbouring Lines, minus the Line being replaced', async () => {
    const { poem, snippets } = await galleryPoem();
    const beam = replacingWith('Thank you a thousand times for the flowers');

    await replaceLine({ draft: draftOf(poem), snippetId: poem.lines[2]!.snippetId, snippets, beam });

    expect(promptSnippets(beam.requests[0]!).map((snippet) => snippet.text)).toEqual([
      'Thank you a thousand times for the flowers, which are standing on my table and have made the whole room smell of June.',
      'You were kind to come, and kinder to go away when I was tired.',
      'Dr. Chambers says I may walk to the end of the street if the wind is quiet.',
      'My sisters teased me all evening about the visitor and the flowers.',
    ]);
  });

  test('a Snippet the Giver already removed is never offered again', async () => {
    const { poem, snippets } = await galleryPoem([...PICKED, 'Dr. Chambers says I may walk']);
    const chambers = poem.lines.find((line) => line.text.startsWith('Dr. Chambers'))!;
    const draft = removeLine(draftOf(poem), chambers.snippetId);
    const beam = replacingWith('Thank you a thousand times for the flowers');

    await replaceLine({ draft, snippetId: draft.poem.lines[2]!.snippetId, snippets, beam });

    const offered = promptSnippets(beam.requests[0]!).map((snippet) => snippet.text);
    expect(offered).not.toContain(chambers.text);
    expect(offered).toContain('My sisters teased me all evening about the visitor and the flowers.');
  });
});

describe('an invalid replacement is rejected', () => {
  /** What Beam answers with: an ID the pipeline would not accept, or one it must not. */
  const misbehaviours: [string, (outcome: PoemOutcome) => string][] = [
    ['an ID that is not in the Conversation', () => 's99999'],
    ['a real Snippet from a different period', (outcome) => outcome.snippets.find((snippet) => snippet.text.startsWith('Mr. Kenyon says'))!.id],
    ['the Line being replaced', (outcome) => outcome.poem.lines[2]!.snippetId],
    ['a neighbouring Line', (outcome) => outcome.poem.lines[3]!.snippetId],
    ['an empty ID', () => ''],
  ];

  test.each(misbehaviours)('%s', async (_name, badId) => {
    const outcome = await galleryPoem();
    const draft = draftOf(outcome.poem);
    const beam = createFakeBeam(() => ({ raw: JSON.stringify({ id: badId(outcome) }) }));

    const failure = await replaceLine({ draft, snippetId: outcome.poem.lines[2]!.snippetId, snippets: outcome.snippets, beam }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(BeamError);
    expect(failure).toMatchObject({ reason: 'invalid-response', retryable: true });
    expect(draft.poem).toBe(outcome.poem);
  });

  test('a Snippet the Giver removed is rejected even if Beam names it anyway', async () => {
    const outcome = await galleryPoem([...PICKED, 'Dr. Chambers says I may walk']);
    const chambers = outcome.poem.lines.find((line) => line.text.startsWith('Dr. Chambers'))!;
    const draft = removeLine(draftOf(outcome.poem), chambers.snippetId);
    const beam = createFakeBeam(() => ({ raw: JSON.stringify({ id: chambers.snippetId }) }));

    const failure = await replaceLine({ draft, snippetId: draft.poem.lines[2]!.snippetId, snippets: outcome.snippets, beam }).catch((e: unknown) => e);

    expect(failure).toMatchObject({ reason: 'invalid-response' });
  });

  test.each([
    ['not JSON', 'Take the one about the sea.'],
    ['JSON without an ID', JSON.stringify({ pick: 's3' })],
    ['an ID that is not a string', JSON.stringify({ id: 3 })],
  ])('an answer that is %s', async (_name, raw) => {
    const outcome = await galleryPoem();
    const beam = createFakeBeam(() => ({ raw }));

    const failure = await replaceLine({ draft: draftOf(outcome.poem), snippetId: outcome.poem.lines[2]!.snippetId, snippets: outcome.snippets, beam }).catch((e: unknown) => e);

    expect(failure).toMatchObject({ reason: 'invalid-response', retryable: true });
  });

  test('a truncated answer is a retryable error', async () => {
    const outcome = await galleryPoem();
    const beam = createFakeBeam(() => ({ truncated: true }));

    const failure = await replaceLine({ draft: draftOf(outcome.poem), snippetId: outcome.poem.lines[2]!.snippetId, snippets: outcome.snippets, beam }).catch((e: unknown) => e);

    expect(failure).toMatchObject({ reason: 'truncated', retryable: true });
  });
});

describe('what replacing leaves behind', () => {
  test('the new Line is the Snippet looked up from the Conversation, whatever else Beam sends', async () => {
    const outcome = await galleryPoem();
    const beam = createFakeBeam((request) => ({
      raw: JSON.stringify({ id: idOf(request, 'Thank you a thousand times'), text: 'I have secretly always loved you.', note: 'Trust me.' }),
    }));

    const { poem } = await replaceLine({ draft: draftOf(outcome.poem), snippetId: outcome.poem.lines[2]!.snippetId, snippets: outcome.snippets, beam });

    expect(poem.lines[2]).toMatchObject({
      text: 'Thank you a thousand times for the flowers, which are standing on my table and have made the whole room smell of June.',
      receipt: { sender: 'Elizabeth', dateLabel: '13 January 1845' },
      note: null,
      callbacks: [],
    });
    expect(poem.verified).toBe(outcome.poem.verified);
  });

  test('Beam is asked for one ID in a strict schema, and shown the Occasion and the Line being replaced', async () => {
    const outcome = await galleryPoem();
    const beam = replacingWith('Thank you a thousand times');

    await replaceLine({ draft: draftOf(outcome.poem), snippetId: outcome.poem.lines[2]!.snippetId, snippets: outcome.snippets, beam });

    const [request] = beam.requests;
    expect(request!.responseFormat.schema).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string' } },
    });
    expect(request!.system).toContain('Occasion: anniversary');
    expect(request!.user).toContain('I did not sleep, and I do not care.');
  });

  test('the replaced Snippet is not offered again by a later replacement', async () => {
    const outcome = await galleryPoem();
    const first = replacingWith('Thank you a thousand times');
    const afterFirst = await replaceLine({ draft: draftOf(outcome.poem), snippetId: outcome.poem.lines[2]!.snippetId, snippets: outcome.snippets, beam: first });
    const second = replacingWith('You were kind to come');

    await replaceLine({ draft: afterFirst, snippetId: afterFirst.poem.lines[2]!.snippetId, snippets: outcome.snippets, beam: second });

    const offered = promptSnippets(second.requests[0]!).map((snippet) => snippet.text.slice(0, 22));
    expect(offered).not.toContain('I did not sleep, and I');
    expect(offered).not.toContain('Thank you a thousand ti');
    expect(offered).toContain('You were kind to come,');
  });

  test('the first and last Lines can be replaced too, within the stretch up to their one neighbour', async () => {
    const outcome = await galleryPoem();
    const first = replacingWith('Mr. Kenyon says');
    const last = replacingWith('At from half-past three');

    const afterFirst = await replaceLine({ draft: draftOf(outcome.poem), snippetId: outcome.poem.lines[0]!.snippetId, snippets: outcome.snippets, beam: first });
    const afterLast = await replaceLine({ draft: draftOf(outcome.poem), snippetId: outcome.poem.lines[5]!.snippetId, snippets: outcome.snippets, beam: last });

    expect(afterFirst.poem.lines[0]!.text).toBe('Mr. Kenyon says you read the Greek better than any man in London.');
    expect(afterLast.poem.lines[5]!.text).toMatch(/^At from half-past three to four, then\./);
    // Beam sees nothing beyond the one neighbour each of them has.
    expect(promptSnippets(first.requests[0]!).some((snippet) => snippet.text.startsWith('Come and see'))).toBe(false);
    expect(promptSnippets(last.requests[0]!).some((snippet) => snippet.text.startsWith('I am unhappy enough'))).toBe(false);
  });

  test('with nothing else left in the period it says so without calling Beam', async () => {
    // Three Snippets side by side in one letter: nothing lies between the first and the last.
    const outcome = await galleryPoem(['I wrote this on a wet afternoon', 'Mr. Kenyon says', 'I laughed aloud in the omnibus']);
    const beam = replacingWith('Mr. Kenyon says');

    const failure = await replaceLine({ draft: draftOf(outcome.poem), snippetId: outcome.poem.lines[1]!.snippetId, snippets: outcome.snippets, beam }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(EditError);
    expect(failure).toMatchObject({ reason: 'no-alternatives' });
    expect(beam.requests).toHaveLength(0);
  });
});

describe('only the Giver and the Recipient are heard', () => {
  test('a Snippet from anyone else is never offered to Beam, and is rejected if Beam names it anyway', async () => {
    const outcome = await galleryPoem();
    const bystander = outcome.snippets.find((snippet) => snippet.text.startsWith('Thank you a thousand times'))!;
    const snippets = outcome.snippets.map((snippet) => (snippet === bystander ? { ...snippet, sender: 'Papa' } : snippet));
    const beam = createFakeBeam(() => ({ raw: JSON.stringify({ id: bystander.id }) }));

    const failure = await replaceLine({ draft: draftOf(outcome.poem), snippetId: outcome.poem.lines[2]!.snippetId, snippets, beam }).catch((e: unknown) => e);

    expect(promptSnippets(beam.requests[0]!).map((snippet) => snippet.id)).not.toContain(bystander.id);
    expect(failure).toMatchObject({ reason: 'invalid-response' });
  });
});

describe('what the Giver can never do', () => {
  test('whatever they remove or replace, every Line stays its Snippet\'s own text, in date order', async () => {
    const outcome = await galleryPoem();
    let draft = draftOf(outcome.poem);
    draft = removeLine(draft, draft.poem.lines[4]!.snippetId);
    draft = await replaceLine({ draft, snippetId: draft.poem.lines[2]!.snippetId, snippets: outcome.snippets, beam: replacingWith('You were kind to come') });
    draft = await replaceLine({ draft, snippetId: draft.poem.lines[0]!.snippetId, snippets: outcome.snippets, beam: replacingWith('Mr. Kenyon says') });
    draft = removeLine(draft, draft.poem.lines[1]!.snippetId);

    const snippetTexts = new Map(outcome.snippets.map((snippet) => [snippet.id, snippet.text]));
    expect(draft.poem.lines.every((line) => line.text === snippetTexts.get(line.snippetId))).toBe(true);
    const dates = draft.poem.lines.map((line) => line.receipt.date);
    expect(dates).toEqual([...dates].sort());
    expect(draft.poem.lines).toHaveLength(4);
  });

  test('a Poem keeps at least one Line, and only a Line it has can be removed', async () => {
    const { poem } = await galleryPoem(['I wrote this on a wet afternoon', 'Come and see the sea']);
    const one = removeLine(draftOf(poem), poem.lines[0]!.snippetId);

    expect(() => removeLine(one, one.poem.lines[0]!.snippetId)).toThrowError(expect.objectContaining({ reason: 'last-line' }));
    expect(() => removeLine(one, poem.lines[0]!.snippetId)).toThrowError(expect.objectContaining({ reason: 'unknown-line' }));
  });
});

describe('an edited Poem still leaves its Notes behind', () => {
  test('after removing and replacing, the Card made from the Poem holds no Note and no callback', async () => {
    const outcome = await galleryPoem();
    let draft = removeLine(draftOf(outcome.poem), outcome.poem.lines[4]!.snippetId);
    draft = await replaceLine({ draft, snippetId: draft.poem.lines[2]!.snippetId, snippets: outcome.snippets, beam: replacingWith('You were kind to come') });
    // A Note from Beam, with a callback, on a Line that survived the edits.
    const withNote = { ...draft.poem, lines: draft.poem.lines.map((line, i) => (i === 0 ? { ...line, note: 'PRIVATE-NOTE: it echoes s3', callbacks: ['s3'] } : line)) };

    const html = renderCardHtml(withNote, outcome.conversation);

    expect(html).toContain('You were kind to come');
    expect(html).not.toContain('PRIVATE-NOTE');
    expect(html).not.toContain('echoes');
  });
});
