// The HTML Card's stylesheet, inlined into the document. Phone first; one column. The
// print rules come last: a clean single Card, with the buttons and the context left off.

import { COLORS, MONO, SERIF } from './look';

export const CARD_CSS = `
:root {
  color-scheme: light;
  --desk: ${COLORS.desk};
  --paper: ${COLORS.paper};
  --ink: ${COLORS.ink};
  --muted: ${COLORS.muted};
  --rule: ${COLORS.rule};
  --stamp: ${COLORS.stamp};
  --highlight: ${COLORS.highlight};
  --serif: ${SERIF};
  --mono: ${MONO};
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  padding: 16px;
  background: var(--desk);
  color: var(--ink);
  font-family: var(--serif);
  font-size: 1.0625rem;
  line-height: 1.5;
}
p, h1, ol { margin: 0; padding: 0; }
ol { list-style: none; }

.card {
  position: relative;
  max-width: 34rem;
  margin: 0 auto;
  padding: 2.75rem 1.5rem 2.25rem;
  background: var(--paper);
  border: 1px solid var(--rule);
  box-shadow: 0 10px 28px -16px rgb(60 40 10 / 0.5);
  text-align: center;
}
.card::before {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid var(--rule);
  pointer-events: none;
}

.for, .receipt, .msg-meta, summary, .badge strong, .hint {
  font-family: var(--mono);
  font-variant-caps: all-small-caps;
  letter-spacing: 0.1em;
}
.for { font-size: 0.95rem; color: var(--muted); }
.title { margin-top: 0.6rem; font-size: 1.6rem; font-weight: 400; line-height: 1.25; overflow-wrap: anywhere; }

.lines { margin-top: 1.75rem; }
.line { padding: 1.5rem 0 1.25rem; }
.line + .line { border-top: 1px dashed var(--rule); }
.line-text { font-size: 1.375rem; font-style: italic; line-height: 1.45; overflow-wrap: anywhere; white-space: pre-line; }
.receipt { margin-top: 0.6rem; font-size: 0.9rem; color: var(--muted); }

.context { margin-top: 0.35rem; }
summary {
  display: inline-block;
  min-height: 2.75rem;
  padding: 0.7rem 0.9rem;
  font-size: 0.85rem;
  color: var(--muted);
  cursor: pointer;
  list-style: none;
  -webkit-tap-highlight-color: transparent;
}
summary::-webkit-details-marker { display: none; }
summary::before { content: '+ '; }
details[open] > summary::before { content: '\u2212 '; }
summary:focus-visible { outline: 2px solid var(--stamp); outline-offset: 2px; }

.thread { margin-top: 0.25rem; text-align: left; }
.msg {
  margin-top: 0.5rem;
  padding: 0.4rem 0 0.4rem 0.8rem;
  border-left: 2px solid var(--rule);
  font-size: 0.95rem;
  color: var(--muted);
}
.msg.is-source { border-left-color: var(--stamp); color: var(--ink); }
.msg-meta { font-size: 0.8rem; color: var(--muted); }
.msg-text { margin-top: 0.1rem; overflow-wrap: anywhere; white-space: pre-line; }
mark { padding: 0 0.1em; border-radius: 2px; background: var(--highlight); color: inherit; }

.card-foot { margin-top: 1rem; padding-top: 1.5rem; border-top: 1px dashed var(--rule); }
.badge {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.65rem 1rem;
  border: 3px double var(--stamp);
  border-radius: 6px;
  color: var(--stamp);
  transform: rotate(-1.5deg);
}
.badge strong { font-size: 0.95rem; font-weight: 700; letter-spacing: 0.16em; }
.badge span { font-size: 0.8rem; }
.framing { margin-top: 1.1rem; font-size: 0.95rem; font-style: italic; color: var(--muted); }
.hint { margin-top: 0.75rem; font-size: 0.75rem; color: var(--muted); }

@media print {
  @page { margin: 12mm; }
  html, body { background: #fff; }
  body { padding: 0; font-size: 10.5pt; }
  .card { max-width: 38rem; padding: 1.5rem 1rem 1rem; background: #fff; box-shadow: none; }
  .card::before { inset: 4px; }
  .lines { margin-top: 1rem; }
  .line { padding: 0.8rem 0 0.7rem; break-inside: avoid; }
  .line-text { font-size: 1.2rem; }
  .context, .hint { display: none; }
  .card-foot { margin-top: 0.5rem; padding-top: 1rem; break-inside: avoid; }
}
`;
