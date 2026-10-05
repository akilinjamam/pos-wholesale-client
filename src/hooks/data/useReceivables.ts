import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/api/endpoints/receivables';
import { partyKeys } from '@/hooks/data/useParties';

import type { ListReceiptsParams } from '@/api/endpoints/receivables';
import type { AllocateReceiptInput, ReceiptInput } from '@shared/payments';

export const receivableKeys = {
  all: ['receivables'] as const,
  preview: (partyId: string, amountMinor: number) =>
    ['receivables', 'preview', partyId, amountMinor] as const,
  receipts: (p: ListReceiptsParams) => ['receivables', 'receipts', p] as const,
  statement: (p: object) => ['receivables', 'statement', p] as const,
  collection: (p: object) => ['receivables', 'collection', p] as const,
};

/** The FIFO proposal for this much money from this party — the allocation grid's starting rows. */
export function useAllocationPreview(partyId: string | null, amountMinor: number) {
  return useQuery({
    queryKey: receivableKeys.preview(partyId ?? '', amountMinor),
    queryFn: () => api.allocationPreview(partyId!, amountMinor),
    enabled: Boolean(partyId) && amountMinor > 0,
    placeholderData: keepPreviousData,
  });
}

export function useReceipts(params: ListReceiptsParams) {
  return useQuery({
    queryKey: receivableKeys.receipts(params),
    queryFn: () => api.listReceipts(params),
    placeholderData: keepPreviousData,
  });
}

export function useStatement(params: { partyId: string | null; from?: string; to?: string }) {
  return useQuery({
    queryKey: receivableKeys.statement(params),
    queryFn: () => api.getStatement({ ...params, partyId: params.partyId! }),
    enabled: Boolean(params.partyId),
    placeholderData: keepPreviousData,
  });
}

export function useCollectionSheet(params: Parameters<typeof api.getCollectionSheet>[0]) {
  return useQuery({
    queryKey: receivableKeys.collection(params),
    queryFn: () => api.getCollectionSheet(params),
  });
}

/**
 * Money moved: every receivables view, the dealers' balances, and the invoices a receipt touched
 * (an order's invoices, a challan's) are all stale.
 */
function useSettle() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: receivableKeys.all });
    void qc.invalidateQueries({ queryKey: partyKeys.all });
    void qc.invalidateQueries({ queryKey: ['invoices'] });
  };
}

export function usePostReceipt() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (body: ReceiptInput) => api.postReceipt(body),
    onSuccess: settle,
  });
}

export function useAllocateReceipt() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AllocateReceiptInput }) =>
      api.allocateReceipt(id, body),
    onSuccess: settle,
  });
}
