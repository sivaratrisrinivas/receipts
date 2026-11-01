// Seam 1 for small, casual and mixed-language chats: which chat Messages become Snippets, and
// so what Beam is sent and what the size table counts. The rules are structural (length,
// letters against symbols, links, repetition), so they hold for Telugu script and for Telugu
// in English letters as much as for English. The Gallery's letters are never touched.

import { describe, expect, test } from 'vitest';
import { createFakeBeam, makePoem, tryMakePoem, type PoemRequest } from '../src';
import { lettersOnDays, shortBody, spreadDays, volumeOfLetters } from './fixtures/letters';
import { padPicks } from './support/prompt';
import { BILINGUAL_GIVER, BILINGUAL_RECIPIENT, bilingualChat } from './fixtures/bilingual-chat';

/** An Android export in which Sam and Mom take turns saying `texts`, one Message a day from 1 January 2024. */
function chatOf(texts: readonly string[]): string {
  return texts
    .map((text, i) => {
      const day = new Date(Date.UTC(2024, 0, 1 + i));
      const stamp = `${String(day.getUTCDate()).padStart(2, '0')}/${String(day.getUTCMonth() + 1).padStart(2, '0')}/${day.getUTCFullYear()}`;
      return `${stamp}, 09:00 - ${i % 2 === 0 ? 'Sam' : 'Mom'}: ${text}`;
    })
    .join('\n');
}

const requestFor = (texts: readonly string[]): PoemRequest => ({
  source: { kind: 'whatsapp', file: chatOf(texts) },
  occasion: 'birthday',
  giver: 'Sam',
  recipient: 'Mom',
});

/** Fifteen ordinary Messages, so that the chat is big enough for a Poem whatever else it holds. */
const ordinary = Array.from({ length: 15 }, (_, i) => `Ordinary Message ${i + 1} about the kettle and the post.`);

/** The Snippet texts Beam was shown for a chat that says `extra` besides {@link ordinary}, apart from the ordinary ones. */
async function shownBesidesOrdinary(extra: readonly string[]): Promise<string[]> {
  const beam = createFakeBeam((sent) => ({ picks: padPicks(sent, [], 8) }));
  await makePoem(requestFor([...ordinary, ...extra]), beam);
  return beam.requests[0]!.user
    .split('\n')
    .flatMap((row) => /^s\d+ (.+)$/.exec(row)?.[1] ?? [])
    .filter((text) => !text.startsWith('Ordinary Message'));
}

describe('a chat Message with nothing to say is not sent', () => {
  test('a Message that is only a link is dropped, even though two links and a letter are "three words"', async () => {
    const shown = await shownBesidesOrdinary(['https://www.youtube.com/watch?v=abc123 https://example.org/a b', 'www.example.org/some/long/path']);

    expect(shown).toEqual([]);
  });

  test('a link with real words around it is kept whole, link and all', async () => {
    const shown = await shownBesidesOrdinary(['you have to watch this https://youtu.be/xyz it made me laugh']);

    expect(shown).toEqual(['you have to watch this https://youtu.be/xyz it made me laugh']);
  });

  test('a link does not make a two-word Message long enough', async () => {
    expect(await shownBesidesOrdinary(['look here https://youtu.be/xyz'])).toEqual([]);
  });

  test('Messages made of emoji or symbols only are dropped, however many "words" they have', async () => {
    expect(await shownBesidesOrdinary(['😂 😂 😂 😂', '❤️❤️❤️ 🥹 🙏', '... !!! ???', '👍 👍 ok'])).toEqual([]);
  });

  test('a Message that is mostly emoji around a couple of letters is dropped', async () => {
    expect(await shownBesidesOrdinary(['ha ha 😂😂😂😂😂😂😂😂😂😂', 'so 😍😍😍😍😍😍😍😍 so'])).toEqual([]);
  });

  test('the same word over and over is dropped, in any language', async () => {
    expect(await shownBesidesOrdinary(['haha haha haha haha', 'Ok ok OK ok', 'సరే సరే సరే', 'nooooo nooooo nooooo'])).toEqual([]);
  });

  test('three tiny words are not a Line: it takes at least eight letters', async () => {
    expect(await shownBesidesOrdinary(['ok ya no', 'ha ha ok', 'u r k'])).toEqual([]);
  });

  test('short but real Messages stay, including a few emoji beside words', async () => {
    const keep = ['I love you', 'miss you so much 😭', 'see you at 5:30 pm', 'Happy birthday Mom 🎂🎉'];

    expect(await shownBesidesOrdinary(keep)).toEqual(keep);
  });

  test('what is dropped is not counted: 14 usable Messages and a pile of noise is still "not enough"', async () => {
    const noise = ['😂😂😂', 'ok', 'https://youtu.be/a', 'lol lol lol', 'haha', '👍', 'yes yes yes'];
    const beam = createFakeBeam((sent) => ({ picks: padPicks(sent, [], 8) }));

    const result = await tryMakePoem(requestFor([...ordinary.slice(0, 14), ...noise]), beam);

    expect(result).toMatchObject({ refused: 'not-enough', usableSnippets: 14, needed: 15 });
    expect(beam.requests).toHaveLength(0);
  });

  test('the Gallery is untouched: a letter that is three of the same word is still a Snippet', async () => {
    const letters = lettersOnDays(spreadDays(20, 1), 1, (n) => (n === 0 ? 'Yes, yes, yes.' : shortBody(n)));
    const beam = createFakeBeam((sent) => ({ picks: padPicks(sent, [], 8) }));

    await makePoem({ source: { kind: 'gallery', texts: [volumeOfLetters(letters)] }, occasion: 'birthday', giver: 'Robert', recipient: 'Elizabeth' }, beam);

    expect(beam.requests[0]!.user).toContain('Yes, yes, yes.');
  });
});

describe('a year of an invented bilingual friendship', () => {
  test('its noise is not sent, and its Telugu (in script and in English letters) and English warmth is', async () => {
    const beam = createFakeBeam((sent) => ({ picks: padPicks(sent, [], 8) }));

    const { snippets } = await makePoem({ source: { kind: 'whatsapp', file: bilingualChat }, occasion: 'birthday', giver: BILINGUAL_GIVER, recipient: BILINGUAL_RECIPIENT }, beam);
    const texts = snippets.map((snippet) => snippet.text);

    expect(texts.filter((text) => /https?:\/\//.test(text))).toEqual([]);
    expect(texts.filter((text) => !/\p{L}/u.test(text))).toEqual([]);
    expect(texts).not.toContain('gm');
    expect(texts).toContain('నాకు కన్నీళ్ళు ఆగడం లేదు రా. చాలా సంతోషంగా ఉంది. నువ్వు ఎంతో మంచి వ్యక్తివి, నిన్ను ఎంచుకున్న ఆమె అదృష్టవంతురాలు');
    expect(texts).toContain('nenu kooda ninnu miss avutunna. ee city lo nuvvu leka ee chai kuda taste ga ledu');
    expect(texts).toContain('Anu, thank you for this year. it was the hardest and the best, because of you');
  });
});

describe('Telugu, in its own script or in English letters, is read like any other language', () => {
  test('Telugu words count as words: a three-word Telugu Message is a Snippet and a two-word one is not', async () => {
    const shown = await shownBesidesOrdinary(['నేను నిన్ను మిస్ అవుతున్నాను', 'నాకు నచ్చింది బాగా', 'సరే అమ్మ']);

    expect(shown).toEqual(['నేను నిన్ను మిస్ అవుతున్నాను', 'నాకు నచ్చింది బాగా']);
  });

  test('Telugu in English letters and a mix of both are kept as they are', async () => {
    const keep = ['nuvvu leka nenu chala miss avtunna', 'Happy birthday ra, నీ నవ్వు ఎప్పటికీ ఇలాగే ఉండాలి', 'bhojanam ayyindha, nenu inka work lone unna'];

    expect(await shownBesidesOrdinary(keep)).toEqual(keep);
  });

  test('a 40-word limit is counted in words, so a long Telugu Message splits into its sentences', async () => {
    const one = 'నిన్న రాత్రి నువ్వు చెప్పిన మాట నాకు చాలా సేపు గుర్తుండిపోయింది.';
    const two = 'ఎందుకంటే అలా ఎవరూ నాతో ఇంతవరకు మాట్లాడలేదు.';
    const three = 'ఈ రోజు కూడా అదే ఆలోచిస్తున్నాను మళ్ళీ మళ్ళీ.';
    const long = [one, two, three, one, two, three].join(' ');

    expect(await shownBesidesOrdinary([long])).toEqual([one, two, three, one, two, three]);
  });

  test('a Telugu sentence is not mistaken for an abbreviation or for initials because it ends in a bare letter', async () => {
    const long = ['అమ్మ మనసు ఎప్పుడూ నీ గురించే ఆలోచిస్తుంది కదా అని చెప్పింది ఆమ.', 'nenu రేపు ఉదయం ఇంటికి వస్తాను అని చెప్పాను కదా మరి ఎందుకు అడుగుతున్నావు రా.', 'Dr. Rao annaru ela unnav ani, nenu bagunna ani cheppanu.', 'inka konchem sepu undi ra, tarvata matladadam better anipistundi kada mari.'];
    const text = long.join(' ');

    expect(await shownBesidesOrdinary([text])).toEqual(long);
  });

  test('"wait... " followed by a word in a script with no capitals is still one thought', async () => {
    const first = 'నేను అక్కడికి వెళ్ళగానే చూశాను wait... ఇదేంటి అని అనిపించింది నాకు, అక్కడ ఎవరూ లేరు ఒక్కరు కూడా, అంతా ఖాళీగా ఉంది.';
    const second = 'సరే రేపు మాట్లాడుకుందాం ఇంకా చాలా ఉంది చెప్పడానికి నీకు తెలుసు కదా అన్నీ మనవే.';
    const third = 'అప్పటివరకు జాగ్రత్తగా ఉండు, భోజనం చేసి పడుకో, నన్ను తలచుకో ఒక్కసారి, నేను కూడా నిన్నే తలచుకుంటాను ఈ రాత్రంతా.';
    // More than forty words in all, so it is split into sentences, but not at the ellipsis.
    const shown = await shownBesidesOrdinary([`${first} ${second} ${third}`]);

    expect(shown).toEqual([first, second, third]);
  });
});
