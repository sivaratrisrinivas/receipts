// The Poem view: a Poem's Lines, each with its Receipt, and the "every line is real" badge
// once the Poem is fully revealed and fully verified. It knows nothing about steps or
// timing; the Poem step tells it how many Lines to show.
//
// Slots let other features add to each Line (action buttons, details such as a Note) and to
// the Poem (e.g. a Card export) without editing this file. They default to the global
// registry in src/ui/extensions.ts; pass your own to reuse the view elsewhere.

import type { App } from '../../app/app';
import { badgeShown } from '../../app/reveal';
import type { Poem } from '../../domain';
import { h } from '../dom';
import { extensions, type Extensions } from '../extensions';

export interface PoemViewOptions {
  app: App;
  poem: Poem;
  slots?: Pick<Extensions, 'lineActions' | 'lineDetails' | 'poemActions'>;
}

export interface PoemView {
  el: HTMLElement;
  /** The heading, so the Poem step can move focus to it. */
  heading: HTMLElement;
  /** Replace the Poem (e.g. after a Line is replaced or removed), keeping how much is revealed. */
  setPoem(poem: Poem): void;
  /** Show the first `count` Lines, and the badge if the Poem verifies and every Line is showing. */
  reveal(count: number): void;
}

export function createPoemView(options: PoemViewOptions): PoemView {
  const { app } = options;
  const slots = options.slots ?? extensions;
  let poem = options.poem;
  let revealed = 0;

  const heading = h('h2', { tabindex: '-1' });
  const eyebrow = h('p', { class: 'eyebrow' });
  const byline = h('p', { class: 'byline' });
  const list = h('ol', { class: 'lines', 'aria-live': 'polite' });
  const seal = h('div', { class: 'seal' });
  const actions = h('div', { class: 'poem-actions' });
  const el = h('article', { class: 'poem' }, h('header', { class: 'poem-head' }, eyebrow, heading, byline), list, seal, actions);

  function render(): void {
    eyebrow.textContent = poem.occasion;
    heading.textContent = `For ${poem.recipient}`;
    byline.textContent = `from ${poem.giver}`;

    list.replaceChildren(
      ...poem.lines.map((line, index) => {
        const context = { app, poem, line, index };
        const details = slots.lineDetails.map((slot) => slot(context)).filter((node) => node !== null);
        const buttons = slots.lineActions.map((slot) => slot(context)).filter((node) => node !== null);
        return h(
          'li',
          { class: 'line', 'data-snippet': line.snippetId },
          h('p', { class: 'line-text' }, line.text),
          h(
            'p',
            { class: 'receipt' },
            h('span', { class: 'receipt-sender' }, line.receipt.sender),
            h('span', { class: 'receipt-sep', 'aria-hidden': 'true' }, '·'),
            h('time', { datetime: line.receipt.date }, line.receipt.dateLabel),
          ),
          details.length > 0 && h('div', { class: 'line-details' }, ...details),
          buttons.length > 0 && h('div', { class: 'line-actions' }, ...buttons),
        );
      }),
    );
    actions.replaceChildren(...slots.poemActions.map((slot) => slot({ app, poem })).filter((node) => node !== null));
    show(revealed);
  }

  function show(count: number): void {
    const total = poem.lines.length;
    const previous = revealed;
    revealed = Math.min(count, total);

    [...list.children].forEach((item, index) => {
      const visible = index < revealed;
      (item as HTMLElement).hidden = !visible;
      // Lines that appear now print in; Lines already showing (or re-rendered) just stay.
      item.classList.toggle('is-new', visible && index >= previous);
    });
    if (revealed > previous && previous > 0) list.children[revealed - 1]?.scrollIntoView({ block: 'nearest' });

    const complete = revealed >= total && total > 0;
    seal.replaceChildren(
      ...(badgeShown(poem, revealed, total)
        ? [
            h(
              'div',
              { class: 'badge', role: 'status' },
              h('strong', null, 'Every line is real'),
              h('span', null, 'Word for word from the Conversation, each with who said it and when.'),
            ),
          ]
        : complete
          ? [
              h(
                'p',
                { class: 'unverified', role: 'status' },
                'Beam named something that is not in the Conversation. It has been left out, and since not every pick checked out there is no "every line is real" badge.',
              ),
            ]
          : []),
    );
    actions.hidden = !complete;
  }

  render();
  return {
    el,
    heading,
    setPoem(next) {
      poem = next;
      render();
    },
    reveal: show,
  };
}
