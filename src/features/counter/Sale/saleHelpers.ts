import { env } from '@/config/env';

import { formatMoney } from '@shared/money';

import type { CartLine } from '@/store/posCartSlice';
import type { ProductPayload } from '@shared/types';

export const money = (minor: number) => formatMoney(minor, { symbol: env.currencySymbol });

/** A product (and optional variant) as a new cart line. */
export function lineFromProduct(
  p: Pick<ProductPayload, 'id' | 'name' | 'sku' | 'baseUom' | 'packs' | 'trackingMode'>,
  opts: {
    variantId?: string | null;
    variantLabel?: string | null;
    uomCode?: string;
    qty?: number;
  } = {},
): Omit<CartLine, 'key' | 'serials' | 'lotNo' | 'lineDiscountMinor'> {
  return {
    productId: p.id,
    name: p.name,
    sku: p.sku,
    baseUom: p.baseUom,
    packs: p.packs.map((x) => ({ code: x.code, factor: x.factor })),
    trackingMode: p.trackingMode,
    variantId: opts.variantId ?? null,
    variantLabel: opts.variantLabel ?? null,
    // A serialised line is counted in base units — one serial each.
    uomCode: p.trackingMode === 'SERIAL' ? p.baseUom : (opts.uomCode ?? p.baseUom),
    qty: opts.qty ?? 1,
  };
}

/** `5*FRM-001` → qty 5 of `FRM-001`; anything else → qty 1. The till's quantity prefix. */
export function parseEntry(raw: string): { qty: number; text: string } {
  const m = /^(\d{1,5})\s*\*\s*(.+)$/.exec(raw.trim());
  return m
    ? { qty: Math.max(1, Number(m[1])), text: m[2]!.trim() }
    : { qty: 1, text: raw.trim() };
}

// ─── Quick keys ─────────────────────────────────────────────────────────────────────────

/** A pinned product, stored whole so the key works without a lookup. Per browser: it is a till. */
export type QuickKey = Pick<
  ProductPayload,
  'id' | 'name' | 'sku' | 'baseUom' | 'packs' | 'trackingMode' | 'hasVariants'
>;

const QUICK_KEYS = 'pos-wholesale.quickKeys';
export const MAX_QUICK_KEYS = 9;

export function loadQuickKeys(): QuickKey[] {
  try {
    return (JSON.parse(localStorage.getItem(QUICK_KEYS) ?? '[]') as QuickKey[]).slice(
      0,
      MAX_QUICK_KEYS,
    );
  } catch {
    return [];
  }
}

export function saveQuickKeys(keys: QuickKey[]): void {
  try {
    localStorage.setItem(QUICK_KEYS, JSON.stringify(keys.slice(0, MAX_QUICK_KEYS)));
  } catch {
    // Not persisted in a private window — the panel still works for the session.
  }
}

/** Every till shortcut, for the F1 sheet. */
export const SHORTCUTS: [string, string][] = [
  ['F2 or /', 'Focus the scan box'],
  ['Enter', 'Add the scanned or highlighted item'],
  ['5*code', 'Add five of it'],
  ['↑ ↓ (box empty)', 'Choose a cart line'],
  ['+ / − (box empty)', 'Change its quantity'],
  ['Delete (box empty)', 'Remove it'],
  ['F3', 'Scan serials / choose lot for the chosen line'],
  ['F4', 'Customer'],
  ['Alt+1…9', 'Quick keys'],
  ['F8', 'Park the sale'],
  ['F9', 'Resume a parked sale'],
  ['F10 or Ctrl+Enter', 'Pay'],
  ['P / A (sale done)', 'Print the receipt / the A4 invoice'],
  ['Esc', 'Close a dialog / clear the box'],
];
