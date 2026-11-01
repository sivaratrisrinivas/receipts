// Step: the export's dates can be read two ways (3 June or 6 March), so the Giver is shown
// one of their own Messages and says which. Only reached when the export cannot settle it.

import { formatDate } from '../../dates';
import { h } from '../dom';
import type { StepFactory } from '../step';

const SHOWN_CHARS = 220;

export const dateOrderStep: StepFactory = (app, state) => {
  const question = state.chat?.question;
  if (!question) throw new Error('The date step needs a question.');
  const text = question.text.length > SHOWN_CHARS ? `${question.text.slice(0, SHOWN_CHARS).trimEnd()}…` : question.text;

  const answer = (label: string, order: 'day-first' | 'month-first') =>
    h('button', { class: 'button primary', type: 'button', onclick: () => app.chooseDateOrder(order) }, label);

  const el = h(
    'section',
    { class: 'step step-date-order' },
    h('h2', { tabindex: '-1' }, 'One thing to check'),
    h('p', { class: 'lede' }, 'Your chat writes dates in a way that can be read two ways. Here is one Message from it:'),
    h('blockquote', { class: 'sample' }, h('p', { class: 'sample-text' }, text), h('footer', null, question.sender)),
    h('p', { class: 'lede' }, 'When was it sent?'),
    answer(formatDate(question.dayFirst), 'day-first'),
    answer(formatDate(question.monthFirst), 'month-first'),
    h('p', { class: 'aside' }, 'The dates under each Line of the Poem follow your answer.'),
    h('button', { class: 'button quiet', type: 'button', onclick: () => app.back() }, 'Back'),
  );
  return { el };
};
