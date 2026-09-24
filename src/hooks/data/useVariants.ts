import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createVariant,
  deleteVariant,
  generateVariants,
  listVariants,
  updateVariant,
} from '@/api/endpoints/variants';

import type {
  CreateVariantBody,
  GenerateVariantsBody,
  ListVariantsParams,
  UpdateVariantBody,
} from '@/api/endpoints/variants';

export const variantKeys = {
  all: ['variants'] as const,
  list: (params: ListVariantsParams) => [...variantKeys.all, 'list', params] as const,
};

export function useVariants(params: ListVariantsParams, enabled = true) {
  return useQuery({
    queryKey: variantKeys.list(params),
    queryFn: () => listVariants(params),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useCreateVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateVariantBody) => createVariant(body),
    onSuccess: (variant) => {
      void queryClient.invalidateQueries({ queryKey: variantKeys.all });
      toast.success(`${variant.label} added`);
    },
  });
}

export function useUpdateVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateVariantBody }) =>
      updateVariant(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: variantKeys.all });
    },
  });
}

export function useDeleteVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteVariant(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: variantKeys.all });
      toast.success('Variant removed');
    },
  });
}

/**
 * The real generate. `dryRun` is deliberately **not** routed through here — a preview is a
 * question, not a change, so it must not invalidate caches or raise a toast. The dialog calls
 * the endpoint directly for that.
 */
export function useGenerateVariants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: GenerateVariantsBody) => generateVariants({ ...body, dryRun: false }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: variantKeys.all });

      if (result.created === 0) {
        toast.info('Nothing new — every combination in that range already exists');
      } else {
        toast.success(
          `${result.created} variant${result.created === 1 ? '' : 's'} created` +
            (result.skipped > 0 ? `, ${result.skipped} already existed` : ''),
        );
      }
    },
  });
}
