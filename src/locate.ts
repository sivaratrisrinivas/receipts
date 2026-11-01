// Finding a Line inside its Message. A Snippet is whitespace-normalised and a Message keeps
// its paragraph and line breaks, so words are compared and the breaks between them ignored.
// Shared by the Giver's view of a Line in context (src/context.ts) and the Card's (src/card).

/** Where a Line sits within its Message's text, as character offsets (end exclusive). */
export interface Mark {
  start: number;
  end: number;
}

/** The first place the Line's words appear, whole, one after another in the Message; null when they do not. */
export function locateLine(message: string, line: string): Mark | null {
  const wanted = line.split(/\s+/).filter(Boolean);
  if (wanted.length === 0) return null;
  const words = [...message.matchAll(/\S+/g)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
  for (let first = 0; first + wanted.length <= words.length; first++) {
    if (wanted.every((word, offset) => words[first + offset]!.text === word)) {
      return { start: words[first]!.start, end: words[first + wanted.length - 1]!.end };
    }
  }
  return null;
}
