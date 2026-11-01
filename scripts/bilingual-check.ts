// Live check for small, casual, mixed-language chats: real Poems from an INVENTED bilingual chat
// (tests/fixtures/bilingual-chat.ts) through the real pipeline and the app's Beam settings, plus one
// baseline call made the way chats were before the chat-only prompt note and the low-signal filter.
//
//   npm run check:bilingual -- --dry      # no network, no token: sizes the prompts only
//   npm run check:bilingual               # three Poems + one baseline, a few cents in all
//
// The token is read from ~/.cache/huggingface/token and goes only into the Authorization header of
// the request; this script never prints it. It stops before a call if the spend so far plus a
// generous estimate for the next call would pass the cap.

import {
  BeamError,
  OCCASIONS,
  createFakeBeam,
  createHfBeam,
  selectSnippets,
  tokensCostUsd,
  tryMakePoem,
  type BeamPort,
  type BeamUsage,
  type Occasion,
  type PoemOutcome,
} from '../src';
import { buildPrompt } from '../src/prompt';
import { redactConversation } from '../src/redaction';
import { readConversation } from '../src/sources';
import { between } from '../src/sources/between';
import type { Snippet } from '../src/domain';
import { requireContent } from '../src/beam/port';
import { requireLineCount, verifyAnswer } from '../src/verification';
import { readHfToken } from '../eval/lib/token';
import { BILINGUAL_GIVER, BILINGUAL_RECIPIENT, bilingualChat } from '../tests/fixtures/bilingual-chat';

const CAP_USD = 0.5;
/** A cautious guess for one call, so that a call is not started that the cap cannot cover. */
const NEXT_CALL_ESTIMATE_USD = 0.12;

const dry = process.argv.includes('--dry');
const occasions: Occasion[] = ['birthday', 'thank you', 'missing you'].map((name) => OCCASIONS.find((o) => o === name)!);

let spent = 0;
const usages: BeamUsage[] = [];

function realBeam(): BeamPort {
  let token: string;
  try {
    token = readHfToken({ env: {} });
  } catch {
    console.error('No Hugging Face token found at ~/.cache/huggingface/token.');
    process.exit(2);
  }
  const beam = createHfBeam({ token });
  return {
    async complete(request, onProgress) {
      if (spent + NEXT_CALL_ESTIMATE_USD > CAP_USD) throw new Error(`Stopping: $${spent.toFixed(3)} spent, and another call could pass the $${CAP_USD} cap.`);
      const completion = await beam.complete(request, onProgress);
      if (completion.usage) {
        usages.push(completion.usage);
        spent += tokensCostUsd(completion.usage.promptTokens, completion.usage.completionTokens);
      }
      return completion;
    },
  };
}

const beam: BeamPort = dry
  ? createFakeBeam((request) => {
      const first = [...request.user.matchAll(/^(s\d+) /gm)].slice(0, 8).map((match) => match[1]!);
      console.log(`[dry run] prompt: ${request.system.length + request.user.length} characters`);
      return { picks: first.map((id) => ({ id, note: 'dry run' })) };
    })
  : realBeam();

function show(title: string, outcome: PoemOutcome, usage: BeamUsage | undefined): void {
  console.log(`\n=== ${title}`);
  console.log(`${outcome.conversation.messages.length} Messages, ${outcome.snippets.length} Snippets sent; verified: ${outcome.poem.verified}`);
  if (usage) {
    console.log(`tokens: ${usage.promptTokens} in, ${usage.completionTokens} out (${usage.reasoningTokens} reasoning); cost $${tokensCostUsd(usage.promptTokens, usage.completionTokens).toFixed(4)}`);
  }
  for (const [i, line] of outcome.poem.lines.entries()) {
    console.log(`${String(i + 1).padStart(2)}. ${line.text}`);
    console.log(`      -- ${line.receipt.sender}, ${line.receipt.dateLabel} [${line.snippetId}]`);
    if (line.note) console.log(`      note: ${line.note}`);
  }
}

async function main(): Promise<void> {
  // The three Poems, through the real pipeline.
  for (const occasion of occasions) {
    const before = usages.length;
    const outcome = await tryMakePoem({ source: { kind: 'whatsapp', file: bilingualChat }, occasion, giver: BILINGUAL_GIVER, recipient: BILINGUAL_RECIPIENT }, beam);
    if ('refused' in outcome) throw new Error(`Refused: ${outcome.usableSnippets} usable Snippets.`);
    show(`NEW (chat note + filter): ${occasion}`, outcome, usages[before]);
  }

  // The baseline: the chat as it was handled before. Same Conversation, but every Message of three or more
  // whitespace-separated words is a Snippet, and the chat note is left out of the instructions.
  const conversation = redactConversation(between(readConversation({ kind: 'whatsapp', file: bilingualChat }), BILINGUAL_GIVER, BILINGUAL_RECIPIENT));
  const snippets: Snippet[] = [];
  for (const message of conversation.messages) {
    const text = message.text.split('\n').map((row) => row.trim()).filter(Boolean).join(' ');
    const words = text.split(/\s+/).length;
    if (words < 3 || words > 40) continue;
    const index = snippets.length;
    snippets.push({ id: `s${index}`, index, messageOrdinal: message.ordinal, sender: message.sender, date: message.date, approximate: false, text });
  }
  const selection = selectSnippets(snippets);
  if (selection.kind === 'not-enough') throw new Error('Baseline: not enough Snippets.');
  const built = buildPrompt({ conversation, snippets: selection.snippets, occasion: occasions[0]!, giver: BILINGUAL_GIVER, recipient: BILINGUAL_RECIPIENT, lineRange: selection.lineRange });
  const request = { ...built, system: built.system.split('\n').filter((row) => !row.startsWith('This Conversation is a chat.')).join('\n') };
  if (request.system === built.system) throw new Error('The chat note was not found to remove.');

  const before = usages.length;
  const completion = await beam.complete(request);
  const { lines, verified } = verifyAnswer(requireContent(completion), selection.snippets);
  requireLineCount(lines, selection.lineRange);
  show(
    `BASELINE (no chat note, no filter): ${occasions[0]}`,
    { poem: { occasion: occasions[0]!, giver: BILINGUAL_GIVER, recipient: BILINGUAL_RECIPIENT, lines, verified }, readFraction: selection.readFraction, conversation, snippets: selection.snippets },
    usages[before],
  );
  console.log(`\nTotal spent: about $${spent.toFixed(4)} of the $${CAP_USD} cap.`);
}

try {
  await main();
} catch (error) {
  if (error instanceof BeamError) console.error(`Beam failed (${error.reason}${error.retryable ? ', retryable' : ''}): ${error.message}`);
  else console.error('Check failed:', error instanceof Error ? error.message : error);
  console.log(`\nSpent so far: about $${spent.toFixed(4)}.`);
  process.exit(1);
}
