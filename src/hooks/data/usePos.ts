import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import * as api from '@/api/endpoints/pos';
import { stockKeys } from '@/hooks/data/useStock';

import type { HoldSaleInput, OpenSessionInput, PosQuoteInput, PosSaleInput } from '@shared/pos';

export const posKeys = {
  all: ['pos'] as const,
  session: ['pos', 'session'] as const,
  quote: (body: PosQuoteInput) => ['pos', 'quote', body] as const,
  held: ['pos', 'held'] as const,
  customers: (q: string) => ['pos', 'customers', q] as const,
  lots: (productId: string) => ['pos', 'lots', productId] as const,
};

export function useCurrentSession() {
  return useQuery({
    queryKey: posKeys.session,
    queryFn: api.getCurrentSession,
    staleTime: 30_000,
  });
}

/**
 * The server's price for the cart as it stands. Keeps the last good quote on screen while the next
 * loads, so the total does not flicker between keystrokes. `enabled` is false for an empty cart.
 */
export function useQuote(body: PosQuoteInput | null) {
  return useQuery({
    queryKey: posKeys.quote(body ?? { lines: [] }),
    queryFn: () => api.quoteCart(body!),
    enabled: Boolean(body && body.lines.length > 0),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 15_000,
  });
}

export function useHeldSales(enabled: boolean) {
  return useQuery({ queryKey: posKeys.held, queryFn: api.listHeld, enabled });
}

export function useCustomerSearch(q: string) {
  return useQuery({
    queryKey: posKeys.customers(q),
    queryFn: () => api.searchCustomers(q),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useLotsInStock(productId: string | null) {
  return useQuery({
    queryKey: posKeys.lots(productId ?? ''),
    queryFn: () => api.lotsInStock(productId!),
    enabled: Boolean(productId),
  });
}

export function useOpenSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OpenSessionInput) => api.openSession(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: posKeys.session });
      toast.success('Shift opened');
    },
  });
}

/** A sale moves stock, so it refreshes inventory screens and the shift's live totals. */
export function usePostSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PosSaleInput) => api.postSale(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: posKeys.all });
      void qc.invalidateQueries({ queryKey: stockKeys.all });
    },
  });
}

export function useHoldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: HoldSaleInput) => api.holdSale(body),
    onSuccess: (h) => {
      void qc.invalidateQueries({ queryKey: posKeys.held });
      toast.success(`Parked as "${h.label}"`);
    },
  });
}

export function useDiscardHeld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.discardHeld(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: posKeys.held }),
  });
}
