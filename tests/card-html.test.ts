// Seam 2: the HTML Card. A Poem (and the Conversation it came from) goes in; one
// self-contained HTML document comes out. Tests read the document the way a person would,
// through its Lines, Receipts and the context behind each Line, never its internals.

import { describe, expect, test } from 'vitest';
import { CARD_TITLE_MAX, renderCardHtml } from '../src/card';
import { createFakeBeam, makePoem, type BeamRequest, type Conversation } from '../src';
import { volumeOne, volumeTwo } from './fixtures/gallery';
import { marker, poemOf, twelveMessages } from './fixtures/card';

const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** The text a reader sees in a fragment: tags gone, entities decoded, whitespace collapsed. */
function readable(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => entities[entity]!)
    .replace(/\s+/g, ' ')
    .trim();
}

function inner(fragment: string, selector: string): string {
  const match = new RegExp(`<(\\w+) class="${selector}[ "][^>]*>([\\s\\S]*?)</\\1>`).exec(fragment);
  return match ? match[2]! : '';
}

interface ShownLine {
  text: string;
  receipt: string;
  context: { who: string; when: string; text: string; source: boolean }[];
}

/** The Lines of a Card as a reader meets them: the Line, its Receipt, and what expands under it. */
function shownLines(html: string): ShownLine[] {
  const body = html.slice(html.indexOf('<main'), html.indexOf('<footer'));
  return body
    .split('<li class="line"')
    .slice(1)
    .map((chunk) => ({
      text: readable(inner(chunk, 'line-text')),
      receipt: readable(inner(chunk, 'receipt')),
      context: [...chunk.matchAll(/<li class="msg( is-source)?">([\s\S]*?)<\/li>/g)].map((match) => ({
        who: readable(inner(match[2]!, 'msg-who')),
        when: readable(inner(match[2]!, 'msg-when')),
        text: readable(inner(match[2]!, 'msg-text')),
        source: match[1] !== undefined,
      })),
    }));
}

describe('a Line and its Receipt', () => {
  test("every Line is shown word for word, in the Poem's order, with who said it and when", () => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [1, 3, 8]);

    const lines = shownLines(renderCardHtml(poem, conversation));

    expect(lines.map((line) => [line.text, line.receipt])).toEqual([
      [`${marker(1)} said at length that this was one of the good ones.`, 'Elizabeth · 9 January 2024'],
      [`${marker(3)} said at length that this was one of the good ones.`, 'Elizabeth · 14 February 2024'],
      [`${marker(8)} said at length that this was one of the good ones.`, 'Robert · 10 September 2024'],
    ]);
  });

  test('an estimated date keeps its "c." in the Receipt', () => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [5, 6]);

    const lines = shownLines(renderCardHtml(poem, conversation));

    expect(lines.map((line) => line.receipt)).toEqual(['Elizabeth · 1 May 2024', 'Robert · c. 21 June 2024']);
  });
});

describe('the context behind a Line', () => {
  const said = (ordinal: number) => `${marker(ordinal)} said at length that this was one of the good ones.`;

  test('a Line expands to its own Message and the two Messages either side, in Conversation order', () => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [5]);

    const [line] = shownLines(renderCardHtml(poem, conversation));

    expect(line!.context).toEqual([
      { who: 'Elizabeth', when: '14 February 2024', text: said(3), source: false },
      { who: 'Robert', when: '30 March 2024', text: said(4), source: false },
      { who: 'Elizabeth', when: '1 May 2024', text: said(5), source: true },
      { who: 'Robert', when: 'c. 21 June 2024', text: said(6), source: false },
      { who: 'Elizabeth', when: '4 July 2024', text: said(7), source: false },
    ]);
  });

  test('at the start or end of the Conversation there are simply fewer Messages around the Line', () => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [0, 11]);

    const [first, last] = shownLines(renderCardHtml(poem, conversation));

    expect(first!.context.map((message) => message.text)).toEqual([said(0), said(1), said(2)]);
    expect(last!.context.map((message) => message.text)).toEqual([said(9), said(10), said(11)]);
  });

  test('nothing else from the Conversation is in the Card', () => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [2, 9]);

    const html = renderCardHtml(poem, conversation);

    const shown = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11];
    const hidden = [5, 6];
    for (const ordinal of shown) expect(html).toContain(marker(ordinal));
    for (const ordinal of hidden) expect(html).not.toContain(marker(ordinal));
  });

  test('a Line whose Message cannot be found in the Conversation is still shown, without context', () => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [4]);
    poem.lines[0]!.receipt.messageOrdinal = 999;

    const [line] = shownLines(renderCardHtml(poem, conversation));

    expect(line!.text).toBe(said(4));
    expect(line!.context).toEqual([]);
  });
});

/** The foot of the Card, where the badge and the framing sit. */
const foot = (html: string) => html.slice(html.indexOf('<footer'));

describe('the badge', () => {
  test('a verified Poem carries the "every line is real" badge at the foot of the Card', () => {
    const conversation = twelveMessages();
    const html = renderCardHtml(poemOf(conversation, [1, 4, 8], { verified: true }), conversation);

    expect(readable(inner(foot(html), 'badge'))).toContain('Every line is real');
  });

  test('a Poem that did not verify has no badge anywhere', () => {
    const conversation = twelveMessages();
    const html = renderCardHtml(poemOf(conversation, [1, 4, 8], { verified: false }), conversation);

    expect(html).not.toMatch(/every line is real/i);
    expect(html).not.toContain('class="badge');
  });
});

describe("Beam's Notes", () => {
  test('a Note, and whatever it refers back to, is nowhere in the Card', () => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [1, 4, 8]);
    poem.lines[1]!.note = 'PRIVATE-NOTE: she mentioned this again in April';
    poem.lines[1]!.callbacks = ['s1'];
    poem.lines[2]!.note = 'PRIVATE-NOTE: a callback to the first Line';

    const html = renderCardHtml(poem, conversation);

    expect(html).not.toContain('PRIVATE-NOTE');
    expect(html).not.toContain('she mentioned this again');
    expect(html).not.toContain('a callback to the first Line');
  });
});

describe('who it is for and what it says it is', () => {
  test('the Card is addressed "For" the Recipient', () => {
    const conversation = twelveMessages();
    const html = renderCardHtml(poemOf(conversation, [1, 4, 8], { recipient: 'Elizabeth' }), conversation);

    expect(readable(inner(html, 'for'))).toBe('For Elizabeth');
  });

  test('it says the Lines were assembled from many real Messages sent over time', () => {
    const conversation = twelveMessages();
    const html = renderCardHtml(poemOf(conversation, [1, 4, 8]), conversation);

    expect(readable(inner(foot(html), 'framing'))).toContain(
      'Assembled from 3 real messages, sent between 9 January 2024 and 10 September 2024.',
    );
  });

  test('Lines that share one Message are counted once, and one day is not a span', () => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [2, 3]);
    poem.lines.push({ ...poem.lines[1]!, snippetId: 's3-again' });

    const html = renderCardHtml(poem, conversation);

    expect(readable(inner(foot(html), 'framing'))).toContain('Assembled from 2 real messages, sent on 14 February 2024.');
  });
});

describe("the Giver's title", () => {
  const render = (title?: string) => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [1, 4, 8]);
    return renderCardHtml(poem, conversation, title === undefined ? {} : { title });
  };

  test('a title the Giver wrote is shown on the Card', () => {
    expect(readable(inner(render('Eleven years, in your own words'), 'title'))).toBe('Eleven years, in your own words');
  });

  test('without one the Card has no title at all: Beam writes nothing on it', () => {
    const html = render();

    expect(html).not.toContain('class="title');
    expect(html).not.toContain('<h1');
  });

  test('a blank title is no title, and stray spaces are tidied', () => {
    expect(render('  \n ')).not.toContain('class="title');
    expect(readable(inner(render('  Our   year \n'), 'title'))).toBe('Our year');
  });

  test('a title is kept to a sensible length', () => {
    const long = 'x'.repeat(CARD_TITLE_MAX + 50);

    expect(readable(inner(render(long), 'title'))).toBe('x'.repeat(CARD_TITLE_MAX));
  });
});

describe('a self-contained document', () => {
  const hostile = '<script>alert(1)</script> & "quotes" <img src=x onerror=alert(2)>';

  function hostileCard() {
    const conversation = twelveMessages();
    conversation.messages[4]!.text = `${hostile} said at length.`;
    conversation.messages[4]!.sender = 'Rob <b>bold</b>';
    const poem = poemOf(conversation, [4], { recipient: 'Eliza & <i>co</i>' });
    return renderCardHtml(poem, conversation, { title: `<u>${hostile}</u>` });
  }

  test('all text is escaped, so nothing a Message says can become markup', () => {
    const html = hostileCard();

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html).not.toContain('<u>');
    expect(readable(inner(html, 'title'))).toBe(`<u>${hostile}</u>`);
    expect(shownLines(html)[0]!.text).toBe(`${hostile} said at length.`);
    expect(shownLines(html)[0]!.receipt).toContain('Rob <b>bold</b>');
    expect(readable(inner(html, 'for'))).toBe('For Eliza & <i>co</i>');
  });

  test('it is one complete page that cannot reach the network or run script', () => {
    const conversation = twelveMessages();
    const html = renderCardHtml(poemOf(conversation, [1, 4, 8]), conversation);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1">/);
    expect(html).toMatch(/<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">/);
    expect(html).toContain('<style>');
    for (const external of ['<link', '<script', '<img', '<iframe', 'src=', '@import', 'url(']) {
      expect(html).not.toContain(external);
    }
    expect(html).not.toMatch(/https?:\/\//);
  });

  test('the Lines can be expanded and collapsed with no script', () => {
    const conversation = twelveMessages();
    const html = renderCardHtml(poemOf(conversation, [1, 4]), conversation);

    expect(html.match(/<details class="context"><summary>/g)).toHaveLength(2);
    expect(html).not.toMatch(/<details[^>]* open/);
  });

  test('it prints as one clean Card, without the buttons and the context', () => {
    const conversation = twelveMessages();
    const html = renderCardHtml(poemOf(conversation, [1, 4]), conversation);
    const print = /@media print\s*{([\s\S]*?)}\s*<\/style>/.exec(html)?.[1] ?? '';

    expect(print).toContain('.context');
    expect(print).toContain('@page');
  });
});

describe('where a Line sits in its Message', () => {
  function marked(text: string, snippet: string) {
    const conversation: Conversation = {
      kind: 'letters',
      senders: ['Robert', 'Elizabeth'],
      messages: [{ ordinal: 0, sender: 'Robert', date: '1845-01-10', approximate: false, text }],
    };
    const poem = poemOf(twelveMessages(), [1]);
    poem.lines[0] = { ...poem.lines[0]!, text: snippet, receipt: { ...poem.lines[0]!.receipt, messageOrdinal: 0 } };
    const html = renderCardHtml(poem, conversation);
    return [...html.matchAll(/<mark>([\s\S]*?)<\/mark>/g)].map((match) => readable(match[1]!));
  }

  test('the Line is picked out within a longer Message', () => {
    expect(marked('Dear Miss Barrett. I wrote this on a wet afternoon. Yours ever.', 'I wrote this on a wet afternoon.')).toEqual([
      'I wrote this on a wet afternoon.',
    ]);
  });

  test('even where the Message breaks its paragraphs differently from the Line', () => {
    expect(marked('Dear Miss Barrett.\n\nI wrote this on a\nwet afternoon.\n\nYours ever.', 'Barrett. I wrote this on a wet afternoon.')).toEqual([
      'Barrett. I wrote this on a wet afternoon.',
    ]);
  });
});

describe('a Card made from a Poem the pipeline produced', () => {
  const idOf = (request: BeamRequest, fragment: string) =>
    request.user.split('\n').flatMap((row) => (row.includes(fragment) ? [/^(s\d+) /.exec(row)![1]!] : []))[0]!;

  test('letters keep their "c." dates, their context, and the Line picked out in its letter', async () => {
    // Six Lines make a Poem; the first two are the ones under test, the rest come after them.
    const beam = createFakeBeam((request) => ({
      picks: [
        { id: idOf(request, 'I wrote this on a wet afternoon'), note: 'PRIVATE-NOTE: the first letter.' },
        { id: idOf(request, 'The post comes at nine'), note: 'PRIVATE-NOTE: undated, so c.' },
        ...['You were kind to come', 'I have read your letter again', 'I am unhappy enough', 'My own dearest'].map((fragment) => ({
          id: idOf(request, fragment),
          note: 'PRIVATE-NOTE: later on.',
        })),
      ],
    }));
    const { poem, conversation } = await makePoem(
      { source: { kind: 'gallery', texts: [volumeOne, volumeTwo] }, occasion: 'anniversary', giver: 'Robert', recipient: 'Elizabeth' },
      beam,
    );

    const html = renderCardHtml(poem, conversation, { title: 'Our first year' });
    const [first, second] = shownLines(html);

    expect(second!.receipt).toBe('Robert · c. 13 January 1845');
    expect(first!.context.map((message) => message.who)).toEqual(['Robert', 'Elizabeth', 'Robert']);
    expect(second!.context.map((message) => message.text.slice(0, 22))).toEqual([
      'Dear Miss Barrett,--I ',
      'Thank you a thousand t',
      'I did not sleep, and I',
      'You were kind to come,',
      'I have read your lette',
    ]);
    expect(second!.context.map((message) => message.when)).toContain('c. 13 January 1845');
    expect([...html.matchAll(/<mark>([\s\S]*?)<\/mark>/g)].map((match) => readable(match[1]!)).slice(0, 2)).toEqual([
      'I wrote this on a wet afternoon and I mean every word of it, dear Miss Barrett.',
      'I did not sleep, and I do not care. The post comes at nine and I am at the gate by eight. Tell me that the cough is better.',
    ]);
    expect(html).not.toContain('PRIVATE-NOTE');
    expect(html).not.toContain('Gutenberg');
  });
});
