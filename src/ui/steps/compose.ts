// Step: choose an Occasion and, if wanted, a note for Beam; then make the Poem.

import { composeCopy } from '../../app/upload';
import { OCCASIONS, type Occasion } from '../../domain';
import { h } from '../dom';
import { extensions } from '../extensions';
import type { StepFactory } from '../step';

const label = (occasion: Occasion) => occasion.charAt(0).toUpperCase() + occasion.slice(1);

export const composeStep: StepFactory = (app, state) => {
  const copy = composeCopy(state);
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

  const make = h('button', { class: 'button primary', type: 'button', onclick: () => void app.start() }, copy.make);

  const sections = extensions.composeSections.map((slot) => slot({ app, state })).filter((node) => node !== null);
  const notices = extensions.composeNotices.map((slot) => slot({ app, state })).filter((node) => node !== null);

  const heading = h('h2', { tabindex: '-1' }, copy.heading);
  const el = h(
    'section',
    { class: 'step step-compose' },
    heading,
    h('p', { class: 'lede' }, copy.lede),
    ...sections,
    choices,
    h('div', { class: 'field' }, h('label', { for: 'note' }, 'Anything Beam should know? ', h('span', { class: 'optional' }, '(optional)')), note),
    h('p', { class: 'aside cost' }, copy.cost),
    ...notices,
    make,
  );

  return { el };
};
