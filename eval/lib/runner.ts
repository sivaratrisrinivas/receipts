// The eval run: 3 groups of Poems over the Gallery, each Poem made by the real
// pipeline (`makePoem`) and written to disk as a trace the moment it is finished.
//
// A run can be stopped and resumed: finished Poems (including ones that failed) are
// read back from their traces and not made again, and a Poem interrupted between
// attempts keeps what its failed attempts cost. Retryable Beam errors are retried
// up to twice per Poem; a Poem that still fails is recorded as failed, not hidden.
// Spending is counted from the tokens Beam reports and capped.

import {
  BeamError,
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
import { GALLERY_PEOPLE } from '../../src/sources/gallery';
import { createRandomPicker } from './random-beam';
import { DEFAULT_SPEND_CAP_USD, MAX_COMPLETION_TOKENS, SpendLedger, costOfUsage, estimateCost } from './spend';
import {
  CONDITIONS,
  readAllTraces,
  readTrace,
  writeTrace,
  type Attempt,
  type Condition,
  type Trace,
} from './trace';

export type EvalEvent =
  | { kind: 'poem'; trace: Trace; spentUsd: number }
  | { kind: 'retry'; condition: Condition; index: number; failedAttempts: number; error: string; waitMs: number };

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
  /** Abort rather than start a call that could take estimated spending past this. Default $8. */
  spendCapUsd?: number;
  /** Retries per Poem after a retryable Beam error. Default 2. */
  maxRetries?: number;
  /** The completion budget the Beam adapter sends, which bounds what a call can cost. Default 60,000. */
  maxCompletionTokens?: number;
  /** Waits before the first and second retry. */
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  /** Make Poems that failed on an earlier run again (their earlier attempts stay on the books). */
  redoFailed?: boolean;
  onEvent?: (event: EvalEvent) => void;
}

export interface RunReport {
  /** Every trace for the requested groups and indexes, finished earlier or just now. */
  traces: Trace[];
  /** Estimated total spend in the trace directory, including earlier runs. */
  spentUsd: number;
}

/** The `last10` group shows Beam this share of the Messages, counted from the end. */
const LAST_SHARE = 0.1;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runEval(config: EvalConfig): Promise<RunReport> {
  const conditions = config.conditions ?? CONDITIONS;
  const ledger = new SpendLedger(
    config.spendCapUsd ?? DEFAULT_SPEND_CAP_USD,
    readAllTraces(config.traceDir).reduce((sum, trace) => sum + trace.costUsd, 0),
  );
  const traces: Trace[] = [];
  // Interleaved by index, so a run that stops early still has balanced groups.
  for (let index = 0; index < config.perGroup; index++) {
    for (const condition of conditions) {
      const finished = readTrace(config.traceDir, condition, index);
      const unfinished = finished?.status === 'pending' || (config.redoFailed && finished?.status === 'failed');
      if (finished && !unfinished) {
        traces.push(finished);
        continue;
      }
      const trace = await makeTrace(config, ledger, condition, index, finished?.attempts ?? []);
      writeTrace(config.traceDir, trace);
      config.onEvent?.({ kind: 'poem', trace, spentUsd: ledger.spentUsd });
      traces.push(trace);
    }
  }
  return { traces, spentUsd: ledger.spentUsd };
}

async function makeTrace(
  config: EvalConfig,
  ledger: SpendLedger,
  condition: Condition,
  index: number,
  earlierAttempts: Attempt[],
): Promise<Trace> {
  const occasion: Occasion = OCCASIONS[index % OCCASIONS.length]!;
  const request: PoemRequest = {
    source: { kind: 'gallery', texts: config.texts },
    occasion,
    ...GALLERY_PEOPLE,
  };
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  const whole = readConversation(request.source);
  const shown = condition === 'last10' ? keepLastShare(whole) : whole;
  const base = {
    condition,
    index,
    occasion,
    ...GALLERY_PEOPLE,
    startedAt,
    messagesRead: shown.messages.length,
    snippetsRead: snippetsOf(shown).length,
  };
  const finish = (rest: Pick<Trace, 'status' | 'attempts' | 'answer'> & Partial<Trace>): Trace => ({
    ...base,
    seconds: (Date.now() - started) / 1000,
    costUsd: rest.attempts.reduce((sum, attempt) => sum + attempt.costUsd, 0),
    ...rest,
  });

  if (condition === 'random') {
    const picker = createRandomPicker(snippetsOf(whole).length, `random-${index}`);
    const { poem } = await makePoem(request, picker);
    return finish({ status: 'ok', attempts: [], answer: null, poem: poemOf(poem) });
  }

  const attempts = [...earlierAttempts];
  const maxRetries = config.maxRetries ?? 2;
  const delays = config.retryDelaysMs ?? [5_000, 15_000];
  const sleep = config.sleep ?? realSleep;
  const options = condition === 'last10' ? { narrow: keepLastShare } : {};

  for (let failures = 0; ; failures++) {
    const call = meter(config.beam, ledger, config.maxCompletionTokens ?? MAX_COMPLETION_TOKENS);
    try {
      const outcome = await makePoem(request, call.beam, options);
      attempts.push(call.attempt());
      return finish({ status: 'ok', attempts, answer: call.answer(), poem: poemOf(outcome.poem) });
    } catch (error) {
      if (!(error instanceof BeamError)) throw error;
      const failure = { reason: error.reason, message: error.message };
      attempts.push({ ...call.attempt(), error: failure });
      // Written at once, so a run that stops here (spend cap, rate limit, crash) loses no paid-for attempt.
      writeTrace(config.traceDir, finish({ status: 'pending', attempts: [...attempts], answer: call.answer(), error: failure }));
      // Nothing a retry can fix (bad token, no credits): stop the run instead of failing every Poem.
      if (!error.retryable) throw error;
      if (failures >= maxRetries) return finish({ status: 'failed', attempts, answer: call.answer(), error: failure });
      const waitMs = delays[Math.min(failures, delays.length - 1)] ?? 0;
      config.onEvent?.({ kind: 'retry', condition, index, failedAttempts: failures + 1, error: error.message, waitMs });
      await sleep(waitMs);
    }
  }
}

/** The last tenth of the Messages, rounded up; Messages keep their place in the full Conversation. */
function keepLastShare(conversation: Conversation): Conversation {
  const kept = Math.ceil(conversation.messages.length * LAST_SHARE);
  const messages = conversation.messages.slice(-kept);
  return { ...conversation, messages, senders: [...new Set(messages.map((message) => message.sender))] };
}

/**
 * Wraps a port for one attempt: refuses a call that could pass the spend cap, then
 * records what the call cost (from reported tokens, or estimated when none came back)
 * and what Beam answered.
 */
function meter(beam: BeamPort, ledger: SpendLedger, maxCompletionTokens: number) {
  let recorded: Attempt | undefined;
  let content: string | null = null;
  return {
    answer: () => content,
    attempt: (): Attempt => {
      if (!recorded) throw new Error('No Beam call was made for this attempt');
      return recorded;
    },
    beam: {
      async complete(request, onProgress): Promise<BeamCompletion> {
        ledger.assertRoomFor(estimateCost(request, maxCompletionTokens));
        const started = Date.now();
        const seconds = () => (Date.now() - started) / 1000;
        const record = (attempt: Omit<Attempt, 'seconds'>) => {
          recorded = { seconds: seconds(), ...attempt };
          ledger.charge(attempt.costUsd);
        };

        let completion: BeamCompletion;
        try {
          completion = await beam.complete(request, onProgress);
        } catch (error) {
          // The adapter throws before handing back token counts. A truncated answer spent the whole
          // completion budget; any other failure is charged for the input only.
          if (error instanceof BeamError) {
            const outputTokens = error.reason === 'truncated' ? maxCompletionTokens : 0;
            record({ costUsd: estimateCost(request, outputTokens), costKind: 'estimate' });
          }
          throw error;
        }
        content = completion.content;
        record(
          completion.usage
            ? { costUsd: costOfUsage(completion.usage), costKind: 'usage', usage: completion.usage, finishReason: completion.finishReason }
            : { costUsd: estimateCost(request, maxCompletionTokens), costKind: 'estimate', finishReason: completion.finishReason },
        );
        return completion;
      },
    } satisfies BeamPort,
  };
}

function poemOf(poem: PoemOutcome['poem']): NonNullable<Trace['poem']> {
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
