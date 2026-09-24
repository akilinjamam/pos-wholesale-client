import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, with later Tailwind utilities winning over earlier conflicting ones.
 * The shadcn/ui convention — every component takes a `className` and merges it through here.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Enum values that are initialisms or trade codes, not words.
 *
 * Title-casing these produces "Cr39" and "Sv" in a dropdown, which reads as a typo to anyone
 * who works with lenses. A short explicit list rather than a heuristic: every length or
 * digit-based rule that keeps `SV` also mangles `MEN` and `PAIR`, and the vocabulary is small
 * and known. Add to it when an enum gains a code rather than a word.
 */
const ACRONYMS = new Set([
  'CR39',
  'PC',
  'MR8',
  'SV',
  'UC',
  'HC',
  'HMC',
  'TR90',
  'PCS',
  'ML',
  'UV',
  'HS',
  'MRP',
  'SKU',
]);

/**
 * A SCREAMING_SNAKE enum value as English: `CAT_EYE` → `Cat eye`, `CR39` → `CR39`.
 *
 * The server's enums are the vocabulary for statuses, product types and attribute values, and
 * they surface in pills, dropdowns and table cells across the app. One implementation, so a
 * value does not read differently depending on which screen shows it.
 */
export function humanise(value: string): string {
  if (ACRONYMS.has(value)) return value;

  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
