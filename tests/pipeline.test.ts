// Seam 1: the Poem pipeline. Raw source text, an Occasion and a fake Beam port go in;
// a Poem comes out. Nothing here reaches inside the pipeline.

import { describe, expect, test } from 'vitest';
import { BeamError, createFakeBeam, makePoem, type BeamRequest, type PoemRequest } from '../src';
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

describe('turning letters into Snippets', () => {
  test('a letter without a date takes the nearest earlier date and shows "c." in its Receipt', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [
        { id: idOf(request, 'Thank you a thousand times for the flowers'), note: 'Dated.' },
        { id: idOf(request, 'The post comes at nine'), note: 'The next letter carries no date.' },
      ],
    }));

    const { poem } = await makePoem(galleryRequest, beam);

    expect(poem.lines.map((line) => line.receipt)).toMatchObject([
      { sender: 'Elizabeth', date: '1845-01-13', approximate: false, dateLabel: '13 January 1845' },
      { sender: 'Robert', date: '1845-01-13', approximate: true, dateLabel: 'c. 13 January 1845' },
    ]);
  });

  test('sentence splitting is abbreviation-safe: "Mr.", "Mrs." and "Dr." never end a Snippet', async () => {
    let offered: { id: string; text: string }[] = [];
    const beam = createFakeBeam((request) => {
      offered = promptSnippets(request);
      return {
        picks: [
          { id: idOf(request, 'Mr. Kenyon says'), note: 'Mr. mid-sentence.' },
          { id: idOf(request, 'dear Mr. Kenyon, the roses'), note: 'Mr. after a comma.' },
          { id: idOf(request, 'Mrs. Procter lent'), note: 'Mrs. opening a sentence.' },
          { id: idOf(request, 'Torquay--Dr. Chambers'), note: 'Dr. glued to a dash.' },
          { id: idOf(request, 'consult (Mrs. Procter)'), note: 'Mrs. and Mr. behind a bracket and a quote.' },
          { id: idOf(request, 'Dr. Chambers says'), note: 'Dr. mid-sentence, wrapped across lines.' },
        ],
      };
    });

    const { poem } = await makePoem(galleryRequest, beam);

    expect(offered.filter((snippet) => /\b(Mr|Mrs|Dr)\.['’)]*$/.test(snippet.text))).toEqual([]);
    expect(poem.lines.map((line) => line.text)).toEqual([
      'Mr. Kenyon says you read the Greek better than any man in London.',
      'Yes, but, dear Mr. Kenyon, the roses are out and so is the sun.',
      'Mrs. Procter lent me a book of yours and I have not slept since.',
      'Papa sent me down to Torquay--Dr. Chambers came too and told me to rest.',
      "He asked whether I might walk, and then said he would consult (Mrs. Procter) or 'Mr. Kenyon' before deciding.",
      'Dr. Chambers says I may walk to the end of the street if the wind is quiet.',
    ]);
  });

  test('letter Snippets start with a capital or quote, end with terminal punctuation, and run 3 to 40 words', async () => {
    let offered: string[] = [];
    const beam = createFakeBeam((request) => {
      offered = promptSnippets(request).map((snippet) => snippet.text);
      return { picks: [{ id: idOf(request, 'I wrote this on a wet afternoon'), note: 'Any real pick.' }] };
    });

    await makePoem(galleryRequest, beam);

    expect(offered.length).toBeGreaterThan(10);
    for (const text of offered) {
      expect(text, text).toMatch(/^["'‘“A-Z]/);
      expect(text, text).toMatch(/[.!?]["'’”)]*$/);
      const words = text.split(/\s+/).length;
      expect(words, text).toBeGreaterThanOrEqual(3);
      expect(words, text).toBeLessThanOrEqual(40);
    }
    // ... and the near-misses really were dropped, while the quote-led sentence was kept.
    expect(offered).not.toContain('and then, because I am foolish, I read it over again.');
    expect(offered).not.toContain('Write to me soon and tell me whether you are better--');
    expect(offered).not.toContain('Thank you.');
    expect(offered.filter((text) => text.includes('ever since the morning your letter came'))).toEqual([]);
    expect(offered).toContain(
      "'Tis a long way from the river to the hill, and yet your letter made the journey in a single morning.",
    );
  });

  test('Gutenberg boilerplate, front matter, notes, addresses, indexes and publisher ads never become Snippets', async () => {
    let prompt = '';
    const beam = createFakeBeam((request) => {
      prompt = request.user;
      return { picks: [{ id: idOf(request, 'Miss Thomson wants me'), note: 'The last real sentence of volume one.' }] };
    });

    const { poem } = await makePoem(galleryRequest, beam);

    for (const leak of [
      'Gutenberg',
      'license',
      'front matter',
      'Footnote',
      'editorial',
      'Wimpole',
      'Hatcham',
      'FIRST VOLUME',
      'Spottiswoode',
      'INDEX',
      'Transcriber',
      'Acton',
      'Aurora Leigh',
      'Waterloo',
      'publisher',
      'copyright',
    ]) {
      expect(prompt, `the prompt leaks "${leak}"`).not.toContain(leak);
    }
    // The cuts take only what comes after the last letter: its real sentences survive.
    expect(poem.lines.map((line) => line.text)).toEqual([
      'Miss Thomson wants me to translate a scene from the Iliad for her book.',
    ]);
  });

  test('Gutenberg files with Windows line endings read exactly the same', async () => {
    const pick = (request: BeamRequest) => ({
      picks: [{ id: idOf(request, 'I wrote this'), note: 'Any.' }, { id: idOf(request, 'Miss Thomson wants me'), note: 'Any.' }],
    });
    const unix = createFakeBeam(pick);
    const windows = createFakeBeam(pick);

    await makePoem(galleryRequest, unix);
    await makePoem(
      { ...galleryRequest, source: { kind: 'gallery', texts: [volumeOne, volumeTwo].map((t) => t.replace(/\n/g, '\r\n')) } },
      windows,
    );

    expect(windows.requests[0]!.user).toBe(unix.requests[0]!.user);
  });

  test('Gutenberg italics markers are not part of a Snippet', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [{ id: idOf(request, 'which made me laugh'), note: 'Emphasis in the original.' }],
    }));

    const { poem } = await makePoem(galleryRequest, beam);

    expect(poem.lines.map((line) => line.text)).toEqual(['It was that which made me laugh and then cry.']);
  });

  test('a letter of 40 words or fewer is one whole Snippet', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [{ id: idOf(request, 'The post comes at nine'), note: 'A whole short letter.' }],
    }));

    const { poem } = await makePoem(galleryRequest, beam);

    expect(poem.lines.map((line) => line.text)).toEqual([
      'I did not sleep, and I do not care. The post comes at nine and I am at the gate by eight. Tell me that the cough is better.',
    ]);
  });
});

describe('asking Beam', () => {
  test('the prompt groups Snippets under one "## <sender initial> <date>" header per Message', async () => {
    const beam = createFakeBeam((request) => ({ picks: [{ id: idOf(request, 'I wrote this'), note: 'Any.' }] }));

    await makePoem(galleryRequest, beam);

    const rows = beam.requests[0]!.user.split('\n');
    expect(rows.filter((row) => row.startsWith('## '))).toEqual([
      '## R 1845-01-10',
      '## E 1845-01-11',
      '## R 1845-01-13',
      '## E 1845-01-13',
      '## R c.1845-01-13',
      '## E 1845-05-20',
      '## R 1845-05-22',
      '## E 1845-09-12',
      '## R 1846-03-24',
      '## E 1846-09-11',
      '## R 1846-09-14',
    ]);
    const first = rows.indexOf('## R 1845-01-10');
    expect(rows[first + 1]).toMatch(/^s\d+ I wrote this on a wet afternoon and I mean every word of it, dear Miss Barrett\.$/);
    expect(rows[first + 2]).toMatch(/^s\d+ Mr\. Kenyon says you read the Greek/);
  });

  test('the instructions cover timeline spread, both Senders, privacy, ID-only reasoning and cited callbacks', async () => {
    const beam = createFakeBeam((request) => ({ picks: [{ id: idOf(request, 'I wrote this'), note: 'Any.' }] }));

    await makePoem({ ...galleryRequest, note: 'It is their first anniversary.' }, beam);

    const { system } = beam.requests[0]!;
    expect(system).toMatch(/read the whole conversation/i);
    expect(system).toMatch(/spread .*across the whole timeline/i);
    expect(system).toMatch(/at least one Line from each quarter/i);
    expect(system).toMatch(/Q1 1845-01-10 to /);
    expect(system).toMatch(/ to 1846-09-14\b/);
    expect(system).toMatch(/both Senders/i);
    expect(system).toMatch(/avoid private matters/i);
    expect(system).toMatch(/refer to Snippets by ID only/i);
    expect(system).toMatch(/cite the IDs of any callbacks/i);
  });

  test('the instructions name the Giver, the Recipient, the Occasion and the Giver\'s note', async () => {
    const beam = createFakeBeam((request) => ({ picks: [{ id: idOf(request, 'I wrote this'), note: 'Any.' }] }));

    await makePoem({ ...galleryRequest, note: 'It is their first anniversary.' }, beam);

    const { system } = beam.requests[0]!;
    expect(system).toContain('The Giver is Robert; the Recipient is Elizabeth.');
    expect(system).toContain('Occasion: anniversary.');
    expect(system).toContain('It is their first anniversary.');
  });
});

describe('narrowing what Beam reads', () => {
  test('Beam is shown only the Messages the narrowing step keeps, and the Poem comes from those alone', async () => {
    const beam = createFakeBeam((request) => ({
      picks: [{ id: idOf(request, 'Thank you a thousand times for the note'), note: 'The last letter.' }],
    }));

    const { poem, conversation } = await makePoem(galleryRequest, beam, {
      narrow: (full) => ({ ...full, messages: full.messages.slice(-2) }),
    });

    const rows = beam.requests[0]!.user.split('\n');
    expect(rows.filter((row) => row.startsWith('## '))).toEqual(['## E 1846-09-11', '## R 1846-09-14']);
    expect(rows.join('\n')).not.toContain('wet afternoon');
    expect(conversation.messages).toHaveLength(2);
    // Receipts still point at the Message's place in the full Conversation.
    expect(poem.lines[0]?.receipt.messageOrdinal).toBe(10);
  });
});

describe('when Beam does not deliver', () => {
  test('truncation (finish_reason length, no content) surfaces as a retryable error', async () => {
    const beam = createFakeBeam(() => ({ truncated: true }));

    const attempt = makePoem(galleryRequest, beam);

    await expect(attempt).rejects.toBeInstanceOf(BeamError);
    await expect(attempt).rejects.toMatchObject({ reason: 'truncated', retryable: true });
  });

  test('an answer that is not the agreed JSON surfaces as a retryable error', async () => {
    for (const raw of ['Sorry, I cannot help with that.', '{"lines": "none"}', '{"lines": [{"id": 7}]}']) {
      const attempt = makePoem(galleryRequest, createFakeBeam(() => ({ raw })));

      await expect(attempt, raw).rejects.toMatchObject({ reason: 'invalid-response', retryable: true });
    }
  });

  test('an answer with no real Snippet in it surfaces as a retryable error rather than an empty Poem', async () => {
    const beam = createFakeBeam(() => ({ picks: [{ id: 's99999', note: 'Not a thing.' }] }));

    await expect(makePoem(galleryRequest, beam)).rejects.toMatchObject({
      reason: 'invalid-response',
      retryable: true,
    });
  });

  test('reasoning progress is reported while Beam reads', async () => {
    const beam = createFakeBeam((request) => ({ picks: [{ id: idOf(request, 'I wrote this'), note: 'Any.' }] }), {
      reasoningProgress: [1_000, 20_000, 33_000],
    });
    const seen: number[] = [];

    await makePoem(galleryRequest, beam, { onProgress: ({ reasoningTokens }) => seen.push(reasoningTokens) });

    expect(seen).toEqual([1_000, 20_000, 33_000]);
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

  test('a Snippet Beam picks twice becomes one Line, and that does not withhold the badge', async () => {
    const beam = createFakeBeam((request) => {
      const id = idOf(request, 'I wrote this on a wet afternoon');
      return {
        picks: [
          { id, note: 'First mention.' },
          { id, note: 'Second mention.' },
        ],
      };
    });

    const { poem } = await makePoem(galleryRequest, beam);

    expect(poem.lines.map((line) => [line.text.slice(0, 20), line.note])).toEqual([['I wrote this on a we', 'First mention.']]);
    expect(poem.verified).toBe(true);
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
