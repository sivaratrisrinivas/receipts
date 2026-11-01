// Redaction at its own edge: text goes in, text comes out with phone numbers and email
// addresses replaced by markers. Errs towards removal, but never eats dates, years, times
// or plain figures.

import { describe, expect, test } from 'vitest';
import { EMAIL_MARKER, PHONE_MARKER, redactText } from '../src/redaction';

describe('phone numbers are replaced whole, however they are written', () => {
  test.each([
    ['+91 98765 43210', 'an international number'],
    ['+44 7700 900123', 'an international number'],
    ['+1 (555) 123-4567', 'an international number with a bracketed area code'],
    ['(555) 123-4567', 'a bracketed area code'],
    ['(555)123-4567', 'a bracketed area code with no space after it'],
    ['(020)7946 0958', 'a bracketed area code with no space after it'],
    ['555-123-4567', 'three hyphenated groups'],
    ['020 7946 0958', 'three groups'],
    ['07700 900123', 'two groups'],
    ['555-1234', 'a seven-digit local number'],
    ['9876543210', 'ten digits in a row'],
    ['8123 4567', 'eight digits in two groups of four'],
    ['8123-4567', 'eight digits, hyphenated'],
    ['123 4567', 'seven digits in two groups'],
    ['1234 567', 'seven digits in two groups, the other way'],
  ])('%s (%s)', (number) => {
    expect(redactText(`Ring me on ${number} when you land.`)).toBe(`Ring me on ${PHONE_MARKER} when you land.`);
  });
});

describe('things that are not phone numbers are left alone', () => {
  test.each([
    '2024-03-05',
    '05/03/2024',
    '05.03.2024',
    '1999-2024',
    '1850-1851',
    '2023 2024',
    '10:30',
    '10:30:45',
    '9.41 p.m.',
    '4812',
    '1,200,000',
    '3.14159',
    '1234.5678',
    'v2.10.3.4567',
    'IMG-20240313-WA0004.jpg',
    '12 March 2024',
  ])('%s', (text) => {
    const sentence = `We said ${text} and meant it.`;

    expect(redactText(sentence)).toBe(sentence);
  });
});

describe('email addresses', () => {
  test('are replaced whole', () => {
    expect(redactText('Write to first.last+news@mail.example.com or anne@example.org today.')).toBe(
      `Write to ${EMAIL_MARKER} or ${EMAIL_MARKER} today.`,
    );
  });

  test('text with no @ is returned as it came', () => {
    const text = 'Nothing to hide here, only 4812 and a kettle.';

    expect(redactText(text)).toBe(text);
  });
});
