// What a saved Card is called on the Giver's device.

import { describe, expect, test } from 'vitest';
import { cardFilename } from '../src/card/deliver';

describe('the name of a saved Card', () => {
  test('says who it is for, in a name that is safe on any system', () => {
    expect(cardFilename({ recipient: 'Elizabeth' }, 'png')).toBe('receipts-card-for-elizabeth.png');
    expect(cardFilename({ recipient: 'Elizabeth Barrett' }, 'html')).toBe('receipts-card-for-elizabeth-barrett.html');
    expect(cardFilename({ recipient: '../Zoë & Jo/' }, 'png')).toBe('receipts-card-for-zoë-jo.png');
  });

  test('a Recipient with nothing usable in their name just gets a plain name', () => {
    expect(cardFilename({ recipient: '???' }, 'png')).toBe('receipts-card.png');
  });
});
