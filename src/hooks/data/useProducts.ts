import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createProduct,
  deactivateProduct,
  listProducts,
  updateProduct,
} from '@/api/endpoints/products';

import type {
  CreateProductBody,
  ListProductsParams,
  UpdateProductBody,
} from '@/api/endpoints/products';

export const productKeys = {
  all: ['products'] as const,
  list: (params: ListProductsParams) => [...productKeys.all, 'list', params] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
};

export function useProducts(params: ListProductsParams) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => listProducts(params),
    placeholderData: (previous) => previous,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateProductBody) => createProduct(body),
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: productKeys.all });
      // Brand and category rows carry a product count, so they are stale now too.
      void queryClient.invalidateQueries({ queryKey: ['brands'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(`${product.name} added`);
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProductBody }) =>
      updateProduct(id, body),
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: productKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['brands'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(`${product.name} updated`);
    },
  });
}

export function useDeactivateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateProduct(id),
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: productKeys.all });
      toast.success(`${product.name} deactivated`);
    },
  });
}
