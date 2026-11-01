// The four metrics, computed in code from traces (never by a model).
//
// - Verification rate: the share of a group's Poems that came out carrying the "every
//   line is real" badge, i.e. every Snippet ID Beam named resolved to a real Snippet. A
//   Poem that never arrived (all attempts failed) is not verified. Random-Snippet Poems
//   are real by construction, so their rate is 1 and only shows the baseline is sound.
// - Timeline coverage: split the full Conversation's date span into 10 equal buckets;
//   a Poem's coverage is the share of buckets holding at least one of its Lines. It is
//   always measured against the full Conversation, so Beam on the last 10% cannot reach
//   past the last bucket or two. (Ten buckets rather than the prompt's four quarters,
//   so a handful of random Lines does not score near 1 by luck.)
// - Sender balance: 1 means the Poem's Lines split evenly between the Conversation's
//   Senders, 0 means one Sender has every Line (2 x the smaller Sender's share, for two
//   Senders).
// - Note callback count: how many callbacks to other Snippets the Poem's Notes cite.
//   Only callbacks that verification kept count (a Note citing an unknown Snippet is
//   dropped), and random-Snippet Poems have no Notes.
//
// A group's numbers average over every Poem attempted, with a failed Poem scoring 0 on
// each metric, so failures cannot be hidden. The same means over only the Poems that
// completed are reported beside them.

import type { Conversation } from '../../src';
import { CONDITIONS, type Condition, type Trace } from './trace';

export const TIMELINE_BUCKETS = 10;

export interface PoemMetrics {
  verified: boolean;
  timelineCoverage: number;
  senderBalance: number;
  noteCallbacks: number;
}

export interface MetricMeans {
  verificationRate: number;
  timelineCoverage: number;
  senderBalance: number;
  noteCallbacks: number;
}

export interface GroupMetrics extends MetricMeans {
  condition: Condition;
  attempted: number;
  completed: number;
  failed: number;
  /** The same means over only the Poems that completed; null when none did. */
  completedOnly: MetricMeans | null;
  /** Mean number of Lines in the completed Poems. */
  meanLines: number;
  /** Estimated spend on the group, including failed attempts. */
  costUsd: number;
}

/** Metrics for one finished Poem; null when the Poem failed. */
export function poemMetrics(trace: Trace, conversation: Conversation): PoemMetrics | null {
  if (!trace.poem) return null;
  const { lines, verified } = trace.poem;

  const first = Date.parse(`${conversation.messages[0]?.date}T00:00:00Z`);
  const span = Date.parse(`${conversation.messages[conversation.messages.length - 1]?.date}T00:00:00Z`) - first;
  const bucketOf = (date: string) =>
    span <= 0 ? 0 : Math.min(TIMELINE_BUCKETS - 1, Math.floor((TIMELINE_BUCKETS * (Date.parse(`${date}T00:00:00Z`) - first)) / span));
  const covered = new Set(lines.map((line) => bucketOf(line.date)));

  const perSender = conversation.senders.map((sender) => lines.filter((line) => line.sender === sender).length);
  const senderBalance = lines.length === 0 ? 0 : (conversation.senders.length * Math.min(...perSender)) / lines.length;

  return {
    verified,
    timelineCoverage: covered.size / TIMELINE_BUCKETS,
    senderBalance,
    noteCallbacks: lines.reduce((sum, line) => sum + line.callbacks.length, 0),
  };
}

/** Per-group numbers, in the order full, last10, random; groups with no traces are left out. */
export function summarize(traces: Trace[], conversation: Conversation): GroupMetrics[] {
  return CONDITIONS.flatMap((condition) => {
    const group = traces.filter((trace) => trace.condition === condition);
    if (group.length === 0) return [];
    const scored = group.map((trace) => poemMetrics(trace, conversation));
    const completed = scored.filter((metrics): metrics is PoemMetrics => metrics !== null);

    return [
      {
        condition,
        attempted: group.length,
        completed: completed.length,
        failed: group.length - completed.length,
        ...means(completed, group.length),
        completedOnly: completed.length === 0 ? null : means(completed, completed.length),
        meanLines: mean(group.flatMap((trace) => (trace.poem ? [trace.poem.lines.length] : []))),
        costUsd: group.reduce((sum, trace) => sum + trace.costUsd, 0),
      },
    ];
  });
}

/** Means over `count` Poems, where Poems missing from `completed` count as 0. */
function means(completed: PoemMetrics[], count: number): MetricMeans {
  const total = (value: (metrics: PoemMetrics) => number) => completed.reduce((sum, metrics) => sum + value(metrics), 0) / count;
  return {
    verificationRate: total((metrics) => (metrics.verified ? 1 : 0)),
    timelineCoverage: total((metrics) => metrics.timelineCoverage),
    senderBalance: total((metrics) => metrics.senderBalance),
    noteCallbacks: total((metrics) => metrics.noteCallbacks),
  };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
