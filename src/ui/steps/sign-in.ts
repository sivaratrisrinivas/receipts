// Step: sign in with Hugging Face. No API key to paste; the browser calls Beam under the
// Giver's own account.

import type { AppState } from '../../app/state';
import { h } from '../dom';
import type { StepFactory } from '../step';

export const signInStep: StepFactory = (app, state) => {
  const heading = h('h2', { tabindex: '-1' }, 'Make a poem out of real messages');
  const notice = h('p', { class: 'notice', role: 'alert' });
  const button = h('button', { class: 'button primary', type: 'button' }, 'Sign in with Hugging Face');

  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Opening Hugging Face…';
    void app.signIn();
  });

  // Inside the Space's iframe, sign-in can lose its place in some browsers. Offer the direct page.
  const framed = window.top !== window.self;
  const ownTab = h('p', { class: 'aside' }, 'Sign-in not working here? ', h('a', { href: location.origin + location.pathname, target: '_blank', rel: 'noopener' }, 'Open Receipts in its own tab'), '.');

  const el = h(
    'section',
    { class: 'step step-sign-in' },
    heading,
    h(
      'p',
      { class: 'lede' },
      'Receipts turns what two people really said to each other into a poem. Every line is a real message, and under it goes who said it and when.',
    ),
    h('p', null, 'Sign in with your Hugging Face account to begin. Beam, the AI that reads the Conversation, runs under your account, so no key is needed.'),
    notice,
    button,
    framed && ownTab,
    h(
      'p',
      { class: 'aside' },
      'Private by design: a Conversation goes from your browser straight to Hugging Face and Beam. It never touches a server of ours.',
    ),
  );

  const update = (next: AppState) => {
    notice.textContent = next.notice ?? '';
    notice.hidden = !next.notice;
    button.disabled = false;
    button.textContent = 'Sign in with Hugging Face';
  };
  update(state);
  return { el, update };
};
