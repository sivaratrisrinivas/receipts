import type { IsoDate } from './domain';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** `1845-01-13` -> `13 January 1845`. */
export function formatDate(date: IsoDate): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTH_NAMES[(month ?? 1) - 1]} ${year}`;
}

/** `13 January 1845`, or `c. 13 January 1845` when the date is only an estimate. */
export function formatDateLabel(date: IsoDate, approximate: boolean): string {
  return `${approximate ? 'c. ' : ''}${formatDate(date)}`;
}
