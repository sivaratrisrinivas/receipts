// Step: which one is you, and who is the Poem for. In a group chat only these two people's
// Messages are ever used.

import type { AppState } from '../../app/state';
import type { SenderCount } from '../../sources/whatsapp';
import { h } from '../dom';
import type { StepFactory } from '../step';

export const peopleStep: StepFactory = (app, state) => {
  const chat = state.chat;
  if (!chat) throw new Error('The people step needs a chat.');
  const group = chat.senders.length > 2;

  const person = (role: 'giver' | 'recipient', sender: SenderCount) => {
    const input = h('input', {
      type: 'radio',
      name: role,
      value: sender.name,
      onchange: () => app.choosePerson(role, sender.name),
    });
    const noun = sender.messages === 1 ? 'Message' : 'Messages';
    const label = h(
      'label',
      { class: 'chip person' },
      input,
      h('span', null, h('strong', { class: 'person-name' }, sender.name), h('small', null, `${sender.messages.toLocaleString('en-US')} ${noun}`)),
    );
    return { input, label };
  };

  const giverChoices = chat.senders.map((sender) => person('giver', sender));
  const recipientChoices = chat.senders.map((sender) => person('recipient', sender));

  const fieldset = (legend: string, choices: { label: HTMLElement }[]) =>
    h('fieldset', { class: 'field people' }, h('legend', null, legend), ...choices.map((choice) => choice.label));

  const next = h('button', { class: 'button primary', type: 'button', onclick: () => app.confirmPeople() }, 'Continue');

  const el = h(
    'section',
    { class: 'step step-people' },
    h('h2', { tabindex: '-1' }, 'Who is who?'),
    h(
      'p',
      { class: 'lede' },
      group
        ? 'This looks like a group chat. Pick yourself and the one person the Poem is for. Nobody else’s Messages are used or sent.'
        : 'Tell us which one is you, and who the Poem is for.',
    ),
    fieldset('Which one is you?', giverChoices),
    fieldset('Who is it for?', recipientChoices),
    next,
    h('button', { class: 'button quiet', type: 'button', onclick: () => app.back() }, 'Choose a different file'),
  );

  const update = (current: AppState) => {
    const picked = current.chat;
    if (!picked) return;
    chat.senders.forEach((sender, i) => {
      giverChoices[i]!.input.checked = picked.giver === sender.name;
      const recipient = recipientChoices[i]!.input;
      recipient.checked = picked.recipient === sender.name;
      // You cannot make a Poem for yourself.
      recipient.disabled = picked.giver === sender.name;
      recipientChoices[i]!.label.classList.toggle('is-disabled', recipient.disabled);
    });
    next.disabled = !(picked.giver && picked.recipient);
  };
  update(state);
  return { el, update };
};
