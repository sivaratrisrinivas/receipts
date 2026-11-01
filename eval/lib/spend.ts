// Spend: what a Beam call costs, at the Hugging Face router's published prices for
// reflection/Beam-1.0-501B-A23B (provider Baseten, GET router.huggingface.co/v1/models),
// and the hard cap that stops a run before it can overspend.

import type { BeamRequest, BeamUsage } from '../../src';

export const USD_PER_MILLION_INPUT_TOKENS = 0.4;
export const USD_PER_MILLION_OUTPUT_TOKENS = 1.2;

/** The completion budget sent with every Beam call (the adapter's setting); a truncated call spends all of it. */
export const MAX_COMPLETION_TOKENS = 60_000;

/** The run aborts rather than start a call that could take estimated spending past this. */
export const DEFAULT_SPEND_CAP_USD = 8;

/**
 * Prompt characters per token, deliberately low so estimates run high. The Gallery
 * prompt measured 3.5 (1,245,565 characters, 352,297 tokens in the dry run).
 */
const CHARS_PER_TOKEN = 3;

/** Completion tokens already include the reasoning tokens. */
export function costOfUsage(usage: Pick<BeamUsage, 'promptTokens' | 'completionTokens'>): number {
  return costOf(usage.promptTokens, usage.completionTokens);
}

/** An upper-bound price for a call whose token counts never came back. */
export function estimateCost(request: BeamRequest, outputTokens: number): number {
  const promptTokens = Math.ceil((request.system.length + request.user.length) / CHARS_PER_TOKEN);
  return costOf(promptTokens, outputTokens);
}

export function costOf(inputTokens: number, outputTokens: number): number {
  return (inputTokens * USD_PER_MILLION_INPUT_TOKENS + outputTokens * USD_PER_MILLION_OUTPUT_TOKENS) / 1_000_000;
}

export class SpendCapExceeded extends Error {
  constructor(spentUsd: number, nextCallUsd: number, capUsd: number) {
    super(
      `Stopping: spent about $${spentUsd.toFixed(2)} and the next call could cost up to $${nextCallUsd.toFixed(2)}, ` +
        `which would pass the $${capUsd.toFixed(2)} cap. Finished Poems are kept; rerun to resume.`,
    );
    this.name = 'SpendCapExceeded';
  }
}

/** Running total of estimated spend for one run, starting from what earlier runs already spent. */
export class SpendLedger {
  readonly capUsd: number;
  private spent: number;

  constructor(capUsd: number, alreadySpentUsd = 0) {
    this.capUsd = capUsd;
    this.spent = alreadySpentUsd;
  }

  get spentUsd(): number {
    return this.spent;
  }

  charge(usd: number): void {
    this.spent += usd;
  }

  /** Throws unless a call costing up to `worstCaseUsd` still fits under the cap. */
  assertRoomFor(worstCaseUsd: number): void {
    if (this.spent + worstCaseUsd > this.capUsd) throw new SpendCapExceeded(this.spent, worstCaseUsd, this.capUsd);
  }
}
