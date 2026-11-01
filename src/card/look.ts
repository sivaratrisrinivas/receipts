// The Card's look, shared by the HTML Card (as CSS) and the PNG (drawn on a canvas):
// warm paper, serif Lines, small-caps monospace Receipts, a stamped badge at the foot.

export const COLORS = {
  desk: '#e9dfca',
  paper: '#f6efe0',
  ink: '#2b2217',
  muted: '#7a6a52',
  rule: '#c9b99a',
  stamp: '#a8341f',
  highlight: '#ecdcaa',
} as const;

/** System stacks only: nothing to fetch, nothing to embed, nothing to wait for before drawing. */
export const SERIF = `Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif`;
export const MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace`;

export const BADGE_TITLE = 'Every line is real';
export const BADGE_NOTE = 'Word for word, with who said it and when.';
