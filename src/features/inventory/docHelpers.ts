import { fieldErrors } from '@/api/client';
import { getProduct } from '@/api/endpoints/products';

import { emptyLine } from './stockLines';

import type { LineDraft } from './stockLines';
import type { StockDocLinePayload } from '@shared/types';

/**
 * Re-open a saved draft's lines for editing. The editor needs each line's full product — its
 * units, variants and tracking mode — so they are loaded once, in parallel, before it opens.
 */
export async function draftsFromLines(lines: StockDocLinePayload[]): Promise<LineDraft[]> {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = new Map(
    (await Promise.all(ids.map((id) => getProduct(id)))).map((p) => [p.id, p]),
  );
  return lines.map((l) => ({
    ...emptyLine(),
    product: products.get(l.productId) ?? null,
    variantId: l.variantId ?? '',
    uomCode: l.uomCode,
    qty: String(l.qty),
    lotNo: l.lotNo ?? '',
    expiryDate: l.expiryDate ?? '',
    serialsText: l.serials.join('\n'),
  }));
}

/** A 422's field errors as a path → message map, for forms that are not react-hook-form. */
export function errorMap(error: unknown): Record<string, string> {
  return Object.fromEntries(fieldErrors(error).map((f) => [f.path, f.message]));
}
