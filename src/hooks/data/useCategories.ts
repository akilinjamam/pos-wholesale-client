import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '@/api/endpoints/categories';

import type {
  CreateCategoryBody,
  ListCategoriesParams,
  UpdateCategoryBody,
} from '@/api/endpoints/categories';

export const categoryKeys = {
  all: ['categories'] as const,
  list: (params: ListCategoriesParams) => [...categoryKeys.all, 'list', params] as const,
};

export function useCategories(params: ListCategoriesParams = {}) {
  return useQuery({
    queryKey: categoryKeys.list(params),
    queryFn: () => listCategories(params),
    placeholderData: (previous) => previous,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateCategoryBody) => createCategory(body),
    onSuccess: (category) => {
      void queryClient.invalidateQueries({ queryKey: categoryKeys.all });
      toast.success(`${category.name} added`);
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategoryBody }) =>
      updateCategory(id, body),
    onSuccess: (category) => {
      // A reparent rewrites descendants' paths server-side, so the whole list is stale — not
      // just this row.
      void queryClient.invalidateQueries({ queryKey: categoryKeys.all });
      toast.success(`${category.name} updated`);
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoryKeys.all });
      toast.success('Category deleted');
    },
  });
}
