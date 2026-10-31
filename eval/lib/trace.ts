// Traces: one JSON file per Poem, written as soon as that Poem is finished, so a
// run can be resumed and the published dataset can show exactly what happened.
//
// A trace holds raw facts only (what Beam answered, what it cost, which Lines came
// out). Metrics are computed from traces afterwards, so a metric can be fixed without
// paying for the Poems again. Nothing here ever holds a token or a request header.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BeamUsage, Occasion } from '../../src';

export const CONDITIONS = ['full', 'last10', 'random'] as const;
/** `full`: Beam reads the whole Conversation. `last10`: Beam reads only the last 10% of Messages. `random`: random Snippets, no Beam. */
export type Condition = (typeof CONDITIONS)[number];

export interface TraceLine {
  /** Relative to what Beam was shown: for `last10`, `s0` is the first Snippet of the last 10%. */
  snippetId: string;
  /** The Message's position in the full Conversation. */
  messageOrdinal: number;
  sender: string;
  date: string;
  approximate: boolean;
  dateLabel: string;
  text: string;
  note: string | null;
  callbacks: string[];
}

export interface TraceError {
  reason: string;
  message: string;
}

/** One Beam call (a Poem may need up to 3: the first try and two retries). */
export interface Attempt {
  seconds: number;
  costUsd: number;
  /** `usage`: priced from the token counts Beam reported. `estimate`: no counts came back, so priced from the prompt size (an upper bound). */
  costKind: 'usage' | 'estimate';
  usage?: BeamUsage;
  finishReason?: string | null;
  /** Why this attempt did not produce a Poem. */
  error?: TraceError;
}

export interface Trace {
  condition: Condition;
  index: number;
  occasion: Occasion;
  giver: string;
  recipient: string;
  startedAt: string;
  seconds: number;
  status: 'ok' | 'failed';
  /** How much of the Conversation Beam was shown. */
  messagesRead: number;
  snippetsRead: number;
  attempts: Attempt[];
  /** Estimated spend over all attempts (usage tokens x router prices). */
  costUsd: number;
  /** Beam's final answer (its JSON of Snippet IDs and Notes), kept for audit. Null for random Poems and failures. */
  answer: string | null;
  error?: TraceError;
  poem?: { verified: boolean; lines: TraceLine[] };
}

export function traceFileName(condition: Condition, index: number): string {
  return `${condition}-${String(index).padStart(2, '0')}.json`;
}

export function writeTrace(dir: string, trace: Trace): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, traceFileName(trace.condition, trace.index)), `${JSON.stringify(trace, null, 2)}\n`);
}

/** The trace for this Poem if one was finished earlier; null when absent or unreadable. */
export function readTrace(dir: string, condition: Condition, index: number): Trace | null {
  const path = join(dir, traceFileName(condition, index));
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Trace;
  } catch {
    return null;
  }
}

export function removeTrace(dir: string, condition: Condition, index: number): void {
  rmSync(join(dir, traceFileName(condition, index)), { force: true });
}

/** Every trace in the directory, ordered by condition then index. */
export function readAllTraces(dir: string): Trace[] {
  if (!existsSync(dir)) return [];
  const rank = (condition: Condition) => CONDITIONS.indexOf(condition);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Trace)
    .sort((a, b) => rank(a.condition) - rank(b.condition) || a.index - b.index);
}
