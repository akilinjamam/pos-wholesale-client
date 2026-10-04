import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/api/endpoints/dispatches';
import { orderKeys } from '@/hooks/data/useOrders';
import { stockKeys } from '@/hooks/data/useStock';

import type { ListDispatchesParams } from '@/api/endpoints/dispatches';
import type {
  CancelDispatchInput,
  CreateDispatchInput,
  DeliverDispatchInput,
  UpdateDispatchInput,
} from '@shared/dispatch';
import type { DispatchPayload } from '@shared/types';

export const dispatchKeys = {
  all: ['dispatches'] as const,
  list: (p: ListDispatchesParams) => ['dispatches', 'list', p] as const,
  detail: (id: string) => ['dispatches', 'detail', id] as const,
  invoice: (id: string) => ['invoices', 'detail', id] as const,
  orderInvoices: (orderId: string) => ['invoices', 'order', orderId] as const,
};

export function useDispatches(params: ListDispatchesParams, enabled = true) {
  return useQuery({
    queryKey: dispatchKeys.list(params),
    queryFn: () => api.listDispatches(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useDispatch(id: string | undefined) {
  return useQuery({
    queryKey: dispatchKeys.detail(id ?? ''),
    queryFn: () => api.getDispatch(id!),
    enabled: Boolean(id),
  });
}

export function useInvoice(id: string | null | undefined) {
  return useQuery({
    queryKey: dispatchKeys.invoice(id ?? ''),
    queryFn: () => api.getInvoice(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useOrderInvoices(orderId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: dispatchKeys.orderInvoices(orderId ?? ''),
    queryFn: () => api.listOrderInvoices(orderId!),
    enabled: Boolean(orderId) && enabled,
  });
}

/**
 * After a challan changes: it, every challan list, and its order — every step moves the order's
 * status. Posting also moves stock and raises an invoice.
 */
function useSettle() {
  const qc = useQueryClient();
  return (d: DispatchPayload, { stock = false } = {}) => {
    qc.setQueryData(dispatchKeys.detail(d.id), d);
    void qc.invalidateQueries({ queryKey: ['dispatches', 'list'] });
    void qc.invalidateQueries({ queryKey: orderKeys.detail(d.orderId) });
    void qc.invalidateQueries({ queryKey: ['orders', 'list'] });
    if (stock) {
      void qc.invalidateQueries({ queryKey: stockKeys.all });
      void qc.invalidateQueries({ queryKey: ['invoices'] });
    }
  };
}

export function useCreateDispatch() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (body: CreateDispatchInput) => api.createDispatch(body),
    onSuccess: (d) => settle(d),
  });
}

export function useUpdateDispatch() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDispatchInput }) =>
      api.updateDispatch(id, body),
    onSuccess: (d) => settle(d),
  });
}

export function usePackDispatch() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (id: string) => api.packDispatch(id),
    onSuccess: (d) => settle(d),
  });
}

export function usePostDispatch() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (id: string) => api.postDispatch(id),
    onSuccess: (r) => settle(r.dispatch, { stock: true }),
  });
}

export function useDeliverDispatch() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DeliverDispatchInput }) =>
      api.deliverDispatch(id, body),
    onSuccess: (d) => settle(d),
  });
}

export function useCancelDispatch() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CancelDispatchInput }) =>
      api.cancelDispatch(id, body),
    onSuccess: (d) => settle(d),
  });
}
