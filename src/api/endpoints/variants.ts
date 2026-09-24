import { deleteData, getPage, patchData, postData } from '@/api/client';

import type { Paginated, VariantPayload } from '@shared/types';
import type { VariantAxisValues } from '@shared/variant';

export type ListVariantsParams = {
  productId: string;
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  isActive?: boolean;
};

export function listVariants(params: ListVariantsParams): Promise<Paginated<VariantPayload>> {
  return getPage<VariantPayload>('/variants', params);
}

export interface CreateVariantBody {
  productId: string;
  axes: VariantAxisValues;
  sku?: string;
  barcode?: string | null;
  priceDeltaMinor?: number;
  isActive?: boolean;
}

/** Axes are the identity and cannot be edited — see the server's `updateVariantSchema`. */
export interface UpdateVariantBody {
  barcode?: string | null;
  priceDeltaMinor?: number;
  isActive?: boolean;
}

export function createVariant(body: CreateVariantBody): Promise<VariantPayload> {
  return postData<VariantPayload>('/variants', body);
}

export function updateVariant(id: string, body: UpdateVariantBody): Promise<VariantPayload> {
  return patchData<VariantPayload>(`/variants/${id}`, body);
}

export function deleteVariant(id: string): Promise<void> {
  return deleteData<void>(`/variants/${id}`);
}

/**
 * Bounds omitted default to the product's own declared grid, so an empty body means
 * "everything legal". A bound outside the declaration is refused server-side.
 */
export interface GenerateVariantsBody {
  productId: string;
  sphFrom?: number;
  sphTo?: number;
  cylFrom?: number;
  cylTo?: number;
  addFrom?: number;
  addTo?: number;
  axes?: number[];
  colors?: string[];
  sizes?: string[];
  priceDeltaMinor?: number;
  /** Report the count without writing — what drives the live preview. */
  dryRun?: boolean;
}

export interface GenerateResult {
  requested: number;
  created: number;
  /** Already present, so left untouched — generating twice is safe. */
  skipped: number;
  dryRun: boolean;
}

export function generateVariants(body: GenerateVariantsBody): Promise<GenerateResult> {
  return postData<GenerateResult>('/variants/generate', body);
}
