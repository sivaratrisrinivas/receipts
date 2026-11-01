// Seam 2, the PNG: the same Poem that makes the HTML Card is drawn on a canvas. There is
// no browser here, so the canvas is a stand-in that records what was written on it; what
// matters is what a person would read off the finished image.

import { describe, expect, test } from 'vitest';
import { cardContent, drawCard, MAX_CANVAS_PIXELS, wrapText, type Surface } from '../src/card';
import { marker, poemOf, twelveMessages } from './fixtures/card';

interface Written {
  text: string;
  x: number;
  y: number;
}

/** A canvas that records every string written on it. Each character is `charWidth` px wide. */
function recordingCanvas(charWidth = 10) {
  const written: Written[] = [];
  const made: { width: number; height: number }[] = [];
  const makeSurface = (width: number, height: number): Surface => {
    made.push({ width, height });
    const context = {
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillRect() {},
      strokeRect() {},
      scale() {},
      measureText: (text: string) => ({ width: text.length * charWidth }),
      fillText(text: string, x: number, y: number) {
        written.push({ text, x, y });
      },
    };
    return { width, height, getContext: () => context as unknown as ReturnType<Surface['getContext']> };
  };
  return { makeSurface, written, made, everything: () => written.map((entry) => entry.text).join(' ') };
}

function draw(options: { title?: string; verified?: boolean; lines?: number[]; charWidth?: number } = {}) {
  const conversation = twelveMessages();
  const poem = poemOf(conversation, options.lines ?? [1, 4, 6, 8], { verified: options.verified ?? true });
  const canvas = recordingCanvas(options.charWidth);
  const surface = drawCard(cardContent(poem, conversation, options.title === undefined ? {} : { title: options.title }), canvas.makeSurface);
  return { ...canvas, surface, poem };
}

describe('the PNG says what the HTML Card says', () => {
  test('it is addressed to the Recipient and carries every Line with its Receipt, "c." dates included', () => {
    const { everything } = draw();

    expect(everything()).toContain('FOR ELIZABETH');
    for (const ordinal of [1, 4, 6, 8]) expect(everything()).toContain(marker(ordinal));
    expect(everything()).toContain('ELIZABETH · 9 JANUARY 2024');
    expect(everything()).toContain('ROBERT · C. 21 JUNE 2024');
  });

  test("Lines come in the Poem's order, each followed by its own Receipt", () => {
    const { written } = draw();
    const texts = written.map((entry) => entry.text);

    const at = [1, 4, 6, 8].map((ordinal) => texts.findIndex((text) => text.includes(marker(ordinal))));

    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at.map((index) => texts[index! + 1])).toEqual([
      'ELIZABETH · 9 JANUARY 2024',
      'ROBERT · 30 MARCH 2024',
      'ROBERT · C. 21 JUNE 2024',
      'ROBERT · 10 SEPTEMBER 2024',
    ]);
  });

  test('it makes clear the Lines were assembled from many Messages over time', () => {
    const { everything } = draw();

    expect(everything()).toContain('Assembled from 4 real messages, sent between 9 January 2024 and 10 September 2024.');
  });

  test('the badge is at the foot of a verified Poem and absent otherwise', () => {
    const verified = draw({ verified: true });
    const unverified = draw({ verified: false });

    const badge = verified.written.find((entry) => entry.text.includes('EVERY LINE IS REAL'))!;
    const lastLine = verified.written.find((entry) => entry.text.includes(marker(8)))!;
    expect(badge.y).toBeGreaterThan(lastLine.y);
    expect(unverified.everything()).not.toMatch(/every line is real/i);
  });

  test('a title the Giver wrote is on it; without one, the first thing after "For" is the first Line', () => {
    const titled = draw({ title: 'Our year' }).written.map((entry) => entry.text);
    const untitled = draw().written.map((entry) => entry.text);

    expect(titled.slice(0, 2)).toEqual(['FOR ELIZABETH', 'Our year']);
    expect(untitled[0]).toBe('FOR ELIZABETH');
    expect(untitled[1]).toContain(marker(1));
  });

  test("Beam's Notes cannot reach it", () => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [1, 4]);
    poem.lines[0]!.note = 'PRIVATE-NOTE: the reason Beam chose this';
    const canvas = recordingCanvas();

    drawCard(cardContent(poem, conversation), canvas.makeSurface);

    expect(canvas.everything()).not.toContain('PRIVATE-NOTE');
  });
});

describe('the PNG layout', () => {
  test('a long Line wraps inside the Card, every word kept in order', () => {
    const conversation = twelveMessages();
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const poem = poemOf(conversation, [1]);
    poem.lines[0]!.text = long;
    const canvas = recordingCanvas(20);

    const surface = drawCard(cardContent(poem, conversation), canvas.makeSurface);

    const rows = canvas.written.filter((entry) => entry.text.startsWith('word'));
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map((row) => row.text).join(' ')).toBe(long);
    for (const row of rows) expect(row.text.length * 20).toBeLessThanOrEqual(surface.width - 2 * 96);
  });

  test('the canvas is tall enough for everything written on it', () => {
    const { written, surface } = draw({ lines: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });

    expect(Math.max(...written.map((entry) => entry.y))).toBeLessThan(surface.height);
  });

  test("a Card too big for a phone browser's canvas is drawn smaller rather than not at all", () => {
    const conversation = twelveMessages();
    const poem = poemOf(conversation, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1]);
    for (const line of poem.lines) line.text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const canvas = recordingCanvas(500);

    const surface = drawCard(cardContent(poem, conversation), canvas.makeSurface);

    expect(Math.max(...canvas.made.map((made) => made.width * made.height))).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(surface.width).toBeLessThan(1080);
  });

  test('wrapText breaks on words, never inside one', () => {
    expect(wrapText('one two three four', 85, (text) => text.length * 10)).toEqual(['one two', 'three', 'four']);
    expect(wrapText('unbreakable', 30, (text) => text.length * 10)).toEqual(['unbreakable']);
    expect(wrapText('', 100, (text) => text.length * 10)).toEqual([]);
  });
});
