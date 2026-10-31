// Spend: what a Beam call costs, at the Hugging Face router's published prices for
// reflection/Beam-1.0-501B-A23B (provider Baseten, GET router.huggingface.co/v1/models).

import type { BeamUsage } from '../../src';

export const USD_PER_MILLION_INPUT_TOKENS = 0.4;
export const USD_PER_MILLION_OUTPUT_TOKENS = 1.2;

/** Completion tokens already include the reasoning tokens. */
export function costOfUsage(usage: Pick<BeamUsage, 'promptTokens' | 'completionTokens'>): number {
  return (
    (usage.promptTokens * USD_PER_MILLION_INPUT_TOKENS + usage.completionTokens * USD_PER_MILLION_OUTPUT_TOKENS) /
    1_000_000
  );
}
