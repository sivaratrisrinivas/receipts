// Gallery Poems (#8): before sign-in, a judge sees ready-made Poems, one per Occasion,
// each shown as the Card it would be if saved, with a clear call to sign in and make a
// live Poem. Plugs into the sign-in step through the `signInSections` slot.
//
// The Poems are rebuilt on load from stored picks, verified against the Gallery's own
// letters (src/gallery-poems/build.ts); nothing stored is shown as it is. A Poem that does
// not verify is left out, and if none can be shown the call to sign in still stands.
//
// Each Card is drawn by renderCardHtml, the very document "Download the Card" saves, inside
// a script-free iframe, so the Card's own styles cannot touch the app's and the app's
// cannot touch the Card's.

import type { App } from '../../app/app';
import { renderCardHtml } from '../../card';
import { formatDate } from '../../dates';
import type { Occasion, Poem } from '../../domain';
import { buildGalleryPoems, type GalleryPoems } from '../../gallery-poems/build';
import { SHIPPED_GALLERY_PICKS } from '../../gallery-poems/shipped';
import { h } from '../dom';
import { extensions } from '../extensions';
import { createGalleryLoader } from '../gallery-loader';
import './gallery-poems.css';

/** Shown first, when it has a Poem: the Gallery is love letters. */
const FIRST_SHOWN: Occasion = 'anniversary';

const loadSource = createGalleryLoader();
let loaded: Promise<GalleryPoems> | null = null;

/** Fetch the Gallery's letters and rebuild the Poems; once per page, retried after a failure. */
function loadGalleryPoems(): Promise<GalleryPoems> {
  loaded ??= loadSource()
    .then((source) => {
      if (source.kind !== 'gallery') throw new Error('The Gallery Poems need the Gallery.');
      return buildGalleryPoems(source.texts, SHIPPED_GALLERY_PICKS);
    })
    .catch((error: unknown) => {
      loaded = null;
      throw error;
    });
  return loaded;
}

extensions.signInSections.push(({ app }) => gallerySection(app));

const label = (occasion: Occasion) => occasion.charAt(0).toUpperCase() + occasion.slice(1);

function gallerySection(app: App): HTMLElement {
  const intro = h('span');
  const body = h('div', { class: 'gallery-body' });
  const el = h(
    'section',
    { class: 'gallery-poems', 'aria-labelledby': 'gallery-heading' },
    h('h3', { id: 'gallery-heading' }, 'Poems already made'),
    // The sign-in call sits here too, so it is in reach before the Cards are read.
    h('p', { class: 'gallery-lede' }, intro, ' Want your own? ', signInLink(app)),
    body,
    h(
      'div',
      { class: 'gallery-cta' },
      h('h3', null, 'Now make one of your own'),
      h(
        'p',
        null,
        'Beam reads every letter, live, and chooses the Lines for the Occasion you pick. It takes about a minute and costs roughly $0.20 of your Hugging Face credits.',
      ),
    ),
  );

  function describe(gallery: GalleryPoems | null): void {
    const messages = gallery?.conversation.messages;
    const letters = messages ? `all ${messages.length} letters` : 'every letter';
    const span = messages?.length ? `, ${monthOf(messages[0]!.date)} to ${monthOf(messages[messages.length - 1]!.date)}` : '';
    intro.textContent = `Beam read ${letters} Robert Browning and Elizabeth Barrett wrote each other${span}, and chose these Lines.`;
  }

  function load(): void {
    describe(null);
    body.replaceChildren(h('p', { class: 'aside', role: 'status' }, 'Loading the Gallery Poems…'));
    loadGalleryPoems().then(
      (gallery) => {
        describe(gallery);
        body.replaceChildren(...showcase(gallery));
      },
      () => {
        body.replaceChildren(
          h('p', { class: 'notice', role: 'status' }, 'The Gallery Poems could not be loaded just now. You can still sign in and make a live Poem.'),
          h('button', { class: 'button secondary', type: 'button', onclick: load }, 'Try again'),
        );
      },
    );
  }
  load();
  return el;
}

/** "January 1845", from an ISO date. */
function monthOf(date: string): string {
  return formatDate(date).replace(/^\d+ /, '');
}

/** The Occasion choices and the Card of the chosen one. Empty if there is no Poem to show. */
function showcase({ poems, conversation }: GalleryPoems): HTMLElement[] {
  if (poems.length === 0) return [];

  const frame = h('div', { class: 'gallery-card-wrap' });
  const show = (poem: Poem) => frame.replaceChildren(cardFrame(poem, conversation));

  const first = poems.find((poem) => poem.occasion === FIRST_SHOWN) ?? poems[0]!;
  const choices = h(
    'fieldset',
    { class: 'field occasions' },
    h('legend', { class: 'gallery-legend' }, 'Choose an Occasion'),
    ...poems.map((poem) =>
      h(
        'label',
        { class: 'chip' },
        h('input', { type: 'radio', name: 'gallery-occasion', value: poem.occasion, checked: poem === first, onchange: () => show(poem) }),
        h('span', null, label(poem.occasion)),
      ),
    ),
  );
  show(first);
  return [choices, frame];
}

/**
 * The Card as a document of its own, as tall as it needs to be (no scroll inside a scroll).
 * `allow-same-origin` lets the page measure it; with no `allow-scripts`, nothing in it runs.
 */
function cardFrame(poem: Poem, conversation: GalleryPoems['conversation']): HTMLIFrameElement {
  const frame = h('iframe', {
    class: 'gallery-card',
    title: `The ${poem.occasion} Card: a Poem for ${poem.recipient}`,
    sandbox: 'allow-same-origin',
    scrolling: 'no',
    srcdoc: renderCardHtml(poem, conversation),
  });

  const fit = () => {
    if (!frame.isConnected) {
      window.removeEventListener('resize', fit);
      return;
    }
    const height = frame.contentDocument?.documentElement.offsetHeight;
    if (height) frame.style.height = `${height + 2}px`;
  };
  frame.addEventListener('load', () => {
    fit();
    // Opening "Where it came from" under a Line makes the Card taller (toggle does not bubble).
    frame.contentDocument?.addEventListener('toggle', fit, true);
    window.addEventListener('resize', fit);
  });
  return frame;
}

/** A sign-in call in the text, which gives itself back once a sign-in that did not go through is reported. */
function signInLink(app: App): HTMLButtonElement {
  const text = 'Sign in to make a live Poem';
  const link = h('button', { class: 'link', type: 'button' }, text);
  link.addEventListener('click', () => {
    link.disabled = true;
    link.textContent = 'Opening Hugging Face…';
    void app.signIn();
  });
  const stop = app.subscribe(() => {
    if (!link.isConnected) return stop();
    link.disabled = false;
    link.textContent = text;
  });
  return link;
}
