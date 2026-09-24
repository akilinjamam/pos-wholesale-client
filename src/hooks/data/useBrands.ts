import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { createBrand, deleteBrand, listBrands, updateBrand } from '@/api/endpoints/brands';

import type {
  CreateBrandBody,
  ListBrandsParams,
  UpdateBrandBody,
} from '@/api/endpoints/brands';

export const brandKeys = {
  all: ['brands'] as const,
  list: (params: ListBrandsParams) => [...brandKeys.all, 'list', params] as const,
};

export function useBrands(params: ListBrandsParams = {}) {
  return useQuery({
    queryKey: brandKeys.list(params),
    queryFn: () => listBrands(params),
    placeholderData: (previous) => previous,
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateBrandBody) => createBrand(body),
    onSuccess: (brand) => {
      void queryClient.invalidateQueries({ queryKey: brandKeys.all });
      toast.success(`${brand.name} added`);
    },
  });
}

export function useUpdateBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateBrandBody }) => updateBrand(id, body),
    onSuccess: (brand) => {
      void queryClient.invalidateQueries({ queryKey: brandKeys.all });
      toast.success(`${brand.name} updated`);
    },
  });
}

export function useDeleteBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBrand(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: brandKeys.all });
      toast.success('Brand deleted');
    },
  });
}
