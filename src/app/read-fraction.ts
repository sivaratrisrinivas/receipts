// What the Giver is told when Beam did not read the whole Conversation. Pure: the
// ReadFraction goes in, the sentence (or nothing) comes out.

import type { ReadFraction } from '../selection';

const DAY_MS = 86_400_000;
const AVERAGE_YEAR_DAYS = 365.25;
const AVERAGE_MONTH_DAYS = 30.44;

/**
 * `Beam read every 2nd day across the 9 years.`, or null when Beam read every day and
 * there is nothing to say.
 */
export function readFractionMessage(fraction: ReadFraction): string | null {
  if (fraction.stride <= 1) return null;
  return `Beam read every ${ordinal(fraction.stride)} day across ${stretchOfTime(fraction)}.`;
}

/** 2 -> `2nd`, 11 -> `11th`, 21 -> `21st`, 103 -> `103rd`. */
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** The time the Conversation covers, in the largest unit that reads naturally: `the 9 years`, `the 20 months`, `the 45 days`. */
function stretchOfTime({ firstDate, lastDate }: ReadFraction): string {
  const days = Math.round((Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / DAY_MS);
  if (days >= 2 * AVERAGE_YEAR_DAYS) return `the ${Math.round(days / AVERAGE_YEAR_DAYS)} years`;
  if (days >= 2 * AVERAGE_MONTH_DAYS) return `the ${Math.round(days / AVERAGE_MONTH_DAYS)} months`;
  return `the ${days} days`;
}
