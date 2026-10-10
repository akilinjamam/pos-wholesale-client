import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import * as api from '@/api/endpoints/purchasing';
import { stockKeys } from '@/hooks/data/useStock';

import type {
  ListGrnsParams,
  ListPosParams,
  ListPurchaseReturnsParams,
  ReorderParams,
} from '@/api/endpoints/purchasing';
import type {
  CancelGrnInput,
  CancelPoInput,
  CreateGrnInput,
  CreatePoInput,
  CreatePurchaseReturnInput,
  PoReasonInput,
  UpdateGrnInput,
  UpdatePoInput,
} from '@shared/purchasing';

/**
 * Server state for purchasing (Day 34).
 *
 * Everything here hangs off one `purchasing` root, and every write invalidates all of it: posting
 * a receipt moves its PO, a return moves its receipt, and either moves what reorder suggests. A
 * write that moves stock (posting a receipt, a return) also invalidates the `stock` root, so the
 * registers, the ledger and stock on hand show it at once.
 */
export const purchaseKeys = {
  all: ['purchasing'] as const,
  pos: (p: ListPosParams) => [...purchaseKeys.all, 'pos', p] as const,
  po: (id: string) => [...purchaseKeys.all, 'po', id] as const,
  grns: (p: ListGrnsParams) => [...purchaseKeys.all, 'grns', p] as const,
  grn: (id: string) => [...purchaseKeys.all, 'grn', id] as const,
  returns: (p: ListPurchaseReturnsParams) => [...purchaseKeys.all, 'returns', p] as const,
  reorder: (p: ReorderParams) => [...purchaseKeys.all, 'reorder', p] as const,
};

export const usePos = (p: ListPosParams, enabled = true) =>
  useQuery({
    queryKey: purchaseKeys.pos(p),
    queryFn: () => api.listPos(p),
    placeholderData: keepPreviousData,
    enabled,
  });
export const usePo = (id: string | undefined) =>
  useQuery({
    queryKey: purchaseKeys.po(id ?? ''),
    queryFn: () => api.getPo(id!),
    enabled: Boolean(id),
  });
export const useGrns = (p: ListGrnsParams, enabled = true) =>
  useQuery({
    queryKey: purchaseKeys.grns(p),
    queryFn: () => api.listGrns(p),
    placeholderData: keepPreviousData,
    enabled,
  });
export const useGrn = (id: string | undefined) =>
  useQuery({
    queryKey: purchaseKeys.grn(id ?? ''),
    queryFn: () => api.getGrn(id!),
    enabled: Boolean(id),
  });
export const usePurchaseReturns = (p: ListPurchaseReturnsParams) =>
  useQuery({
    queryKey: purchaseKeys.returns(p),
    queryFn: () => api.listPurchaseReturns(p),
    placeholderData: keepPreviousData,
  });
export const useReorderSuggestions = (p: ReorderParams) =>
  useQuery({
    queryKey: purchaseKeys.reorder(p),
    queryFn: () => api.reorderSuggestions(p),
    placeholderData: keepPreviousData,
  });

function usePurchaseMutation<V, R>(
  fn: (v: V) => Promise<R>,
  { success, movesStock = false }: { success?: (r: R) => string; movesStock?: boolean } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      if (movesStock) void queryClient.invalidateQueries({ queryKey: stockKeys.all });
      if (success) toast.success(success(r));
    },
  });
}

const label = (d: { docNo: string | null }) => d.docNo ?? 'Draft';

export const useCreatePo = () =>
  usePurchaseMutation((b: CreatePoInput) => api.createPo(b), {
    success: () => 'Draft PO saved',
  });
export const useUpdatePo = () =>
  usePurchaseMutation(
    ({ id, body }: { id: string; body: UpdatePoInput }) => api.updatePo(id, body),
    {
      success: () => 'Draft saved',
    },
  );
export const useApprovePo = () =>
  usePurchaseMutation((id: string) => api.approvePo(id), {
    success: (p) => `${label(p)} approved`,
  });
export const useSendPo = () =>
  usePurchaseMutation((id: string) => api.sendPo(id), {
    success: (p) => `${label(p)} marked as sent`,
  });
export const useReopenPo = () =>
  usePurchaseMutation(
    ({ id, body }: { id: string; body: PoReasonInput }) => api.reopenPo(id, body),
    {
      success: (p) => `${label(p)} back to draft`,
    },
  );
export const useCancelPo = () =>
  usePurchaseMutation(
    ({ id, body }: { id: string; body: CancelPoInput }) => api.cancelPo(id, body),
    {
      success: (p) => `${label(p)} cancelled`,
    },
  );
export const useShortClosePo = () =>
  usePurchaseMutation(
    ({ id, body }: { id: string; body: PoReasonInput }) => api.shortClosePo(id, body),
    { success: (p) => `${label(p)} short-closed` },
  );

export const useCreateGrn = () =>
  usePurchaseMutation((b: CreateGrnInput) => api.createGrn(b), {
    success: () => 'Draft receipt saved',
  });
export const useUpdateGrn = () =>
  usePurchaseMutation(({ id, body }: { id: string; body: UpdateGrnInput }) =>
    api.updateGrn(id, body),
  );
export const usePostGrn = () =>
  usePurchaseMutation((id: string) => api.postGrn(id), {
    success: (g) => `${label(g)} posted — goods in stock`,
    movesStock: true,
  });
export const useCancelGrn = () =>
  usePurchaseMutation(
    ({ id, body }: { id: string; body: CancelGrnInput }) => api.cancelGrn(id, body),
    {
      success: () => 'Draft receipt cancelled',
    },
  );

export const useCreatePurchaseReturn = () =>
  usePurchaseMutation((b: CreatePurchaseReturnInput) => api.createPurchaseReturn(b), {
    success: (r) => `${r.docNo} posted — goods out of stock`,
    movesStock: true,
  });
