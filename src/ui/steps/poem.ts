// Step: the Poem, revealed Line by Line with its Receipts, then the badge if it verifies.

import { NO_MOTION, REVEAL_TIMING, linesRevealed, msUntilNextLine } from '../../app/reveal';
import { h } from '../dom';
import { createPoemView } from '../components/poem-view';
import type { StepFactory } from '../step';

export const poemStep: StepFactory = (app, state) => {
  const outcome = state.outcome;
  if (!outcome) throw new Error('The Poem step needs a Poem.');
  let poem = outcome.poem;

  const view = createPoemView({ app, poem });
  const skip = h('button', { class: 'button quiet', type: 'button' }, 'Show the whole Poem');
  const again = h('button', { class: 'button secondary', type: 'button', onclick: () => app.again() }, 'Make another Poem');
  const el = h('section', { class: 'step step-poem' }, view.el, skip, again);

  // Reveal on a timer, derived from the time since the reveal began (see src/app/reveal.ts).
  const timing = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? NO_MOTION : REVEAL_TIMING;
  const began = Date.now();
  let timer: number | undefined;

  function tick(elapsed: number): void {
    const total = poem.lines.length;
    view.reveal(linesRevealed(total, elapsed, timing));
    const wait = msUntilNextLine(total, elapsed, timing);
    skip.hidden = wait === null;
    if (wait !== null) timer = window.setTimeout(() => tick(Date.now() - began), wait);
  }
  skip.addEventListener('click', () => {
    window.clearTimeout(timer);
    tick(Infinity);
  });
  tick(0);
  view.heading.focus({ preventScroll: true });

  return {
    el,
    update(next) {
      // Other features (replacing or removing a Line) hand the view a new Poem.
      if (next.outcome && next.outcome.poem !== poem) {
        poem = next.outcome.poem;
        view.setPoem(poem);
      }
    },
    dispose() {
      window.clearTimeout(timer);
    },
  };
};
