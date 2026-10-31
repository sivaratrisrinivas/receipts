// Step: choose an Occasion and, if wanted, a note for Beam; then make the Poem.

import { OCCASIONS, type Occasion } from '../../domain';
import { h } from '../dom';
import { extensions } from '../extensions';
import type { StepFactory } from '../step';

const label = (occasion: Occasion) => occasion.charAt(0).toUpperCase() + occasion.slice(1);

export const composeStep: StepFactory = (app, state) => {
  const choices = h(
    'fieldset',
    { class: 'field occasions' },
    h('legend', null, 'What is the occasion?'),
    ...OCCASIONS.map((occasion) =>
      h(
        'label',
        { class: 'chip' },
        h('input', {
          type: 'radio',
          name: 'occasion',
          value: occasion,
          checked: state.compose.occasion === occasion,
          onchange: () => app.edit({ occasion }),
        }),
        h('span', null, label(occasion)),
      ),
    ),
  );

  const note = h('textarea', {
    id: 'note',
    rows: '3',
    maxlength: '280',
    placeholder: 'e.g. it is ten years since the first letter',
    oninput: () => app.edit({ note: note.value }),
  });
  note.value = state.compose.note;

  const make = h('button', { class: 'button primary', type: 'button', onclick: () => void app.start() }, 'Make my Gallery Poem');

  const sections = extensions.composeSections.map((slot) => slot({ app, state })).filter((node) => node !== null);
  const notices = extensions.composeNotices.map((slot) => slot({ app, state })).filter((node) => node !== null);

  const heading = h('h2', { tabindex: '-1' }, 'Make a Gallery Poem');
  const el = h(
    'section',
    { class: 'step step-compose' },
    heading,
    h(
      'p',
      { class: 'lede' },
      'The Gallery is the 1845–1846 letters between Robert Browning and Elizabeth Barrett. You are Robert; the Poem is for Elizabeth.',
    ),
    ...sections,
    choices,
    h('div', { class: 'field' }, h('label', { for: 'note' }, 'Anything Beam should know? ', h('span', { class: 'optional' }, '(optional)')), note),
    h(
      'p',
      { class: 'aside cost' },
      'Beam reads every letter in one go, which takes about a minute and costs roughly $0.20 of your Hugging Face credits.',
    ),
    ...notices,
    make,
  );

  return { el };
};
