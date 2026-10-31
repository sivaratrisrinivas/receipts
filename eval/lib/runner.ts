// The eval run: 3 groups of Poems over the Gallery, each Poem made by the real
// pipeline (`makePoem`) and written to disk as a trace the moment it is finished.

import {
  OCCASIONS,
  makePoem,
  readConversation,
  snippetsOf,
  type BeamCompletion,
  type BeamPort,
  type Conversation,
  type Occasion,
  type PoemOutcome,
  type PoemRequest,
} from '../../src';
import { createRandomPicker } from './random-beam';
import { costOfUsage } from './spend';
import { CONDITIONS, readTrace, writeTrace, type Attempt, type Condition, type Trace } from './trace';

export interface EvalConfig {
  /** The Gallery's Gutenberg texts, as plain strings. */
  texts: string[];
  /** Where traces are written (and, on a rerun, read back so finished Poems are skipped). */
  traceDir: string;
  /** Poems per group. */
  perGroup: number;
  /** Used by the `full` and `last10` groups. */
  beam: BeamPort;
  conditions?: readonly Condition[];
}

export interface RunReport {
  /** Every trace for the requested groups and indexes, finished earlier or just now. */
  traces: Trace[];
}

const GIVER = 'Robert';
const RECIPIENT = 'Elizabeth';
/** The `last10` group shows Beam this share of the Messages, counted from the end. */
const LAST_SHARE = 0.1;

export async function runEval(config: EvalConfig): Promise<RunReport> {
  const conditions = config.conditions ?? CONDITIONS;
  const traces: Trace[] = [];
  // Interleaved by index, so a run that stops early still has balanced groups.
  for (let index = 0; index < config.perGroup; index++) {
    for (const condition of conditions) {
      const finished = readTrace(config.traceDir, condition, index);
      const trace = finished ?? (await makeTrace(config, condition, index));
      if (!finished) writeTrace(config.traceDir, trace);
      traces.push(trace);
    }
  }
  return { traces };
}

async function makeTrace(config: EvalConfig, condition: Condition, index: number): Promise<Trace> {
  const occasion: Occasion = OCCASIONS[index % OCCASIONS.length]!;
  const request: PoemRequest = {
    source: { kind: 'gallery', texts: config.texts },
    occasion,
    giver: GIVER,
    recipient: RECIPIENT,
  };
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  const metered = meter(
    condition === 'random'
      ? createRandomPicker(snippetsOf(readConversation(request.source)).length, `random-${index}`)
      : config.beam,
  );
  const outcome = await makePoem(request, metered.beam, condition === 'last10' ? { narrow: keepLastShare } : {});
  const attempts = metered.attempts;

  return {
    condition,
    index,
    occasion,
    giver: GIVER,
    recipient: RECIPIENT,
    startedAt,
    seconds: (Date.now() - started) / 1000,
    status: 'ok',
    messagesRead: outcome.conversation.messages.length,
    snippetsRead: outcome.snippets.length,
    attempts: condition === 'random' ? [] : attempts,
    costUsd: attempts.reduce((sum, attempt) => sum + attempt.costUsd, 0),
    answer: condition === 'random' ? null : (metered.answer() ?? null),
    poem: poemOf(outcome),
  };
}

/** The last tenth of the Messages, rounded up; Messages keep their place in the full Conversation. */
function keepLastShare(conversation: Conversation): Conversation {
  const kept = Math.ceil(conversation.messages.length * LAST_SHARE);
  const messages = conversation.messages.slice(-kept);
  return { ...conversation, messages, senders: [...new Set(messages.map((message) => message.sender))] };
}

/** Wraps a port to record what each call cost and what Beam finally answered. */
function meter(beam: BeamPort) {
  const attempts: Attempt[] = [];
  let lastContent: string | null = null;
  return {
    attempts,
    answer: () => lastContent,
    beam: {
      async complete(request, onProgress): Promise<BeamCompletion> {
        const started = Date.now();
        const completion = await beam.complete(request, onProgress);
        lastContent = completion.content;
        attempts.push({
          seconds: (Date.now() - started) / 1000,
          costUsd: completion.usage ? costOfUsage(completion.usage) : 0,
          costKind: 'usage',
          ...(completion.usage ? { usage: completion.usage } : {}),
          finishReason: completion.finishReason,
        });
        return completion;
      },
    } satisfies BeamPort,
  };
}

function poemOf({ poem }: PoemOutcome): NonNullable<Trace['poem']> {
  return {
    verified: poem.verified,
    lines: poem.lines.map((line) => ({
      snippetId: line.snippetId,
      messageOrdinal: line.receipt.messageOrdinal,
      sender: line.receipt.sender,
      date: line.receipt.date,
      approximate: line.receipt.approximate,
      dateLabel: line.receipt.dateLabel,
      text: line.text,
      note: line.note,
      callbacks: line.callbacks,
    })),
  };
}
