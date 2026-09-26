import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  bulkAdjustPrices,
  createPriceEntry,
  createPriceTier,
  deletePriceEntry,
  deletePriceTier,
  importPriceEntries,
  resolvePrice,
  listPriceEntries,
  listPriceTiers,
  updatePriceEntry,
  updatePriceTier,
} from '@/api/endpoints/pricing';
import { partyKeys } from '@/hooks/data/useParties';

import type {
  ListPriceEntriesParams,
  ListPriceTiersParams,
  ResolvePriceParams,
} from '@/api/endpoints/pricing';
import type {
  BulkAdjustInput,
  CreatePriceEntryInput,
  CreatePriceTierInput,
  PriceImportInput,
  UpdatePriceEntryInput,
  UpdatePriceTierInput,
} from '@shared/pricing';

/**
 * Server state for tiers and price-list entries.
 *
 * Entry writes also invalidate tiers (each tier row shows its entry count), and tier writes
 * invalidate parties (a dealer's profile names its tier).
 */
export const pricingKeys = {
  tiers: ['price-tiers'] as const,
  tierList: (params: ListPriceTiersParams) => [...pricingKeys.tiers, 'list', params] as const,
  entries: ['price-entries'] as const,
  entryList: (params: ListPriceEntriesParams) =>
    [...pricingKeys.entries, 'list', params] as const,
  // Under `entries`, so any price edit also refreshes an open price check.
  resolve: (params: ResolvePriceParams) => [...pricingKeys.entries, 'resolve', params] as const,
};

export function usePriceTiers(params: ListPriceTiersParams = {}, enabled = true) {
  return useQuery({
    queryKey: pricingKeys.tierList(params),
    queryFn: () => listPriceTiers(params),
    enabled,
    // Tiers change rarely and every pricing screen and dealer form needs them.
    staleTime: 60_000,
  });
}

export function usePriceEntries(params: ListPriceEntriesParams, enabled = true) {
  return useQuery({
    queryKey: pricingKeys.entryList(params),
    queryFn: () => listPriceEntries(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return (...keys: (readonly unknown[])[]) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useCreatePriceTier() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreatePriceTierInput) => createPriceTier(body),
    onSuccess: (tier) => {
      void invalidate(pricingKeys.tiers);
      toast.success(`Tier ${tier.name} added`);
    },
  });
}

export function useUpdatePriceTier() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePriceTierInput }) =>
      updatePriceTier(id, body),
    onSuccess: (tier) => {
      void invalidate(pricingKeys.tiers, partyKeys.all);
      toast.success(`Tier ${tier.name} updated`);
    },
  });
}

export function useDeletePriceTier() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deletePriceTier(id),
    onSuccess: () => {
      void invalidate(pricingKeys.tiers);
      toast.success('Tier deleted');
    },
  });
}

export function useCreatePriceEntry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreatePriceEntryInput) => createPriceEntry(body),
    onSuccess: (entry) => {
      void invalidate(pricingKeys.entries, pricingKeys.tiers);
      toast.success(`Price added for ${entry.sku}`);
    },
  });
}

/** Silent on success: the grid's inline edit shows the new value in place, which is the feedback. */
export function useUpdatePriceEntry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePriceEntryInput }) =>
      updatePriceEntry(id, body),
    onSuccess: () => void invalidate(pricingKeys.entries),
  });
}

export function useDeletePriceEntry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deletePriceEntry(id),
    onSuccess: () => {
      void invalidate(pricingKeys.entries, pricingKeys.tiers);
      toast.success('Price removed');
    },
  });
}

export function useImportPriceEntries() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: PriceImportInput) => importPriceEntries(body),
    onSuccess: (result) => {
      if (result.dryRun) return;
      void invalidate(pricingKeys.entries, pricingKeys.tiers);
      toast.success(`Imported: ${result.created} added, ${result.updated} updated`, {
        description: result.failed > 0 ? `${result.failed} row(s) skipped` : undefined,
      });
    },
  });
}

export function useBulkAdjustPrices() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: BulkAdjustInput) => bulkAdjustPrices(body),
    onSuccess: (result) => {
      if (result.dryRun) return;
      void invalidate(pricingKeys.entries);
      toast.success(`${result.changed} price(s) adjusted`);
    },
  });
}

/**
 * A resolved price for the price-check widget. Keeps the previous answer on screen while the next
 * one loads, so typing a quantity does not flash the result away between keystrokes.
 */
export function useResolvedPrice(params: ResolvePriceParams | null) {
  return useQuery({
    queryKey: pricingKeys.resolve(params ?? { productId: '' }),
    queryFn: () => resolvePrice(params!),
    enabled: Boolean(params),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
