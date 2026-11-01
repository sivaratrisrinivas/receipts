// Feature (#6): the Giver works with the Poem after the reveal.
//
//   lineDetails  Beam's private Note (its callbacks link to the Snippets they mention), and
//                the Line's original Message, shown by tapping the Line or "In context".
//   lineActions  Replace and Remove. There is no way to edit a Line's text or move a Line
//                (ADR-0002): a Line is only ever a Snippet, and a replacement keeps its place.
//                Remove is switched off, with its reason, once the Poem is down to 6 Lines.
//   poemActions  Regenerate the whole Poem.
//
// Everything here is for the Giver only. It carries the `giver-only` class so printing the
// page leaves it out, and nothing here is read by anything that exports a Card.

import type { App } from '../../app/app';
import { isReplacing, type AppState } from '../../app/state';
import { contextOf, noteParts, unlinkedCallbacks } from '../../context';
import { formatDateLabel } from '../../dates';
import type { Snippet } from '../../domain';
import { removalBlockedReason } from '../../editing';
import { h } from '../dom';
import { extensions, type LineSlotContext, type PoemSlotContext } from '../extensions';
import './notes-and-edit.css';

/** Keep `node` in step with the app's state until it leaves the page. */
function keepFresh(app: App, node: Node, render: (state: AppState) => void): void {
  render(app.getState());
  const stop = app.subscribe((state) => (node.isConnected ? render(state) : stop()));
}

/** A button that stays focusable and announced while it waits for Beam. */
function setBusy(button: HTMLButtonElement, busy: boolean): void {
  if (busy) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}

/** After a Line goes or changes, the old buttons are gone: land focus on its replacement's. */
function focusLine(index: number): void {
  const items = document.querySelectorAll<HTMLElement>('.poem .lines > li');
  items[Math.min(index, items.length - 1)]?.querySelector<HTMLElement>('.action')?.focus();
}

function snippetLabel(snippet: Snippet): string {
  return `${snippet.sender}, ${formatDateLabel(snippet.date, snippet.approximate)}`;
}

// ---- Under the Receipt: the Note, and the Line in its Message ---------------------------

function lineDetails({ app, line }: LineSlotContext): Node | null {
  const outcome = app.getState().outcome;
  if (!outcome) return null;

  const root = h('div', { class: 'giver-only giver-details' });

  if (line.note !== null) {
    const pointedAt = h('blockquote', { class: 'callback-snippet', hidden: true });
    const chips: { button: HTMLButtonElement; snippet: Snippet }[] = [];
    const { snippets } = outcome;
    let showing: string | null = null;

    function toggleSnippet(snippet: Snippet): void {
      showing = showing === snippet.id ? null : snippet.id;
      pointedAt.hidden = showing === null;
      pointedAt.replaceChildren(
        h('p', { class: 'callback-text' }, snippet.text),
        h(
          'p',
          { class: 'receipt' },
          h('span', { class: 'receipt-sender' }, snippet.sender),
          h('span', { class: 'receipt-sep', 'aria-hidden': 'true' }, '·'),
          formatDateLabel(snippet.date, snippet.approximate),
        ),
      );
      for (const chip of chips) chip.button.setAttribute('aria-expanded', String(chip.snippet.id === showing));
    }

    /** A link to the Snippet a callback points to, or null for an ID that is not in this Conversation. */
    function chipFor(id: string): HTMLButtonElement | null {
      const snippet = snippets.find((candidate) => candidate.id === id);
      if (!snippet) return null;
      const button = h('button', { class: 'callback', type: 'button', 'aria-expanded': 'false' }, snippetLabel(snippet));
      button.addEventListener('click', () => toggleSnippet(snippet));
      chips.push({ button, snippet });
      return button;
    }

    const note = h(
      'p',
      { class: 'note-text' },
      ...noteParts(line.note, line.callbacks).map((part) => ('text' in part ? part.text : (chipFor(part.callback) ?? part.callback))),
    );
    root.append(h('p', { class: 'giver-label' }, 'Note from Beam · only you see this'), note);

    // Beam names the callbacks it means in `line.callbacks`, but rarely writes the IDs in the Note.
    const elsewhere = unlinkedCallbacks(line.note, line.callbacks).flatMap((id) => chipFor(id) ?? []);
    if (elsewhere.length > 0) {
      root.append(h('p', { class: 'callback-links' }, h('span', { class: 'giver-label' }, 'Points back to'), ...elsewhere));
    }
    root.append(pointedAt);
  }

  const context = contextOf(outcome.conversation, line);
  if (context) {
    const panelId = `context-${line.snippetId}`;
    const panel = h(
      'div',
      { class: 'line-context', id: panelId, hidden: true },
      h('p', { class: 'giver-label' }, `The whole Message · ${context.sender}, ${context.dateLabel}`),
      h('p', { class: 'context-text' }, context.before, context.snippet === '' ? null : h('mark', null, context.snippet), context.after),
    );
    const toggle = h('button', { class: 'link context-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId }, 'In context');
    const flip = () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    };
    toggle.addEventListener('click', flip);
    root.append(toggle, panel);

    // Tapping the Line itself does the same. The Line's element belongs to the Poem view and is
    // attached just after this slot returns, so look it up once the view has finished building.
    queueMicrotask(() => {
      const text = root.closest('li')?.querySelector<HTMLElement>('.line-text');
      text?.classList.add('is-tappable');
      text?.addEventListener('click', () => {
        if (!window.getSelection()?.toString()) flip(); // a tap, not the end of selecting words
      });
    });
  }

  return root.childElementCount > 0 ? root : null;
}

// ---- Under each Line: Replace and Remove ------------------------------------------------

function lineActions({ app, poem, line, index }: LineSlotContext): Node | null {
  // A Poem is at least 6 Lines: at 6, Remove is switched off (still focusable, so the reason is
  // announced and a tap explains it), and Replace carries on, since it keeps the count.
  const blocked = removalBlockedReason(poem);
  const replace = h('button', { class: 'action giver-only', type: 'button' }, 'Replace');
  const remove = h('button', { class: `action giver-only danger${blocked === null ? '' : ' is-blocked'}`, type: 'button', title: blocked }, 'Remove');
  const sure = h('button', { class: 'action giver-only danger solid', type: 'button' }, 'Yes, remove');
  const keep = h('button', { class: 'action giver-only', type: 'button' }, 'Keep it');
  const confirm = h('span', { class: 'confirm giver-only', role: 'group', 'aria-label': 'Remove this Line?', hidden: true }, h('span', null, 'Remove this Line?'), sure, keep);
  const status = h('p', { class: 'edit-status giver-only', role: 'status', hidden: true });

  let waiting = false;
  replace.addEventListener('click', async () => {
    if (waiting) return;
    await app.replaceLine(line.snippetId);
    // A replaced Line is rebuilt along with the rest; a failed one stays, with its reason.
    if (replace.isConnected === false) focusLine(index);
  });
  remove.addEventListener('click', () => {
    if (waiting) return;
    if (blocked !== null) {
      status.classList.remove('is-problem');
      status.textContent = blocked;
      status.hidden = false;
      return;
    }
    remove.hidden = true;
    confirm.hidden = false;
    sure.focus();
  });
  keep.addEventListener('click', () => {
    confirm.hidden = true;
    remove.hidden = false;
    remove.focus();
  });
  sure.addEventListener('click', () => {
    if (waiting) return;
    app.removeLine(line.snippetId);
    focusLine(index);
  });

  keepFresh(app, replace, (state) => {
    const mine = state.editing.replacement?.snippetId === line.snippetId ? state.editing.replacement : null;
    waiting = isReplacing(state.editing);
    for (const button of [replace, sure, keep]) setBusy(button, waiting);
    setBusy(remove, waiting || blocked !== null);
    replace.textContent = waiting && mine ? 'Finding another…' : 'Replace';

    status.hidden = mine === null;
    status.classList.toggle('is-problem', mine?.problem != null);
    if (mine === null) return;
    const { problem } = mine;
    status.replaceChildren(
      problem ? problem.message : 'Beam is choosing another Snippet from that time. This can take up to a minute when that stretch of the Conversation is long.',
      ...(problem?.help ? [h('a', { href: problem.help.href, target: '_blank', rel: 'noopener' }, problem.help.label)] : []),
    );
  });

  const row = document.createDocumentFragment();
  row.append(replace, remove, confirm, status);
  return row;
}

// ---- Under the Poem: Regenerate ----------------------------------------------------------

function poemActions({ app }: PoemSlotContext): Node | null {
  const ask = h('button', { class: 'button secondary giver-only', type: 'button' }, 'Regenerate the Poem');
  const yes = h('button', { class: 'button primary', type: 'button' }, 'Regenerate');
  const no = h('button', { class: 'button quiet', type: 'button' }, 'Keep this Poem');
  const confirm = h(
    'div',
    { class: 'confirm-box', role: 'group', 'aria-label': 'Regenerate the Poem?', hidden: true },
    h('p', null, 'Beam will read the whole Conversation again, which usually takes under a minute and uses credits again. This Poem and any changes you made to it will be discarded.'),
    yes,
    no,
  );
  const root = h('div', { class: 'giver-only regenerate' }, ask, confirm);

  ask.addEventListener('click', () => {
    if (ask.getAttribute('aria-disabled')) return;
    ask.hidden = true;
    confirm.hidden = false;
    yes.focus();
  });
  no.addEventListener('click', () => {
    confirm.hidden = true;
    ask.hidden = false;
    ask.focus();
  });
  yes.addEventListener('click', () => void app.regenerate());

  keepFresh(app, ask, (state) => {
    for (const button of [ask, yes]) setBusy(button, isReplacing(state.editing));
  });
  return root;
}

extensions.lineDetails.push(lineDetails);
extensions.lineActions.push(lineActions);
extensions.poemActions.push(poemActions);
