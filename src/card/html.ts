// The HTML Card: a pure function from a Poem (and the Conversation it came from) to one
// self-contained HTML document. Inline CSS, no script, no network (a Content-Security-Policy
// in the document says so), and every piece of text is escaped. Lines expand to their
// context with native <details>, so it works with nothing running at all.

import type { Conversation, Poem } from '../domain';
import { cardContent, type CardContent, type CardLine, type CardOptions, type ContextMessage } from './content';
import { BADGE_NOTE, BADGE_TITLE } from './look';
import { CARD_CSS } from './styles';

export function renderCardHtml(poem: Poem, conversation: Conversation, options: CardOptions = {}): string {
  const card = cardContent(poem, conversation, options);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(card.title ?? `A poem for ${card.recipient}`)}</title>
<style>${CARD_CSS}</style>
</head>
<body>
${cardHtml(card)}
</body>
</html>
`;
}

function cardHtml(card: CardContent): string {
  return `<main class="card">
<header class="card-head">
<p class="for">For ${escapeHtml(card.recipient)}</p>
${card.title === null ? '' : `<h1 class="title">${escapeHtml(card.title)}</h1>`}
</header>
<ol class="lines">
${card.lines.map(lineHtml).join('\n')}
</ol>
<footer class="card-foot">
${card.verified ? `<div class="badge"><strong>${BADGE_TITLE}</strong><span>${BADGE_NOTE}</span></div>` : ''}
<p class="framing">${escapeHtml(card.framing)}</p>
<p class="hint">Open a line to see the messages around it</p>
</footer>
</main>`;
}

function lineHtml(line: CardLine): string {
  return `<li class="line" data-snippet="${escapeHtml(line.snippetId)}">
<p class="line-text">${escapeHtml(line.text)}</p>
<p class="receipt"><span class="who">${escapeHtml(line.sender)}</span> · <time datetime="${escapeHtml(line.date)}">${escapeHtml(line.dateLabel)}</time></p>
${line.context.length === 0 ? '' : `<details class="context"><summary>Where it came from</summary><ol class="thread">${line.context.map(messageHtml).join('')}</ol></details>`}
</li>`;
}

function messageHtml(message: ContextMessage): string {
  return `<li class="msg${message.isSource ? ' is-source' : ''}"><p class="msg-meta"><span class="msg-who">${escapeHtml(message.sender)}</span> · <time class="msg-when" datetime="${escapeHtml(message.date)}">${escapeHtml(message.dateLabel)}</time></p><p class="msg-text">${markedHtml(message)}</p></li>`;
}

/** The Message's text, with the Line picked out in it when this is the Line's own Message. */
function markedHtml({ text, mark }: ContextMessage): string {
  if (!mark) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, mark.start))}<mark>${escapeHtml(text.slice(mark.start, mark.end))}</mark>${escapeHtml(text.slice(mark.end))}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
