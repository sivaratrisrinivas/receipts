// Reading a prompt the way a fake Beam does: Snippet IDs come out of the rows it was sent.

import type { BeamRequest, FakePick, Line, Poem } from '../../src';

/** The prompt's Snippet rows (`<id> <text>`), as Beam sees them. */
export function promptSnippets(request: BeamRequest): { id: string; text: string }[] {
  return request.user.split('\n').flatMap((row) => {
    const match = /^(s\d+) (.+)$/.exec(row);
    return match ? [{ id: match[1]!, text: match[2]! }] : [];
  });
}

/** The ID Beam would see for the Snippet containing `fragment`. */
export function idOf(request: BeamRequest, fragment: string): string {
  const found = promptSnippets(request).find((snippet) => snippet.text.includes(fragment));
  if (!found) throw new Error(`no Snippet containing "${fragment}" in the prompt`);
  return found.id;
}

/**
 * `picks`, topped up with the earliest other Snippets Beam was shown until there are `total`
 * real Lines: what a fake Beam answers when a test is about particular Lines but a Poem is
 * never fewer than 6. IDs that are not in the prompt are left as they are and do not count.
 */
export function padPicks(request: BeamRequest, picks: readonly FakePick[], total = 6): FakePick[] {
  const shown = promptSnippets(request);
  const real = new Set(shown.map((snippet) => snippet.id));
  const named = new Set(picks.filter((pick) => real.has(pick.id)).map((pick) => pick.id));
  const padding = shown
    .filter((snippet) => !named.has(snippet.id))
    .slice(0, Math.max(0, total - named.size))
    .map((snippet) => ({ id: snippet.id, note: 'Padding, so the Poem has enough Lines.' }));
  return [...picks, ...padding];
}

/** The Poem's Lines that contain any of these fragments, in Poem order: the ones a test chose, without its padding. */
export function linesWith(poem: Poem, ...fragments: string[]): Line[] {
  return poem.lines.filter((line) => fragments.some((fragment) => line.text.includes(fragment)));
}
