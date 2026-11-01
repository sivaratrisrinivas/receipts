// Step: before anything is sent, how many Messages will go to Beam, and where they go.

import { reviewOf } from '../../app/upload';
import { h } from '../dom';
import type { StepFactory } from '../step';

export const reviewStep: StepFactory = (app, state) => {
  if (!state.chat) throw new Error('The review step needs a chat.');
  const review = reviewOf(state.chat);

  const el = h(
    'section',
    { class: 'step step-review' },
    h('h2', { tabindex: '-1' }, 'Ready when you are'),
    h('p', { class: 'count' }, review.headline),
    h(
      'div',
      { class: 'privacy' },
      h('h3', null, 'Where your chat goes'),
      h('p', null, review.privacy),
      h('p', null, 'Phone numbers and email addresses are removed before anything is sent.'),
      review.others && h('p', null, 'Messages from anyone else in the chat are left out entirely.'),
    ),
    h('button', { class: 'button primary', type: 'button', onclick: () => app.confirmChat() }, 'Continue'),
    h('button', { class: 'button quiet', type: 'button', onclick: () => app.back() }, 'Back'),
  );
  return { el };
};
