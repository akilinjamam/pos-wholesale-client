import { deleteData, getPage, patchData, postData } from '@/api/client';

import type { BrandPayload, Paginated } from '@shared/types';

export type ListBrandsParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  isActive?: boolean;
};

export function listBrands(params: ListBrandsParams = {}): Promise<Paginated<BrandPayload>> {
  return getPage<BrandPayload>('/brands', params);
}

export interface CreateBrandBody {
  name: string;
  /** Derived from the name server-side when omitted. */
  slug?: string;
  logoUrl?: string | null;
  isActive?: boolean;
}

export type UpdateBrandBody = Partial<CreateBrandBody>;

export function createBrand(body: CreateBrandBody): Promise<BrandPayload> {
  return postData<BrandPayload>('/brands', body);
}

export function updateBrand(id: string, body: UpdateBrandBody): Promise<BrandPayload> {
  return patchData<BrandPayload>(`/brands/${id}`, body);
}

/** A real delete — refused by the server while products still carry the brand. */
export function deleteBrand(id: string): Promise<void> {
  return deleteData<void>(`/brands/${id}`);
}
