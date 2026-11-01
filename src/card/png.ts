// The PNG Card, drawn with Canvas 2D: no library, no fonts to embed, and a fixed width
// whatever the screen. It is drawn from the same CardContent as the HTML Card, so it says
// the same thing (and, having no Notes to draw, cannot leak one). This module only needs a
// canvas-like surface, so it runs in Node tests against a recording stand-in.

import type { CardContent } from './content';
import { BADGE_NOTE, BADGE_TITLE, COLORS, MONO, SERIF } from './look';

/** The part of CanvasRenderingContext2D the Card is drawn with. */
export type Drawing = Pick<
  CanvasRenderingContext2D,
  | 'font'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'textAlign'
  | 'textBaseline'
  | 'fillRect'
  | 'strokeRect'
  | 'fillText'
  | 'measureText'
  | 'scale'
> & { letterSpacing?: string };

/** An HTMLCanvasElement, or anything shaped like one. */
export interface Surface {
  width: number;
  height: number;
  getContext(id: '2d'): Drawing | null;
}

/** iOS Safari refuses canvases larger than this many pixels. */
export const MAX_CANVAS_PIXELS = 16_777_216;

const WIDTH = 1080;
const PAD = 96;
const INNER = WIDTH - PAD * 2;

const LINE_FONT = `italic 46px ${SERIF}`;
const TITLE_FONT = `46px ${SERIF}`;
const SMALL_MONO = `24px ${MONO}`;
const FRAMING_FONT = `italic 28px ${SERIF}`;

/** Break `text` into rows no wider than `maxWidth`, only ever between words. */
export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const rows: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && measure(next) > maxWidth) {
      rows.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) rows.push(current);
  return rows;
}

type Op =
  | { type: 'text'; text: string; y: number; font: string; color: string; spacing: number }
  | { type: 'rule'; y: number }
  | { type: 'stamp'; y: number; height: number };

function layout(card: CardContent, measure: (font: string, text: string) => number): { height: number; ops: Op[] } {
  const ops: Op[] = [];
  const rowsOf = (font: string, text: string) => wrapText(text, INNER, (row) => measure(font, row));

  let y = 150;
  ops.push({ type: 'text', text: `FOR ${card.recipient.toUpperCase()}`, y, font: SMALL_MONO, color: COLORS.muted, spacing: 4 });

  if (card.title !== null) {
    y += 14;
    for (const row of rowsOf(TITLE_FONT, card.title)) {
      y += 60;
      ops.push({ type: 'text', text: row, y, font: TITLE_FONT, color: COLORS.ink, spacing: 0 });
    }
  }
  y += 70;

  card.lines.forEach((line, index) => {
    if (index > 0) ops.push({ type: 'rule', y: y - 52 });
    for (const row of rowsOf(LINE_FONT, line.text)) {
      y += 64;
      ops.push({ type: 'text', text: row, y, font: LINE_FONT, color: COLORS.ink, spacing: 0 });
    }
    y += 48;
    // The Receipt is small caps in spirit: upper-cased monospace, as canvas has no small-caps.
    ops.push({ type: 'text', text: `${line.sender} · ${line.dateLabel}`.toUpperCase(), y, font: SMALL_MONO, color: COLORS.muted, spacing: 3 });
    y += 96;
  });

  if (card.verified) {
    ops.push({ type: 'stamp', y, height: 130 });
    ops.push({ type: 'text', text: BADGE_TITLE.toUpperCase(), y: y + 58, font: `bold 30px ${MONO}`, color: COLORS.stamp, spacing: 5 });
    ops.push({ type: 'text', text: BADGE_NOTE, y: y + 98, font: `24px ${SERIF}`, color: COLORS.stamp, spacing: 0 });
    y += 130 + 70;
  }

  for (const row of rowsOf(FRAMING_FONT, card.framing)) {
    y += 40;
    ops.push({ type: 'text', text: row, y, font: FRAMING_FONT, color: COLORS.muted, spacing: 0 });
  }

  return { height: y + 100, ops };
}

/**
 * Draw the Card 1080 px wide (shrunk only if it would be too big for a canvas) and as tall
 * as it needs to be. `makeSurface` creates a canvas, e.g. in the browser:
 * `(width, height) => Object.assign(document.createElement('canvas'), { width, height })`.
 */
export function drawCard<S extends Surface>(card: CardContent, makeSurface: (width: number, height: number) => S): S {
  const scratch = makeSurface(WIDTH, 10).getContext('2d');
  if (!scratch) throw new Error('This browser cannot draw the Card.');
  const { height, ops } = layout(card, (font, text) => {
    scratch.font = font;
    return scratch.measureText(text).width;
  });

  const scale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (WIDTH * height)));
  const surface = makeSurface(Math.floor(WIDTH * scale), Math.floor(height * scale));
  const ctx = surface.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the Card.');
  ctx.scale(scale, scale);

  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, WIDTH - 72, height - 72);
  ctx.strokeRect(46, 46, WIDTH - 92, height - 92);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  for (const op of ops) {
    if (op.type === 'text') {
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      // Letter-spacing is newer than Canvas itself; where it is missing the text is just un-tracked.
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${op.spacing}px`;
      ctx.fillText(op.text, WIDTH / 2, op.y);
    } else if (op.type === 'rule') {
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(WIDTH / 2 - 40, op.y, 80, 2);
    } else {
      ctx.strokeStyle = COLORS.stamp;
      ctx.lineWidth = 3;
      ctx.strokeRect(WIDTH / 2 - 300, op.y, 600, op.height);
      ctx.strokeRect(WIDTH / 2 - 292, op.y + 8, 584, op.height - 16);
    }
  }
  return surface;
}
