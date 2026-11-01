// Generating the Gallery Poems: ask Beam for each Occasion's Poem, keep it only if it
// verifies fully and spans the timeline in both Senders' voices (./rules.ts), and keep
// count of the money spent. Pure over the Beam port, so a script can run it for real and a
// test can run it for nothing.

import { BeamError, type BeamPort, type BeamUsage } from '../beam/port';
import { tokensCostUsd } from '../beam/pricing';
import type { Occasion } from '../domain';
import { makePoem } from '../pipeline';
import { readConversation, type RawSource } from '../sources';
import { GALLERY_PEOPLE } from '../sources/gallery';
import { snippetsOf } from '../snippets';
import { fingerprintOf, type GalleryFingerprint, type GalleryPick, type GalleryPicks } from './picks';
import { checkGalleryPoem } from './rules';

/** At most this many calls to Beam for any one Occasion. */
export const MAX_ATTEMPTS_PER_OCCASION = 3;

export interface Budget {
  /** No call is made that could take the estimated spend past this. */
  limitUsd: number;
  /** What a call is assumed to cost when Beam did not report its tokens (it failed, or ran out of room). */
  perCallUsd: number;
}

/** The authorised budget: $3, at about $0.20 a Gallery call. */
export const DEFAULT_BUDGET: Budget = { limitUsd: 3, perCallUsd: 0.2 };

/** What a call cost, from the tokens Beam reported. */
export function costOf(usage: BeamUsage): number {
  return tokensCostUsd(usage.promptTokens, usage.completionTokens);
}

export interface Attempt {
  /**
   * `accepted`: the Poem was whole. `rejected`: Beam answered, but not well enough.
   * `failed`: no usable answer (it ran out of room, or the call did not go through).
   */
  outcome: 'accepted' | 'rejected' | 'failed';
  /** Why it was not accepted; empty when accepted. */
  problems: string[];
  /** Estimated cost of this call. */
  costUsd: number;
  /** The Poem's picks when accepted. */
  picks?: GalleryPick[];
}

export interface OccasionReport {
  occasion: Occasion;
  accepted: boolean;
  /** Empty when the run stopped before this Occasion was tried. */
  attempts: Attempt[];
}

export interface GenerationReport {
  gallery: GalleryFingerprint;
  /** The picks of every Occasion that was accepted. */
  picks: GalleryPicks['poems'];
  /** Every requested Occasion, in order, with the attempts made for it. */
  occasions: OccasionReport[];
  /** Estimated total spend. */
  spentUsd: number;
  /** Why the run stopped early (out of credits, signed out, spending cap), or null if it ran through. */
  stopped: string | null;
}

export interface GenerateOptions {
  /** The Gallery's Gutenberg texts. */
  texts: readonly string[];
  beam: BeamPort;
  occasions: readonly Occasion[];
  budget?: Budget;
  maxAttempts?: number;
  /** Called after each call to Beam, with the running estimate of spend. */
  onAttempt?: (occasion: Occasion, attemptNumber: number, attempt: Attempt, spentUsd: number) => void;
}

export async function generateGalleryPicks(options: GenerateOptions): Promise<GenerationReport> {
  const { texts, beam, occasions, budget = DEFAULT_BUDGET, maxAttempts = MAX_ATTEMPTS_PER_OCCASION } = options;
  const source: RawSource = { kind: 'gallery', texts: [...texts] };
  const conversation = readConversation(source);

  const report: GenerationReport = {
    gallery: fingerprintOf(snippetsOf(conversation)),
    picks: {},
    occasions: occasions.map((occasion) => ({ occasion, accepted: false, attempts: [] })),
    spentUsd: 0,
    stopped: null,
  };

  // What the last call to Beam reported it used, if it got that far.
  let usage: BeamUsage | undefined;
  const measured: BeamPort = {
    async complete(request, onProgress) {
      const completion = await beam.complete(request, onProgress);
      usage = completion.usage;
      return completion;
    },
  };

  for (const occasionReport of report.occasions) {
    const { occasion } = occasionReport;
    for (let number = 1; number <= maxAttempts && report.stopped === null; number++) {
      // The small allowance is for floating-point error: fifteen calls of $0.20 are exactly $3.
      if (report.spentUsd + budget.perCallUsd > budget.limitUsd + 1e-9) {
        report.stopped = `Stopped: the estimated spend is $${report.spentUsd.toFixed(2)}, and another call (about $${budget.perCallUsd.toFixed(2)}) could pass the $${budget.limitUsd.toFixed(2)} limit.`;
        break;
      }

      usage = undefined;
      const attempt: Attempt = { outcome: 'failed', problems: [], costUsd: 0 };
      try {
        const { poem } = await makePoem({ source, occasion, ...GALLERY_PEOPLE }, measured);
        attempt.problems = checkGalleryPoem(poem, conversation);
        if (attempt.problems.length === 0) {
          attempt.outcome = 'accepted';
          attempt.picks = poem.lines.map((line) => ({ id: line.snippetId, note: line.note ?? '', callbacks: line.callbacks }));
        } else {
          attempt.outcome = 'rejected';
        }
      } catch (error) {
        if (!(error instanceof BeamError)) throw error;
        attempt.problems = [error.message];
        // A retry cannot fix being out of credits or signed out.
        if (!error.retryable) report.stopped = `Stopped: ${error.message}`;
      }
      // Beam answered with an unusable Poem still costs what it used; a call that left no usage costs the estimate.
      attempt.costUsd = usage ? costOf(usage) : budget.perCallUsd;
      report.spentUsd += attempt.costUsd;

      occasionReport.attempts.push(attempt);
      options.onAttempt?.(occasion, number, attempt, report.spentUsd);

      if (attempt.outcome === 'accepted') {
        occasionReport.accepted = true;
        report.picks[occasion] = attempt.picks!;
        break;
      }
    }
  }
  return report;
}
