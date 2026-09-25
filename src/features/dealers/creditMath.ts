import { env } from '@/config/env';

import { formatMoney } from '@shared/money';

export const money = (minor: number) => formatMoney(minor, { symbol: env.currencySymbol });

/**
 * How much of the limit the balance uses, as a fraction. `null` for a cash-only dealer (limit
 * 0), where a ratio is meaningless — any balance at all is over.
 */
export function creditUsage(balanceMinor: number, limitMinor: number): number | null {
  if (limitMinor <= 0) return null;
  return Math.max(0, balanceMinor) / limitMinor;
}
