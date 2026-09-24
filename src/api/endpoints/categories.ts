import { deleteData, getPage, patchData, postData } from '@/api/client';

import type { ProductType } from '@shared/enums';
import type { CategoryPayload, Paginated } from '@shared/types';

export type ListCategoriesParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  /** Direct children. `'root'` for the top level. */
  parentId?: string | 'root';
  /** The whole subtree beneath this node, at any depth. */
  under?: string;
  productType?: ProductType;
  isActive?: boolean;
};

export function listCategories(
  params: ListCategoriesParams = {},
): Promise<Paginated<CategoryPayload>> {
  return getPage<CategoryPayload>('/categories', params);
}

export interface CreateCategoryBody {
  name: string;
  parentId?: string | null;
  productType?: ProductType | null;
  isActive?: boolean;
}

export type UpdateCategoryBody = Partial<CreateCategoryBody>;

export function createCategory(body: CreateCategoryBody): Promise<CategoryPayload> {
  return postData<CategoryPayload>('/categories', body);
}

export function updateCategory(id: string, body: UpdateCategoryBody): Promise<CategoryPayload> {
  return patchData<CategoryPayload>(`/categories/${id}`, body);
}

/** Refused server-side while the node has children or products. */
export function deleteCategory(id: string): Promise<void> {
  return deleteData<void>(`/categories/${id}`);
}
