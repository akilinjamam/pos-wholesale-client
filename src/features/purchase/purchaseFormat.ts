import { env } from '@/config/env';

import { formatMoney, fromMinor, toMinor } from '@shared/money';

import type { StatusTone } from '@/components/common/StatusPill';
import type { GrnStatus, PoStatus } from '@shared/enums';

/** Shared by the purchase screens (Day 34). */

export const money = (minor: number | null | undefined) =>
  minor == null ? '—' : formatMoney(minor, { symbol: env.currencySymbol });

/** A typed money field: '' is "let the server decide", anything else is major units. */
export const minorFromInput = (text: string): number | undefined =>
  text.trim() === '' || !Number.isFinite(Number(text)) ? undefined : toMinor(Number(text));
export const inputFromMinor = (minor: number | null | undefined) =>
  minor == null ? '' : String(fromMinor(minor));

export const PO_TONE: Record<PoStatus, StatusTone> = {
  DRAFT: 'neutral',
  APPROVED: 'info',
  SENT: 'info',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  SHORT_CLOSED: 'neutral',
  CANCELLED: 'danger',
};

export const GRN_TONE: Record<GrnStatus, StatusTone> = {
  DRAFT: 'neutral',
  POSTED: 'success',
  CANCELLED: 'danger',
};

/** Base units as the buyer counts them: `26` → `2 DOZ + 2` when the product packs in dozens. */
export function inPacks(
  qtyBase: number,
  product: { baseUom: string; packs?: { code: string; factor: number }[] },
): string {
  const pack = [...(product.packs ?? [])].sort((a, b) => b.factor - a.factor)[0];
  if (!pack || qtyBase < pack.factor) return `${qtyBase.toLocaleString()} ${product.baseUom}`;
  const whole = Math.floor(qtyBase / pack.factor);
  const rest = qtyBase % pack.factor;
  return `${whole.toLocaleString()} ${pack.code}${rest ? ` + ${rest}` : ''}`;
}

/** Today on this machine's calendar — not UTC's, which is still yesterday before 6 a.m. in Dhaka. */
export function todayDay(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
