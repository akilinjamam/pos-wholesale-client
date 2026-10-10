import type { InvoicePayload } from '@shared/types';

const DAY = 86_400_000;

/** Days past due today, or null when not due yet or nothing is owed. */
export function daysOverdue(i: InvoicePayload): number | null {
  if (!i.dueDate || i.balanceMinor <= 0) return null;
  const d = Math.floor((Date.now() - new Date(i.dueDate).getTime()) / DAY);
  return d > 0 ? d : null;
}
