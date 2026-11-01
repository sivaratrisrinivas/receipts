// What a call to Beam costs: the Hugging Face router's published prices for
// reflection/Beam-1.0-501B-A23B (provider Baseten, GET router.huggingface.co/v1/models).

export const USD_PER_MILLION_INPUT_TOKENS = 0.4;
export const USD_PER_MILLION_OUTPUT_TOKENS = 1.2;

/** Dollars for a call of this size. Completion tokens already include the reasoning tokens. */
export function tokensCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * USD_PER_MILLION_INPUT_TOKENS + outputTokens * USD_PER_MILLION_OUTPUT_TOKENS) / 1_000_000;
}
