// Step: something went wrong. A plain message, the one button that fixes it (try again,
// or sign in again), and a way back to the choices.

import { h } from '../dom';
import type { StepFactory } from '../step';

export const failedStep: StepFactory = (app, state) => {
  const failure = state.failure;
  if (!failure) throw new Error('The failure step needs a failure.');

  const el = h(
    'section',
    { class: 'step step-failed', 'data-kind': failure.kind },
    h('h2', { tabindex: '-1' }, failure.title),
    h('p', { class: 'lede', role: 'alert' }, failure.message),
    failure.help && h('p', null, h('a', { href: failure.help.href, target: '_blank', rel: 'noopener' }, failure.help.label)),
    h('button', { class: 'button primary', type: 'button', onclick: () => void app.recover() }, failure.recovery.label),
    // After a sign-in problem there are no choices to go back to, and when going back is the main button it needs no twin.
    failure.recovery.action === 'retry' && h('button', { class: 'button secondary', type: 'button', onclick: () => app.again() }, 'Change my choices'),
  );
  return { el };
};
