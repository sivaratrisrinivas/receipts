// #4: choose or upload a Conversation. On the Occasion step it shows which Conversation
// the Poem will be made from (the Gallery, or the Giver's own WhatsApp chat) and the way
// to change it; the steps that bring a chat are in src/ui/steps/ (upload, people,
// date-order, review).

import { reviewOf } from '../../app/upload';
import { h } from '../dom';
import { extensions } from '../extensions';

// Above the Occasion picker.
extensions.composeSections.push(({ app, state }) => {
  if (state.source === 'chat' && state.chat) {
    return h(
      'div',
      { class: 'source' },
      h('p', { class: 'source-label' }, 'Your WhatsApp chat'),
      h('p', { class: 'source-what' }, reviewOf(state.chat).headline),
      h('p', { class: 'aside' }, state.chat.fileName),
      h('button', { class: 'button secondary', type: 'button', onclick: () => app.chooseChat() }, 'Use a different chat'),
    );
  }
  return h(
    'div',
    { class: 'source' },
    h('p', { class: 'source-label' }, 'The Conversation'),
    h('p', { class: 'source-what' }, 'The Gallery: Robert Browning and Elizabeth Barrett’s letters'),
    h('button', { class: 'button secondary', type: 'button', onclick: () => app.chooseChat() }, 'Use my own WhatsApp chat instead'),
  );
});

// Just above "Make": a last reminder of what is about to be sent, and where.
extensions.composeNotices.push(({ state }) => {
  if (state.source !== 'chat' || !state.chat) return null;
  return h(
    'p',
    { class: 'aside privacy-reminder' },
    `This sends ${reviewOf(state.chat).headline}, straight from your browser to Beam through Hugging Face. It never touches Receipts’ server.`,
  );
});
