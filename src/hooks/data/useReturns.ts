import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/api/endpoints/returns';

import type { ListCreditNotesParams, ListSalesReturnsParams } from '@/api/endpoints/returns';
import type { AllocateCreditNoteInput, WholesaleReturnInput } from '@shared/returns';

/**
 * Sales returns and credit notes (Day 36). A return moves stock, an invoice, an order and the
 * dealer's ledger at once, so posting one refreshes all of them; spending a credit note moves
 * invoices, so receivables refresh too.
 */
export const returnKeys = {
  all: ['returns'] as const,
  list: (p: ListSalesReturnsParams) => ['returns', 'list', p] as const,
  returnable: (invoiceId: string) => ['returns', 'returnable', invoiceId] as const,
  invoices: (partyId: string, q: string) => ['returns', 'invoices', partyId, q] as const,
  creditNotes: (p: ListCreditNotesParams) => ['returns', 'credit-notes', p] as const,
};

export const useSalesReturns = (p: ListSalesReturnsParams) =>
  useQuery({
    queryKey: returnKeys.list(p),
    queryFn: () => api.listSalesReturns(p),
    placeholderData: keepPreviousData,
  });

export const useReturnableInvoice = (invoiceId: string | null) =>
  useQuery({
    queryKey: returnKeys.returnable(invoiceId ?? ''),
    queryFn: () => api.getReturnableInvoice(invoiceId!),
    enabled: Boolean(invoiceId),
  });

export const useDealerInvoices = (partyId: string | null, q: string) =>
  useQuery({
    queryKey: returnKeys.invoices(partyId ?? '', q),
    queryFn: () => api.listDealerInvoices(partyId!, q || undefined),
    enabled: Boolean(partyId),
    placeholderData: keepPreviousData,
  });

export const useCreditNotes = (p: ListCreditNotesParams) =>
  useQuery({
    queryKey: returnKeys.creditNotes(p),
    queryFn: () => api.listCreditNotes(p),
    placeholderData: keepPreviousData,
  });

function useSettle() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ['returns', 'receivables', 'parties', 'orders', 'stock', 'dispatches'])
      void queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export function usePostWholesaleReturn() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (b: WholesaleReturnInput) => api.postWholesaleReturn(b),
    onSuccess: settle,
  });
}

export function useAllocateCreditNote() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AllocateCreditNoteInput }) =>
      api.allocateCreditNote(id, body),
    onSuccess: settle,
  });
}
