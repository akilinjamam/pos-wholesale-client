import { deleteData, getPage, patchData, postData } from '@/api/client';

import type {
  BulkAdjustInput,
  CreatePriceEntryInput,
  CreatePriceTierInput,
  PriceImportInput,
  UpdatePriceEntryInput,
  UpdatePriceTierInput,
} from '@shared/pricing';
import type {
  BulkAdjustResult,
  Paginated,
  PriceEntryPayload,
  PriceImportResult,
  PriceTierPayload,
} from '@shared/types';

// ─── Tiers ──────────────────────────────────────────────────────────────────────────────

export type ListPriceTiersParams = {
  page?: number;
  limit?: number;
  q?: string;
  isActive?: boolean;
};

export function listPriceTiers(
  params: ListPriceTiersParams = {},
): Promise<Paginated<PriceTierPayload>> {
  return getPage<PriceTierPayload>('/price-tiers', params);
}

export function createPriceTier(body: CreatePriceTierInput): Promise<PriceTierPayload> {
  return postData<PriceTierPayload>('/price-tiers', body);
}

export function updatePriceTier(
  id: string,
  body: UpdatePriceTierInput,
): Promise<PriceTierPayload> {
  return patchData<PriceTierPayload>(`/price-tiers/${id}`, body);
}

/** Refused while any dealer or price uses the tier, and always for the counter's tier. */
export function deletePriceTier(id: string): Promise<void> {
  return deleteData<void>(`/price-tiers/${id}`);
}

// ─── Entries ────────────────────────────────────────────────────────────────────────────

export type ListPriceEntriesParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  // Nullable so a `PriceScope` spreads straight in; axios drops null params from the query.
  tierId?: string | null;
  partyId?: string | null;
  productId?: string;
  variantId?: string;
  uomCode?: string;
  isActive?: boolean;
  /** `YYYY-MM-DD` — only entries in force that day. */
  activeOn?: string;
};

export function listPriceEntries(
  params: ListPriceEntriesParams,
): Promise<Paginated<PriceEntryPayload>> {
  return getPage<PriceEntryPayload>('/price-lists', params);
}

export function createPriceEntry(body: CreatePriceEntryInput): Promise<PriceEntryPayload> {
  return postData<PriceEntryPayload>('/price-lists', body);
}

export function updatePriceEntry(
  id: string,
  body: UpdatePriceEntryInput,
): Promise<PriceEntryPayload> {
  return patchData<PriceEntryPayload>(`/price-lists/${id}`, body);
}

export function deletePriceEntry(id: string): Promise<void> {
  return deleteData<void>(`/price-lists/${id}`);
}

/** `dryRun: true` validates and reports per row; `false` writes every valid row. */
export function importPriceEntries(body: PriceImportInput): Promise<PriceImportResult> {
  return postData<PriceImportResult>('/price-lists/import', body);
}

/** `dryRun: true` previews what would change; `false` applies it. */
export function bulkAdjustPrices(body: BulkAdjustInput): Promise<BulkAdjustResult> {
  return postData<BulkAdjustResult>('/price-lists/bulk-adjust', body);
}
