// Step: bring a WhatsApp chat. A file picker (a .txt, or the .zip iOS makes), how to get
// the file out of WhatsApp, and a way back to the Gallery.

import type { AppState } from '../../app/state';
import { h } from '../dom';
import type { StepFactory } from '../step';

export const uploadStep: StepFactory = (app, state) => {
  const heading = h('h2', { tabindex: '-1' }, 'Bring your chat');
  const error = h('p', { class: 'notice', role: 'alert' });
  const status = h('p', { class: 'aside', role: 'status' });

  const input = h('input', {
    type: 'file',
    id: 'chat-file',
    accept: '.txt,.zip,text/plain,application/zip',
    onchange: () => {
      const file = input.files?.[0];
      if (!file) return;
      void app.uploadFile({ name: file.name, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) }).then(() => {
        // Choosing the same file again should read it again.
        input.value = '';
      });
    },
  });
  const pickLabel = h('span', { class: 'button primary' }, 'Choose your chat file');
  const pick = h('label', { class: 'file-pick', for: 'chat-file' }, input, pickLabel);

  const el = h(
    'section',
    { class: 'step step-upload' },
    heading,
    h(
      'p',
      { class: 'lede' },
      'Upload a chat exported from WhatsApp. The Poem is made only from things you and one other person really said, and the file never leaves your browser except to go to Beam.',
    ),
    error,
    pick,
    status,
    h(
      'details',
      { class: 'howto' },
      h('summary', null, 'How do I export a chat?'),
      h('p', null, h('strong', null, 'iPhone: '), 'open the chat, tap the name at the top, choose Export Chat, then Without Media. Save the file, then choose it here. The .zip is fine as it is.'),
      h('p', null, h('strong', null, 'Android: '), 'open the chat, tap the three dots, choose More, then Export chat, then Without media. Save the .txt file, then choose it here.'),
    ),
    h('button', { class: 'button quiet', type: 'button', onclick: () => app.back() }, 'Use the Gallery instead'),
  );

  const update = (next: AppState) => {
    const { busy, error: message } = next.upload;
    error.textContent = message ?? '';
    error.hidden = !message;
    status.textContent = busy ? 'Reading your chat…' : '';
    status.hidden = !busy;
    input.disabled = busy;
    pick.classList.toggle('is-busy', busy);
  };
  update(state);
  return { el, update };
};
