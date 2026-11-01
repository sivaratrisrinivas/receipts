// The dataset folder: everything published as `Srini410/receipts-eval`, built from the
// traces in `<dir>/traces`. Nothing here calls Beam; it only reads traces.
//
//   README.md     dataset card (Hub front-matter, method, results, findings, credits)
//   poems.jsonl   one row per Poem, with its Lines, tokens, cost and metrics
//   metrics.csv   the metrics table, one row per group
//   metrics.json  the same numbers with the group definitions
//   traces/       one raw JSON trace per Poem

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Conversation } from '../../src';
import { poemMetrics, summarize, type GroupMetrics, type MetricMeans } from './metrics';
import { MAX_COMPLETION_TOKENS, costOf } from './spend';
import { readAllTraces, type Attempt, type Condition, type Trace } from './trace';

const GROUP_LABELS: Record<Condition, string> = {
  full: 'Beam on the full Conversation',
  last10: 'Beam on the last 10%',
  random: 'Random Snippets',
};

/** Every group is planned at this many Poems; a group with fewer was stopped early (the spend cap) and says so. */
export const PLANNED_POEMS_PER_GROUP = 20;

const README_TEMPLATE = new URL('../README.template.md', import.meta.url);

export interface BuiltDataset {
  groups: GroupMetrics[];
  /** The files written, relative to the dataset folder. */
  files: string[];
}

export function buildDataset({ dir, conversation }: { dir: string; conversation: Conversation }): BuiltDataset {
  const traces = readAllTraces(join(dir, 'traces'));
  const groups = summarize(traces, conversation);

  const poems = traces.map((trace) => JSON.stringify(poemRow(trace, conversation))).join('\n');
  writeFileSync(join(dir, 'poems.jsonl'), `${poems}\n`);
  writeFileSync(join(dir, 'metrics.csv'), metricsCsv(groups));
  writeFileSync(join(dir, 'metrics.json'), `${JSON.stringify({ groups }, null, 2)}\n`);
  writeFileSync(join(dir, 'README.md'), readme(groups, traces));

  return { groups, files: ['README.md', 'metrics.csv', 'metrics.json', 'poems.jsonl'] };
}

function poemRow(trace: Trace, conversation: Conversation) {
  const metrics = poemMetrics(trace, conversation);
  const sum = (field: 'promptTokens' | 'completionTokens' | 'reasoningTokens') =>
    trace.attempts.reduce((total, attempt) => total + (attempt.usage?.[field] ?? 0), 0);
  return {
    condition: trace.condition,
    index: trace.index,
    occasion: trace.occasion,
    giver: trace.giver,
    recipient: trace.recipient,
    status: trace.status,
    error: trace.error?.reason ?? null,
    verified: metrics?.verified ?? false,
    n_lines: trace.poem?.lines.length ?? 0,
    messages_read: trace.messagesRead,
    snippets_read: trace.snippetsRead,
    beam_calls: trace.attempts.length,
    seconds: round(trace.seconds, 1),
    cost_usd: round(trace.costUsd, 4),
    prompt_tokens: sum('promptTokens'),
    completion_tokens: sum('completionTokens'),
    reasoning_tokens: sum('reasoningTokens'),
    finish_reason: trace.attempts[trace.attempts.length - 1]?.finishReason ?? null,
    timeline_coverage: metrics?.timelineCoverage ?? 0,
    sender_balance: round(metrics?.senderBalance ?? 0, 4),
    note_callbacks: metrics?.noteCallbacks ?? 0,
    lines: (trace.poem?.lines ?? []).map((line) => ({
      snippet_id: line.snippetId,
      message_ordinal: line.messageOrdinal,
      sender: line.sender,
      date: line.date,
      text: line.text,
      note: line.note,
      callbacks: line.callbacks,
    })),
  };
}

function metricsCsv(groups: GroupMetrics[]): string {
  const header = [
    'group',
    'poems',
    'completed',
    'verification_rate',
    'timeline_coverage',
    'sender_balance',
    'note_callbacks',
    'completed_only_verification_rate',
    'completed_only_timeline_coverage',
    'completed_only_sender_balance',
    'completed_only_note_callbacks',
    'mean_lines',
    'cost_usd',
  ];
  const rows = groups.map((group) =>
    [
      group.condition,
      group.attempted,
      group.completed,
      round(group.verificationRate, 4),
      round(group.timelineCoverage, 4),
      round(group.senderBalance, 4),
      round(group.noteCallbacks, 4),
      ...(group.completedOnly
        ? [group.completedOnly.verificationRate, group.completedOnly.timelineCoverage, group.completedOnly.senderBalance, group.completedOnly.noteCallbacks].map((v) => round(v, 4))
        : ['', '', '', '']),
      round(group.meanLines, 2),
      round(group.costUsd, 4),
    ].join(','),
  );
  return `${[header.join(','), ...rows].join('\n')}\n`;
}

function readme(groups: GroupMetrics[], traces: Trace[]): string {
  const values: Record<string, string> = {
    RESULTS_TABLE: resultsTable(groups, (group) => group, true),
    COMPLETED_ONLY_TABLE: resultsTable(groups, (group) => group.completedOnly, false),
    RUN_SUMMARY: runSummary(groups, traces),
  };
  return readFileSync(README_TEMPLATE, 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}

const percent = (value: number) => `${(value * 100).toFixed(0)}%`;

function resultsTable(groups: GroupMetrics[], pick: (group: GroupMetrics) => MetricMeans | null, withCounts: boolean): string {
  const rows = groups.map((group) => {
    const means = pick(group);
    const cells = means
      ? [percent(means.verificationRate), percent(means.timelineCoverage), means.senderBalance.toFixed(2), means.noteCallbacks.toFixed(1)]
      : ['n/a', 'n/a', 'n/a', 'n/a'];
    const counts = withCounts ? [`${group.completed} of ${group.attempted}`] : [`${group.completed}`];
    return `| ${[GROUP_LABELS[group.condition], ...counts, ...cells].join(' | ')} |`;
  });
  const head = withCounts ? 'Poems completed' : 'Poems';
  return [
    `| Group | ${head} | Verification rate | Timeline coverage | Sender balance | Note callbacks per Poem |`,
    '|---|---:|---:|---:|---:|---:|',
    ...rows,
  ].join('\n');
}

function runSummary(groups: GroupMetrics[], traces: Trace[]): string {
  const attempted = groups.reduce((sum, group) => sum + group.attempted, 0);
  const failed = groups.reduce((sum, group) => sum + group.failed, 0);
  const attempts = traces.flatMap((trace) => trace.attempts);
  const total = traces.reduce((sum, trace) => sum + trace.costUsd, 0);
  const estimated = attempts.filter((attempt) => attempt.costKind === 'estimate').reduce((sum, attempt) => sum + attempt.costUsd, 0);

  // A Poem the run stopped on (spend cap) is attempted but not failed: its retries never ran out.
  const stopped = traces.filter((trace) => trace.status === 'pending').length;
  const short = groups.filter((group) => group.attempted < PLANNED_POEMS_PER_GROUP);
  const lines = [
    `- Poems: ${attempted} attempted, ${attempted - failed} completed, ${failed - stopped} failed after all retries` +
      (stopped > 0 ? `, ${stopped} stopped by the spend cap before its retries ran out (its failed calls are counted below).` : '.'),
    ...(short.length > 0
      ? [
          `- Fewer than planned: ${short.map((group) => `${GROUP_LABELS[group.condition]} ${group.attempted} of ${PLANNED_POEMS_PER_GROUP} attempted`).join('; ')}. ` +
            `The rest were never started, and this dataset does not count them.`,
        ]
      : []),
    `- Beam calls: ${attempts.length}, of which ${attempts.filter((attempt) => attempt.error).length} failed (each Poem is retried at most twice).`,
    `- Estimated spend: $${total.toFixed(2)} (reported tokens x the router's prices of $0.40/M input and $1.20/M output${estimated > 0 ? `; $${estimated.toFixed(2)} of it is an upper-bound estimate for failed calls whose token counts never came back` : ''}).`,
  ];
  const billed = bestEstimateOfSpend(traces);
  if (billed !== null) {
    lines.push(
      `- About $${billed.toFixed(2)} was billed by our best estimate: calls that reported no tokens are priced at the prompt size Beam reported for the same group, ` +
        `with the whole ${MAX_COMPLETION_TOKENS.toLocaleString('en-US')}-token completion budget spent if the answer was truncated (a dropped connection is priced at its input only).`,
    );
  }
  for (const condition of ['full', 'last10'] as const) {
    const done = traces.filter((trace) => trace.condition === condition && trace.status === 'ok');
    if (done.length === 0) continue;
    const mean = (value: (trace: Trace) => number) => done.reduce((sum, trace) => sum + value(trace), 0) / done.length;
    const final = (trace: Trace) => trace.attempts[trace.attempts.length - 1];
    const calls = traces.filter((trace) => trace.condition === condition).flatMap((trace) => trace.attempts);
    lines.push(
      `- ${GROUP_LABELS[condition]}: ${calls.length} calls; ${callOutcomes(calls)}. ` +
        `A Poem that completed used about ${Math.round(mean((trace) => final(trace)?.usage?.promptTokens ?? 0) / 1000)}k prompt tokens and ` +
        `${Math.round(mean((trace) => final(trace)?.usage?.completionTokens ?? 0) / 1000)}k completion tokens ` +
        `(${Math.round(mean((trace) => final(trace)?.usage?.reasoningTokens ?? 0) / 1000)}k of them reasoning) on average, in ` +
        `${Math.round(mean((trace) => final(trace)?.seconds ?? 0))} s for the final call.`,
    );
  }
  return lines.join('\n');
}

const FAILURE_LABELS: Record<string, string> = {
  truncated: 'truncated (out of completion budget)',
  'wrong-size': 'returned the wrong number of Lines',
  'invalid-response': 'gave a malformed or empty answer',
  stopped: 'stopped mid-answer',
  http: 'failed with a gateway or HTTP error',
  network: 'lost the connection',
};

/** "Beam returned 17 Lines; a Poem needs 8 to 14. Try again." -> the count and the range it missed. */
function sizeMiss(attempt: Attempt): { returned: number; min: number; max: number } | null {
  const match = /returned (\d+) Lines?; a Poem needs (\d+) to (\d+)/.exec(attempt.error?.message ?? '');
  return match ? { returned: Number(match[1]), min: Number(match[2]), max: Number(match[3]) } : null;
}

/** How a group's calls ended: how many gave a usable Poem, and every kind of failure, counted. */
function callOutcomes(calls: Attempt[]): string {
  const usable = calls.filter((call) => !call.error).length;
  const parts = [`${usable} came back as a usable Poem (${percent(usable / calls.length)})`];
  for (const [reason, label] of Object.entries(FAILURE_LABELS)) {
    const failed = calls.filter((call) => call.error?.reason === reason);
    if (failed.length === 0) continue;
    let detail = '';
    if (reason === 'wrong-size') {
      const misses = failed.flatMap((call) => sizeMiss(call) ?? []);
      const over = misses.filter((miss) => miss.returned > miss.max).map((miss) => miss.returned);
      const under = misses.filter((miss) => miss.returned < miss.min).length;
      const range = over.length === 0 ? '' : Math.min(...over) === Math.max(...over) ? `: ${over[0]} Lines` : `: ${Math.min(...over)} to ${Math.max(...over)} Lines`;
      detail = ` (${over.length} too many${range}, ${under} too few)`;
    }
    parts.push(`${failed.length} ${label}${detail}`);
  }
  return parts.join(', ');
}

/**
 * What the run likely cost: usage-priced calls as recorded, and each call that reported
 * no tokens priced at the prompt size Beam reported for its group. Null when every call
 * reported tokens, or a group has no call to take the prompt size from.
 */
function bestEstimateOfSpend(traces: Trace[]): number | null {
  const promptTokens = new Map<Condition, number>();
  for (const condition of ['full', 'last10'] as const) {
    const reported = traces.filter((trace) => trace.condition === condition).flatMap((trace) => trace.attempts.flatMap((attempt) => (attempt.usage ? [attempt.usage.promptTokens] : [])));
    if (reported.length > 0) promptTokens.set(condition, reported.reduce((sum, tokens) => sum + tokens, 0) / reported.length);
  }

  let total = 0;
  let repriced = 0;
  for (const trace of traces) {
    for (const attempt of trace.attempts) {
      const reference = promptTokens.get(trace.condition);
      if (attempt.costKind === 'usage' || reference === undefined) {
        total += attempt.costUsd;
        continue;
      }
      repriced++;
      total += costOf(reference, attempt.error?.reason === 'truncated' ? MAX_COMPLETION_TOKENS : 0);
    }
  }
  return repriced === 0 ? null : total;
}

/**
 * Throws if `secret` appears in any file under `dir`. The message names the file, never
 * the secret.
 */
export function assertNoSecret(dir: string, secret: string): void {
  if (secret.length < 8) return;
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (readFileSync(path, 'utf8').includes(secret)) {
        throw new Error(`A secret was found in ${relative(dir, path)}. Refusing to continue.`);
      }
    }
  };
  walk(dir);
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
