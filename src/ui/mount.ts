// Mounts the app: builds the page chrome, creates the app flow, and shows the screen for
// the current step. Screens come from the step registry (./steps); this file only wires.

import { createApp, type AppDeps } from '../app/app';
import type { App } from '../app/app';
import type { AppState, StepId } from '../app/state';
import { createAuth } from '../auth';
import { createHfBeam } from '../beam/hf';
import { h } from './dom';
import './features';
import { createGalleryLoader } from './gallery-loader';
import type { StepView } from './step';
import { steps } from './steps';

export async function mountApp(root: HTMLElement): Promise<void> {
  const makeBeam = await chooseBeam();
  const app = createApp({ auth: await createAuth(), loadSource: createGalleryLoader(), makeBeam, now: Date.now });

  const account = h('div', { class: 'account' });
  const stage = h('main', { class: 'stage' });
  root.replaceChildren(
    h(
      'div',
      { class: 'shell' },
      h('header', { class: 'masthead' }, h('h1', { class: 'brand' }, 'Receipts'), account),
      stage,
      h(
        'footer',
        { class: 'colophon' },
        'The Gallery is the letters of Robert Browning and Elizabeth Barrett, from Project Gutenberg (ebooks ',
        h('a', { href: 'https://www.gutenberg.org/ebooks/16182', target: '_blank', rel: 'noopener' }, '16182'),
        ' and ',
        h('a', { href: 'https://www.gutenberg.org/ebooks/73891', target: '_blank', rel: 'noopener' }, '73891'),
        '), in the public domain.',
      ),
    ),
  );

  let shown: { id: StepId; view: StepView } | null = null;
  function show(state: AppState): void {
    renderAccount(account, app, state);
    if (shown?.id === state.step) {
      shown.view.update?.(state);
      return;
    }
    shown?.view.dispose?.();
    const view = steps[state.step](app, state);
    shown = { id: state.step, view };
    stage.replaceChildren(view.el);
    window.scrollTo({ top: 0 });
    // Move focus to the new screen's heading, so keyboard and screen-reader users land on it.
    (view.el.querySelector('h2[tabindex]') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  await app.init();
  show(app.getState());
  app.subscribe(show);
}

function renderAccount(account: HTMLElement, app: App, state: AppState): void {
  if (!state.session || state.step === 'sign-in') {
    account.replaceChildren();
    return;
  }
  account.replaceChildren(
    h('span', { class: 'who' }, state.session.username),
    h('button', { class: 'link', type: 'button', onclick: () => app.signOut() }, 'Sign out'),
  );
}

/**
 * The real Beam adapter, under the Giver's own token. In `vite dev`, `?beam=fake` (and
 * friends, see src/dev/beam.ts) swaps in a scripted Beam so the screens can be worked on
 * without spending credits; that module is not part of the production build.
 */
async function chooseBeam(): Promise<AppDeps['makeBeam']> {
  if (import.meta.env.DEV) {
    const { scriptedBeamFromUrl } = await import('../dev/beam');
    const scripted = scriptedBeamFromUrl(new URL(location.href));
    if (scripted) return () => scripted;
  }
  return (session) => createHfBeam({ token: session.accessToken });
}
