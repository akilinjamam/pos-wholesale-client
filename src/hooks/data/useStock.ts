import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import * as api from '@/api/endpoints/stock';

import type {
  ListAdjustmentsParams,
  ListBalancesParams,
  ListCountsParams,
  ListLedgerParams,
  ListSerialsParams,
  ListTransfersParams,
} from '@/api/endpoints/stock';
import type {
  CreateAdjustmentInput,
  CreateCountInput,
  CreateTransferInput,
  PostCountInput,
  RecordCountInput,
  UpdateAdjustmentInput,
  UpdateTransferInput,
} from '@shared/stockDocs';

/**
 * Server state for inventory.
 *
 * **Every stock write invalidates the whole `stock` root.** Posting an adjustment changes the
 * balances, the ledger, the serial register and the lots at once, and a screen showing any of
 * them must not keep a number the ledger no longer explains — that is the point of Day 16.
 */
export const stockKeys = {
  all: ['stock'] as const,
  balances: (p: ListBalancesParams) => [...stockKeys.all, 'balances', p] as const,
  ledger: (p: ListLedgerParams) => [...stockKeys.all, 'ledger', p] as const,
  adjustments: (p: ListAdjustmentsParams) => [...stockKeys.all, 'adjustments', p] as const,
  transfers: (p: ListTransfersParams) => [...stockKeys.all, 'transfers', p] as const,
  counts: (p: ListCountsParams) => [...stockKeys.all, 'counts', p] as const,
  count: (id: string) => [...stockKeys.all, 'count', id] as const,
  serials: (p: ListSerialsParams) => [...stockKeys.all, 'serials', p] as const,
  serial: (sn: string) => [...stockKeys.all, 'serial', sn] as const,
  expiring: (days: number, locationId?: string) =>
    [...stockKeys.all, 'expiring', days, locationId] as const,
};

const listQuery = <P, T>(key: readonly unknown[], fn: (p: P) => Promise<T>, params: P) => ({
  queryKey: key,
  queryFn: () => fn(params),
  placeholderData: keepPreviousData,
});

export const useBalances = (p: ListBalancesParams) =>
  useQuery(listQuery(stockKeys.balances(p), api.listBalances, p));
export const useLedger = (p: ListLedgerParams, enabled = true) =>
  useQuery({ ...listQuery(stockKeys.ledger(p), api.listLedger, p), enabled });
export const useAdjustments = (p: ListAdjustmentsParams) =>
  useQuery(listQuery(stockKeys.adjustments(p), api.listAdjustments, p));
export const useTransfers = (p: ListTransfersParams) =>
  useQuery(listQuery(stockKeys.transfers(p), api.listTransfers, p));
export const useCounts = (p: ListCountsParams) =>
  useQuery(listQuery(stockKeys.counts(p), api.listCounts, p));
export const useSerials = (p: ListSerialsParams) =>
  useQuery(listQuery(stockKeys.serials(p), api.listSerials, p));

export function useCount(id: string | undefined) {
  return useQuery({
    queryKey: stockKeys.count(id ?? ''),
    queryFn: () => api.getCount(id!),
    enabled: Boolean(id),
  });
}

export function useSerialHistory(serialNo: string | null) {
  return useQuery({
    queryKey: stockKeys.serial(serialNo ?? ''),
    queryFn: () => api.getSerialHistory(serialNo!),
    enabled: Boolean(serialNo),
  });
}

export function useExpiringLots(withinDays: number, locationId?: string) {
  return useQuery({
    queryKey: stockKeys.expiring(withinDays, locationId),
    queryFn: () => api.expiringLots({ withinDays, ...(locationId ? { locationId } : {}) }),
    placeholderData: keepPreviousData,
  });
}

/** A stock mutation: runs, invalidates everything stock, and optionally says so. */
function useStockMutation<V, R>(fn: (v: V) => Promise<R>, success?: (r: R) => string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: stockKeys.all });
      if (success) toast.success(success(r));
    },
  });
}

/** Reconcile writes nothing, so it invalidates nothing. */
export const useReconcile = () =>
  useMutation({ mutationFn: (locationId?: string) => api.reconcileStock(locationId) });

export const useCreateAdjustment = () =>
  useStockMutation(
    (b: CreateAdjustmentInput) => api.createAdjustment(b),
    () => 'Draft adjustment saved',
  );
export const useUpdateAdjustment = () =>
  useStockMutation(
    ({ id, body }: { id: string; body: UpdateAdjustmentInput }) =>
      api.updateAdjustment(id, body),
    () => 'Draft updated',
  );
export const useDeleteAdjustment = () =>
  useStockMutation(
    (id: string) => api.deleteAdjustment(id),
    () => 'Draft deleted',
  );
export const usePostAdjustment = () =>
  useStockMutation(
    (id: string) => api.postAdjustment(id),
    (a) => `${a.docNo} posted`,
  );
export const useCancelAdjustment = () =>
  useStockMutation(
    ({ id, reason }: { id: string; reason: string }) => api.cancelAdjustment(id, reason),
    (a) => `${a.docNo} cancelled and reversed`,
  );

export const useCreateTransfer = () =>
  useStockMutation(
    (b: CreateTransferInput) => api.createTransfer(b),
    () => 'Draft transfer saved',
  );
export const useUpdateTransfer = () =>
  useStockMutation(
    ({ id, body }: { id: string; body: UpdateTransferInput }) => api.updateTransfer(id, body),
    () => 'Draft updated',
  );
export const useDeleteTransfer = () =>
  useStockMutation(
    (id: string) => api.deleteTransfer(id),
    () => 'Draft deleted',
  );
export const usePostTransfer = () =>
  useStockMutation(
    (id: string) => api.postTransfer(id),
    (t) =>
      t.status === 'IN_TRANSIT' ? `${t.docNo} dispatched to transit` : `${t.docNo} posted`,
  );
export const useReceiveTransfer = () =>
  useStockMutation(
    (id: string) => api.receiveTransfer(id),
    (t) => `${t.docNo} received`,
  );

export const useOpenCount = () =>
  useStockMutation(
    (b: CreateCountInput) => api.openCount(b),
    (c) => `Count opened — ${c.lines.length} line(s) frozen`,
  );
export const useRecordCount = () =>
  useStockMutation(({ id, body }: { id: string; body: RecordCountInput }) =>
    api.recordCount(id, body),
  );
export const usePostCount = () =>
  useStockMutation(
    ({ id, body }: { id: string; body: PostCountInput }) => api.postCount(id, body),
    (c) => `${c.docNo} posted — ${c.summary.withVariance} variance(s)`,
  );
export const useCancelCount = () =>
  useStockMutation(
    (id: string) => api.cancelCount(id),
    () => 'Count cancelled — stock unfrozen',
  );
