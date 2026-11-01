// Card export (#7): under the Poem, the Giver can give it a title of their own and save
// it as a Card: a PNG to send on WhatsApp, a self-contained HTML file, or a printout.
// Plugs into the Poem view through the `poemActions` slot.
//
// Everything exported is built from `cardContent()`, which has no place for a Note, so
// Beam's private Notes cannot reach a Card however this panel changes.

import { CARD_TITLE_MAX, cardContent, renderCardHtml, type CardContent } from '../../card';
import { canSharePng, cardFilename, downloadBlob, printHtml, renderPng, sharePng } from '../../card/deliver';
import type { Conversation, Poem } from '../../domain';
import { h } from '../dom';
import { extensions } from '../extensions';
import './card-export.css';

/** The Giver's title, kept while the Poem view redraws (Replace, Remove) but not across Poems. */
let draft: { conversation: Conversation; title: string } | null = null;

extensions.poemActions.push(({ app, poem }) => {
  const conversation = app.getState().outcome?.conversation;
  return conversation ? exportPanel(poem, conversation) : null;
});

function exportPanel(poem: Poem, conversation: Conversation): HTMLElement {
  if (draft?.conversation !== conversation) draft = { conversation, title: '' };
  const state = draft;

  const card = (): CardContent => cardContent(poem, conversation, { title: state.title });

  // The PNG is made ahead, so that on a phone the share sheet can open straight from the tap.
  let ready: { title: string; png: Blob } | null = null;
  let timer: number | undefined;
  function prepare(): void {
    const title = state.title;
    void renderPng(card()).then(
      (png) => {
        if (title === state.title) ready = { title, png };
      },
      () => {},
    );
  }
  const currentPng = (): Blob | null => (ready && ready.title === state.title ? ready.png : null);

  const status = h('p', { class: 'card-export-status aside', role: 'status' });
  const say = (message: string) => void (status.textContent = message);

  const titleInput = h('input', {
    id: 'card-title',
    type: 'text',
    maxlength: String(CARD_TITLE_MAX),
    autocomplete: 'off',
    enterkeyhint: 'done',
    placeholder: 'e.g. Eleven years, in your own words',
    oninput: () => {
      state.title = titleInput.value;
      ready = null;
      window.clearTimeout(timer);
      timer = window.setTimeout(prepare, 300);
    },
  });
  titleInput.value = state.title;

  async function saveImage(share: boolean): Promise<void> {
    const filename = cardFilename(card(), 'png');
    try {
      // With the PNG already made, the share sheet opens in the same tick as the tap.
      const png = currentPng() ?? (await renderPng(card()));
      if (share) {
        try {
          if (await sharePng(png, filename)) say('Shared.');
          return;
        } catch {
          downloadBlob(png, filename);
          say('Sharing was not available here, so the image was saved to your downloads instead.');
          return;
        }
      }
      downloadBlob(png, filename);
      say('The image is in your downloads.');
    } catch {
      say('The image could not be made. Please try again.');
    }
  }

  function saveHtml(): void {
    const html = renderCardHtml(poem, conversation, { title: state.title });
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), cardFilename(card(), 'html'));
    say('The Card is in your downloads. Open it in any browser; it needs nothing else.');
  }

  function print(): void {
    printHtml(renderCardHtml(poem, conversation, { title: state.title }));
    say('');
  }

  const phone = window.matchMedia('(pointer: coarse)').matches && canSharePng();
  const button = (label: string, onclick: () => void, kind = 'secondary') =>
    h('button', { class: `button ${kind}`, type: 'button', onclick }, label);

  prepare();
  return h(
    'section',
    { class: 'card-export', 'aria-labelledby': 'card-export-heading' },
    h('h3', { id: 'card-export-heading' }, 'Make it a Card'),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'card-title' }, 'A title ', h('span', { class: 'optional' }, '(optional, in your own words)')),
      titleInput,
    ),
    h(
      'div',
      { class: 'card-export-buttons' },
      ...(phone
        ? [button('Share the image', () => void saveImage(true), 'primary'), button('Save the image', () => void saveImage(false))]
        : [button('Save as an image (PNG)', () => void saveImage(false), 'primary')]),
      button('Download the Card (HTML)', saveHtml),
      button('Print', print),
    ),
    status,
    h(
      'p',
      { class: 'aside' },
      'The Card holds the Lines, who said each and when, and the messages around each Line. Beam writes nothing on it, and its private notes stay here.',
    ),
  );
}
