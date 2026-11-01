// Synthetic WhatsApp exports for the pipeline tests. Nobody real said any of this.
// U+200E (left-to-right mark) and U+202F (narrow no-break space) are written as escapes
// because they are invisible, and they are exactly what real exports are full of.
//
// Every chat carries a run of everyday filler Messages so that it is big enough for a
// Poem (fewer than 15 usable Snippets is refused before Beam is called). The filler says
// nothing the tests look for.

const LRM = '‎';
const NNBSP = ' ';

/** What the filler Messages say: three usable words or more, no names, no numbers. */
export const everydayNote = (i: number) => `Everyday note number ${i + 1}: the kettle is on and the post has come.`;

/**
 * `count` filler lines, the senders taking turns. `format` writes one line of the export
 * (timestamp, sender and text) in whichever shape the fixture is in.
 */
export function filler(
  count: number,
  format: (i: number, sender: string, text: string) => string,
  senders: readonly string[] = ['Mom', 'Sam'],
): string[] {
  return Array.from({ length: count }, (_, i) => format(i, senders[i % senders.length]!, everydayNote(i)));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Android, 24h clock, day first. Dates over 12 in the first position settle the order. */
export const android24h = [
  '12/03/2024, 09:15 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Learn more.',
  '12/03/2024, 09:16 - Mom: Remember the lemon cake from the lake house, with the burnt edges?',
  '12/03/2024, 09:18 - Sam: I still dream about that cake, honestly.',
  '12/03/2024, 09:19 - Mom: <Media omitted>',
  '12/03/2024, 09:20 - Mom: This message was deleted',
  '12/03/2024, 09:21 - Sam: You deleted this message',
  '12/03/2024, 09:25 - Mom: Come for dinner on Sunday?',
  'Bring the good plates.',
  'And the blue jug, please.',
  '13/03/2024, 18:02 - Mom: Call me when you land, I will keep the porch light on. <This message was edited>',
  '13/03/2024, 18:03 - Sam: IMG-20240313-WA0004.jpg (file attached)',
  '13/03/2024, 18:04 - Mom changed the subject from "Home" to "Home: 2024"',
  '13/03/2024, 18:05 - Mom changed their phone number to a new number. Tap to message or add the new number.',
  '14/03/2024, 07:30 - Sam: ok',
  ...filler(12, (i, who, text) => `${pad(15 + i)}/04/2024, 12:00 - ${who}: ${text}`),
  '28/05/2024, 08:00 - Sam: Happy birthday, Mom, thank you for every single Sunday dinner.',
  '31/05/2024, 22:41 - Mom: You always answered, whatever the hour, and I never said how much that meant.',
].join('\n');

/** How many Messages Mom and Sam sent in {@link android24h}: 4 + 3 of their own, and the filler. */
export const ANDROID_24H_MESSAGES = 7 + 12;

/** Android, 12h clock with U+202F before AM/PM, month first (13 in the second position). */
export const android12h = [
  `3/12/24, 9:15${NNBSP}PM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
  `3/12/24, 9:16${NNBSP}PM - Mom: Remember the lemon cake from the lake house, with the burnt edges?`,
  `3/13/24, 6:02${NNBSP}AM - Sam: I still dream about that cake, honestly.`,
  `3/13/24, 6:03${NNBSP}AM - Mom: <Media omitted>`,
  ...filler(12, (i, who, text) => `4/${15 + i}/24, 12:00${NNBSP}PM - ${who}: ${text}`),
  `5/28/24, 12:00${NNBSP}AM - Sam: Happy birthday, Mom, thank you for every single Sunday dinner.`,
].join('\n');

/** iOS, bracketed 24h timestamps with seconds, day first, LRM marking attachments and system text. */
export const ios24h = [
  `${LRM}[12/03/2024, 21:15:42] Mom: ${LRM}Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
  '[12/03/2024, 21:16:10] Mom: Remember the lemon cake from the lake house, with the burnt edges?',
  '[12/03/2024, 21:18:02] Sam: I still dream about that cake, honestly.',
  `${LRM}[13/03/2024, 18:02:10] Mom: ${LRM}<attached: 00000012-PHOTO-2024-03-13-18-02-10.jpg>`,
  `${LRM}[13/03/2024, 18:03:11] Sam: ${LRM}image omitted`,
  `${LRM}[13/03/2024, 18:03:50] Sam: ${LRM}sticker omitted`,
  `${LRM}[13/03/2024, 18:04:12] Mom: ${LRM}This message was deleted.`,
  `${LRM}[13/03/2024, 18:04:40] Sam: ${LRM}You deleted this message.`,
  `[13/03/2024, 18:05:00] Mom: Call me when you land, I will keep the porch light on. ${LRM}<This message was edited>`,
  '[14/03/2024, 07:30:05] Sam: Landed safely.',
  'Heading to the taxi now.',
  ...filler(12, (i, who, text) => `[${pad(15 + i)}/04/2024, 12:00:00] ${who}: ${text}`),
  '[28/05/2024, 08:00:00] Sam: Happy birthday, Mom, thank you for every single Sunday dinner.',
].join('\n');

/** iOS, bracketed 12h timestamps, month first. */
export const ios12h = [
  `${LRM}[3/12/24, 9:15:42${NNBSP}PM] Mom: ${LRM}Messages and calls are end-to-end encrypted.`,
  `[3/12/24, 9:16:10${NNBSP}PM] Mom: Remember the lemon cake from the lake house, with the burnt edges?`,
  `[3/13/24, 6:02:10${NNBSP}AM] Sam: I still dream about that cake, honestly.`,
  ...filler(12, (i, who, text) => `[4/${15 + i}/24, 12:00:00${NNBSP}PM] ${who}: ${text}`),
  `[5/28/24, 12:00:00${NNBSP}AM] Sam: Happy birthday, Mom, thank you for every single Sunday dinner.`,
].join('\n');

/** A family group: Sam and Mom are the Giver and Recipient; Dad, Aunt Priya and a bare number are bystanders. */
export const familyGroup = [
  '12/03/2024, 09:15 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Learn more.',
  '12/03/2024, 09:15 - Dad created group "Sunday lunch"',
  '12/03/2024, 09:16 - Dad added Aunt Priya',
  '12/03/2024, 09:20 - Mom: Remember the lemon cake from the lake house, with the burnt edges?',
  '12/03/2024, 09:21 - Dad: The garage key is under the third flowerpot, tell nobody.',
  '12/03/2024, 09:22 - Sam: I still dream about that cake, honestly.',
  '13/03/2024, 18:02 - Aunt Priya: My landlord raised the rent again and I am furious.',
  '13/03/2024, 18:03 - +91 98765 43210: Who is coming to the lake house this weekend?',
  '14/03/2024, 07:30 - Dad: Sam owes me forty pounds from the football bet.',
  ...filler(18, (i, who, text) => `${pad(1 + i)}/04/2024, 12:00 - ${who}: ${text}`, ['Mom', 'Dad', 'Sam']),
  '28/05/2024, 08:00 - Sam: Happy birthday, Mom, thank you for every single Sunday dinner.',
  '31/05/2024, 22:41 - Mom: You always answered, whatever the hour, and I never said how much that meant.',
  '31/05/2024, 22:50 - Aunt Priya: Congratulations to the birthday girl, you deserve a long holiday.',
].join('\n');

/** Mom and Sam each sent 8 Messages in {@link familyGroup}: 2 of their own and 6 filler. */
export const FAMILY_GROUP_MESSAGES = 16;

/** Day and month pairs from 7 to 12, never equal: valid either way round, and after 5 June whichever way. */
const LATER_DATES = [[7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 7], [7, 9], [8, 10], [9, 11], [10, 12], [7, 10], [8, 11]] as const;

/**
 * Every date reads validly both ways (3 June or 6 March), so only the Giver can say which.
 * The filler is dated later under either reading.
 */
export const ambiguousDates = [
  '03/06/24, 09:15 - Mom: Remember the lemon cake from the lake house, with the burnt edges?',
  '03/06/24, 09:18 - Sam: I still dream about that cake, honestly.',
  '04/06/24, 18:02 - Mom: Call me when you land, I will keep the porch light on.',
  '05/06/24, 08:00 - Sam: Happy birthday, Mom, thank you for every single Sunday dinner.',
  ...filler(12, (i, who, text) => `${pad(LATER_DATES[i]![0])}/${pad(LATER_DATES[i]![1])}/24, 12:00 - ${who}: ${text}`),
].join('\n');

/** Phone numbers and email addresses that must never leave the browser, among things that only look like them. */
export const withContactDetails = [
  '12/03/2024, 09:16 - Mom: Ring me on +91 98765 43210 if the train is late, I will wait at the gate.',
  '12/03/2024, 09:17 - Sam: My landline is (020) 7946 0958 and my mobile is 07700 900123, so ring either one.',
  '12/03/2024, 09:18 - Mom: Write to mom.lemoncake@example.com whenever you like, I read it every morning.',
  '13/03/2024, 18:02 - Sam: Our flat number is 4812 and we moved there on 2024-03-05 after waiting from 1999-2024.',
  '13/03/2024, 18:03 - Mom: Dial 5551234567 or 555-123-4567 for the florist, then send her the lemon cake order.',
  '13/03/2024, 18:04 - Sam: Sorry, wrong number. Use first.last+cake@mail.example.org instead, please.',
  ...filler(10, (i, who, text) => `${pad(15 + i)}/04/2024, 12:00 - ${who}: ${text}`),
  '28/05/2024, 08:00 - Sam: Happy birthday, Mom, thank you for every single Sunday dinner.',
].join('\n');

/** Two people whose names start with the same letter, and a third who is only a phone number. */
export const sameInitials = [
  '12/03/2024, 09:16 - Sam: Remember the lemon cake from the lake house, with the burnt edges?',
  '12/03/2024, 09:18 - Sasha: I still dream about that cake, honestly.',
  '13/03/2024, 18:02 - Sam: Call me when you land, I will keep the porch light on.',
  '13/03/2024, 18:05 - +44 7700 900123: Congratulations on the cake, from a stranger.',
  ...filler(24, (i, who, text) => `${pad(1 + i)}/04/2024, 12:00 - ${who}: ${text}`, ['Sam', 'Sasha', '+44 7700 900123']),
].join('\n');
