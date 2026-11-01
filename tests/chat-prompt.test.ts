// Seam 1 for small, casual and mixed-language chats: what Beam is sent. A chat (never the
// Gallery) gets one extra instruction about languages and about what makes a good Line; the
// Gallery's prompt must stay exactly what it was, so the eval and the six shipped Gallery
// Poems stay valid.

import mainsGalleryPrompt from './fixtures/gallery-prompt.main.json';
import { describe, expect, test } from 'vitest';
import { createFakeBeam, makePoem, type BeamRequest, type PoemRequest } from '../src';
import { lettersOnDays, shortBody, spreadDays, volumeOfLetters } from './fixtures/letters';
import { android24h } from './fixtures/whatsapp';
import { padPicks } from './support/prompt';

async function promptFor(request: PoemRequest): Promise<BeamRequest> {
  const beam = createFakeBeam((sent) => ({ picks: padPicks(sent, [], 8) }));
  await makePoem(request, beam);
  return beam.requests[0]!;
}

const galleryRequest: PoemRequest = {
  source: { kind: 'gallery', texts: [volumeOfLetters(lettersOnDays(spreadDays(30, 1), 1, shortBody))] },
  occasion: 'birthday',
  giver: 'Robert',
  recipient: 'Elizabeth',
  note: 'she just retired',
};

describe('the Gallery prompt does not change', () => {
  test('a fixed Gallery request produces, byte for byte, the prompt that main produced before the chat note existed', async () => {
    // tests/fixtures/gallery-prompt.main.json was generated from main (3d51f82) before any of this work.
    const before: BeamRequest = mainsGalleryPrompt;

    const now = await promptFor(galleryRequest);

    expect(now.system).toBe(before.system);
    expect(now.user).toBe(before.user);
    expect(now.responseFormat).toEqual(before.responseFormat);
  });
});

describe('a chat is told that languages mix, and what to look for', () => {
  const chat = { source: { kind: 'whatsapp', file: android24h }, occasion: 'birthday', giver: 'Sam', recipient: 'Mom' } as const satisfies PoemRequest;

  test('the instructions say a chat may mix languages or write one language in another\'s letters, with Telugu as the example', async () => {
    const { system } = await promptFor(chat);

    expect(system).toMatch(/mix languages/i);
    expect(system).toMatch(/Telugu in English letters/);
    expect(system).toMatch(/Telugu script/);
    expect(system).toMatch(/meaning and feeling, not (by )?(its )?language/i);
  });

  test('they steer towards detail, feeling and humour, away from plans, logistics and one-word replies', async () => {
    const { system } = await promptFor(chat);

    expect(system).toMatch(/specific detail, (a )?(real )?feeling or humour/i);
    expect(system).toMatch(/plans, logistics and one-word replies/i);
  });

  test('every private Note is to be written in English', async () => {
    const { system } = await promptFor(chat);

    expect(system).toMatch(/Write each private Note in English/);
  });

  test('the Gallery prompt never mentions any of it', async () => {
    const { system, user } = await promptFor(galleryRequest);

    expect(system + user).not.toMatch(/Telugu|mix languages|logistics/i);
  });
});
