// LOCAL DEV ONLY: a scripted Beam for working on the screens without spending credits.
// Only reached through a dynamic import behind `import.meta.env.DEV`, so it is not in
// the production build.
//
//   ?beam=fake          a Poem in about 8 seconds, with progress on the way
//   ?beam=unverified    the same, but Beam also names a Snippet that does not exist (no badge)
//   ?beam=credits       fails with HTTP 402 (out of credits); a retry then succeeds
//   ?beam=network       fails with a dropped connection; a retry then succeeds
//   ?beam=truncated     fails as truncated; a retry then succeeds
//   ?beam=expired       fails with HTTP 401 (sign-in expired)
//   ?beam=slow          never finishes (for the "taking longer than usual" state)
//   ?beam=replace-fails the Poem works; the first Replace fails with a dropped connection
//
// Notes in the scripted Poem cite the pick before them, so callback links can be tried; a
// Replace answers with the first Snippet it is offered (after about a second).

import { BeamError, type BeamPort, type BeamRequest } from '../beam/port';
import { REPLACEMENT_RESPONSE_FORMAT } from '../editing';

const PICKS = 10;

/** Ten Snippet IDs spread evenly through the Conversation as the prompt lays it out. */
function spreadPicks(request: BeamRequest, ghost: boolean): string {
  const ids = [...request.user.matchAll(/^(s\d+) /gm)].map((match) => match[1]!);
  const picks = Array.from({ length: PICKS }, (_, i) => ids[Math.floor(((i + 0.5) * ids.length) / PICKS)]!);
  if (ghost) picks.push('s99999999');
  return JSON.stringify({
    lines: picks.map((id, i) => ({
      id,
      note: i === 0 ? 'A scripted pick.' : `A scripted pick that answers ${picks[i - 1]}.`,
      callbacks: i === 0 ? [] : [picks[i - 1]],
    })),
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function scriptedBeamFromUrl(url: URL): BeamPort | null {
  const mode = url.searchParams.get('beam');
  if (!mode) return null;
  let failures = mode === 'credits' || mode === 'network' || mode === 'truncated' ? 1 : 0;
  let replaceFailures = mode === 'replace-fails' ? 1 : 0;

  return {
    async complete(request, onProgress) {
      if (request.responseFormat.name === REPLACEMENT_RESPONSE_FORMAT.name) {
        await sleep(1200);
        if (replaceFailures-- > 0) throw new BeamError('network', 'The connection dropped.', true);
        return { content: JSON.stringify({ id: /^(s\d+) /m.exec(request.user)![1] }), finishReason: 'stop' };
      }
      if (mode === 'expired') throw new BeamError('http', 'Beam request failed (HTTP 401)', false, 401);
      for (let step = 1; step <= 8; step++) {
        await sleep(mode === 'slow' ? 1500 : 1000);
        onProgress?.({ reasoningTokens: step * 1100 });
      }
      if (mode === 'slow') await new Promise(() => {});
      if (failures > 0) {
        failures--;
        if (mode === 'credits') throw new BeamError('http', 'Beam request failed (HTTP 402)', false, 402);
        if (mode === 'network') throw new BeamError('network', 'The connection dropped.', true);
        throw new BeamError('truncated', 'Beam ran out of room.', true);
      }
      return { content: spreadPicks(request, mode === 'unverified'), finishReason: 'stop' };
    },
  };
}
