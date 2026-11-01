// #5: tells the Giver when Beam read only part of a long Conversation, under the Poem
// ("Beam read every 2nd day across the 9 years."). The matching message for a Conversation
// too small for a Poem is a failure (src/app/failure.ts), shown by the failed step.

import { readFractionMessage } from '../../app/read-fraction';
import { h } from '../dom';
import { extensions } from '../extensions';

extensions.poemActions.push(({ app }) => {
  const readFraction = app.getState().outcome?.readFraction;
  const message = readFraction && readFractionMessage(readFraction);
  return message ? h('p', { class: 'aside read-fraction' }, message) : null;
});
