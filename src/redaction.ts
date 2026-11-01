// Redaction: phone numbers and email addresses are removed from a Conversation before any
// Snippet is formed, so they can never reach a prompt, a Line or a Card. Each one is
// replaced by a bracketed marker, which keeps the sentence readable and shows plainly that
// something was taken out.
//
// Phone numbers are recognised by shape, and erring towards removal is the right way to be
// wrong. What it does not take for numbers: dates (2024-03-05, 05/03/2024), year spans
// (1999-2024), times (10:30), and plain figures (4812, 1,200,000).

import type { Conversation } from './domain';

export const PHONE_MARKER = '[phone number]';
export const EMAIL_MARKER = '[email address]';

const EMAIL = /[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

/** Not part of a longer word or number, so `WA0004` or `v2.10.3.4567` are left alone. */
const BEFORE = String.raw`(?<![\p{L}\p{N}+])`;
const AFTER = String.raw`(?![\p{L}\p{N}])`;

const PHONE = new RegExp(
  [
    // +91 98765 43210, +1 (555) 123-4567, +44 7700 900123: a plus, then 7 to 15 digits in any grouping.
    String.raw`(?<![\p{L}\p{N}])\+\s?\d{1,3}(?:[\s.()-]*\d){6,12}${AFTER}`,
    // (555) 123-4567, 555-123-4567, 020 7946 0958: three groups. 07700 900123, 98765 43210, 555-1234: the common two.
    String.raw`${BEFORE}\(?\d{2,5}\)?[\s.-]\d{3,4}[\s.-]\d{3,5}${AFTER}`,
    String.raw`${BEFORE}\d{4,5}[\s.-]\d{5,6}${AFTER}`,
    String.raw`${BEFORE}\d{3}-\d{4}${AFTER}`,
    // 9876543210: nine or more digits with nothing between them.
    String.raw`${BEFORE}\d{9,15}${AFTER}`,
  ].join('|'),
  'gu',
);

export function redactText(text: string): string {
  return text.replace(EMAIL, EMAIL_MARKER).replace(PHONE, PHONE_MARKER);
}

/** The Conversation with every Message's text redacted. */
export function redactConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) => ({ ...message, text: redactText(message.text) })),
  };
}
