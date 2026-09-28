import type { ProductPayload } from '@shared/types';

/**
 * The line-grid's draft shape and its conversions — kept apart from the component so the editor
 * file exports only components (fast refresh), and so documents can build lines without it.
 */

export interface LineDraft {
  key: number;
  product: ProductPayload | null;
  variantId: string;
  uomCode: string;
  qty: string;
  lotNo: string;
  expiryDate: string;
  mfgDate: string;
  serialsText: string;
}

let nextKey = 1;
export const emptyLine = (): LineDraft => ({
  key: nextKey++,
  product: null,
  variantId: '',
  uomCode: '',
  qty: '',
  lotNo: '',
  expiryDate: '',
  mfgDate: '',
  serialsText: '',
});

/** Serials as typed — one per line, or comma-separated — trimmed, upper-cased, blanks dropped. */
export const parseSerials = (text: string) =>
  text
    .split(/[\n,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

/** Drafts → the API's line shape. Rows without a product are dropped; the server checks the rest. */
export function toLineInputs(lines: LineDraft[]) {
  return lines
    .filter((l) => l.product)
    .map((l) => ({
      productId: l.product!.id,
      variantId: l.variantId || null,
      uomCode: l.uomCode || null,
      qty: Number(l.qty),
      ...(l.product!.trackingMode === 'LOT'
        ? {
            lotNo: l.lotNo.trim() || null,
            expiryDate: l.expiryDate || null,
            mfgDate: l.mfgDate || null,
          }
        : {}),
      ...(l.product!.trackingMode === 'SERIAL' ? { serials: parseSerials(l.serialsText) } : {}),
    }));
}
