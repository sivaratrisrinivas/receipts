// Reading a prompt the way a fake Beam does: Snippet IDs come out of the rows it was sent.

import type { BeamRequest } from '../../src';

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
