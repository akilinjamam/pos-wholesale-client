import { deleteData, getData, getPage, patchData, postData } from '@/api/client';

import type { ProductAttrs } from '@shared/catalog';
import type { ProductType, TrackingMode } from '@shared/enums';
import type { Paginated, ProductPackPayload, ProductPayload } from '@shared/types';

export type ListProductsParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  type?: ProductType;
  brandId?: string;
  categoryId?: string;
  /** The whole category subtree, at any depth. */
  categoryUnder?: string;
  trackingMode?: TrackingMode;
  hasVariants?: boolean;
  isActive?: boolean;
};

export function listProducts(params: ListProductsParams): Promise<Paginated<ProductPayload>> {
  return getPage<ProductPayload>('/products', params);
}

export function getProduct(id: string): Promise<ProductPayload> {
  return getData<ProductPayload>(`/products/${id}`);
}

/**
 * `attrs` omits the discriminant the union needs — the server injects it from `type`.
 *
 * `avgCostMinor` is absent by design: it is derived by the costing engine on every goods
 * receipt (Day 33), and the API refuses to let it be set.
 */
export interface CreateProductBody {
  sku: string;
  name: string;
  type: ProductType;
  brandId?: string | null;
  categoryId?: string | null;
  description?: string | null;
  images?: string[];
  barcode?: string | null;

  baseUom: string;
  packs?: ProductPackPayload[];
  trackingMode?: TrackingMode;

  hasVariants?: boolean;
  variantAxes?: string[];

  taxRatePct?: number;
  hsCode?: string | null;

  mrpMinor?: number;
  defaultSellPriceMinor?: number;
  standardCostMinor?: number;

  reorderPoint?: number;
  reorderQty?: number;
  leadTimeDays?: number;

  isActive?: boolean;
  isSellableAtCounter?: boolean;
  isSellableWholesale?: boolean;

  attrs: Omit<ProductAttrs, 'type'> | Record<string, unknown>;
}

/** `type` may be sent unchanged — the server refuses a *change*, not its presence. */
export type UpdateProductBody = Partial<CreateProductBody>;

export function createProduct(body: CreateProductBody): Promise<ProductPayload> {
  return postData<ProductPayload>('/products', body);
}

export function updateProduct(id: string, body: UpdateProductBody): Promise<ProductPayload> {
  return patchData<ProductPayload>(`/products/${id}`, body);
}

/** Deactivates — invoice lines and ledger rows point at this id forever. */
export function deactivateProduct(id: string): Promise<ProductPayload> {
  return deleteData<ProductPayload>(`/products/${id}`);
}
