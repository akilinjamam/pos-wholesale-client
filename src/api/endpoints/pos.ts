import { api, deleteData, getData, getPage, postData } from '@/api/client';

import type {
  CloseSessionInput,
  HoldSaleInput,
  OpenSessionInput,
  PosQuoteInput,
  PosSaleInput,
} from '@shared/pos';
import type {
  BarcodeMatch,
  HeldSalePayload,
  LotPayload,
  PartyPayload,
  PosQuote,
  PosSaleResult,
  PosSessionPayload,
} from '@shared/types';

/** The counter's endpoints (Day 18) — plus the lookups the sale screen needs. */

export const getCurrentSession = () =>
  getData<PosSessionPayload | null>('/pos/sessions/current');
export const openSession = (body: OpenSessionInput) =>
  postData<PosSessionPayload>('/pos/sessions', body);
export const closeSession = (id: string, body: CloseSessionInput) =>
  postData<PosSessionPayload>(`/pos/sessions/${id}/close`, body);

/** Silent: the cart shows a quote failure inline, not as a toast on every keystroke. */
export const quoteCart = async (body: PosQuoteInput): Promise<PosQuote> => {
  const { data } = await api.post<{ data: PosQuote }>('/pos/quote', body, {
    _silent: true,
  } as never);
  return data.data;
};

export const postSale = (body: PosSaleInput) => postData<PosSaleResult>('/pos/sales', body);

export const listHeld = () => getData<HeldSalePayload[]>('/pos/held');
export const holdSale = (body: HoldSaleInput) => postData<HeldSalePayload>('/pos/held', body);
export const discardHeld = (id: string) => deleteData<void>(`/pos/held/${id}`);

/** What a scanned code means — a product, one of its packs, or a variant. 404 when unknown. */
export const lookupBarcode = (code: string) =>
  getData<BarcodeMatch>(`/barcodes/${encodeURIComponent(code)}`, undefined, { silent: true });

/** Lots of a product with stock — the lot picker for a lot-tracked line. */
export const lotsInStock = (productId: string) =>
  getPage<LotPayload>('/lots', { productId, inStock: true, limit: 50 }).then((p) => p.items);

/** Counter customers and dealers, searched together — the till does not care which list. */
export async function searchCustomers(q: string): Promise<PartyPayload[]> {
  const [customers, dealers] = await Promise.all([
    getPage<PartyPayload>('/customers', { q, limit: 8, isActive: true }).catch(() => ({
      items: [] as PartyPayload[],
    })),
    getPage<PartyPayload>('/dealers', { q, limit: 8, isActive: true }).catch(() => ({
      items: [] as PartyPayload[],
    })),
  ]);
  const seen = new Set<string>();
  return [...dealers.items, ...customers.items].filter((p) =>
    seen.has(p.id) ? false : (seen.add(p.id), true),
  );
}
