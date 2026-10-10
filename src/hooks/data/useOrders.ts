import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/api/endpoints/orders';
import { stockKeys } from '@/hooks/data/useStock';

import type { ListOrdersParams } from '@/api/endpoints/orders';
import type {
  CancelOrderInput,
  ConfirmOrderInput,
  CreateOrderInput,
  OrderReasonInput,
  QuoteOrderInput,
} from '@shared/orders';
import type { CreditOverridesQuery } from '@shared/audit';
import type { WholesaleOrderPayload } from '@shared/types';

export const orderKeys = {
  all: ['orders'] as const,
  list: (params: ListOrdersParams) => ['orders', 'list', params] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  quote: (body: QuoteOrderInput) => ['orders', 'quote', body] as const,
  counts: (locationId?: string) => ['orders', 'counts', locationId ?? ''] as const,
  overrides: (params: CreditOverridesQuery) => ['orders', 'credit-overrides', params] as const,
};

export function useOrders(params: ListOrdersParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => api.listOrders(params),
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? ''),
    queryFn: () => api.getOrder(id!),
    enabled: Boolean(id),
  });
}

/**
 * The server's price, availability and credit verdict for the order as it stands — the builder's
 * every figure. Keeps the last good quote on screen while the next loads, so totals do not flicker
 * between keystrokes. `null` (nothing to price yet) disables it.
 */
export function useOrderQuote(body: QuoteOrderInput | null) {
  return useQuery({
    queryKey: orderKeys.quote(body ?? ({} as QuoteOrderInput)),
    queryFn: () => api.quoteOrder(body!),
    enabled: Boolean(body && body.lines.length > 0),
    placeholderData: keepPreviousData,
    retry: false,
    // Availability changes as other orders confirm; a quote older than this is re-asked for.
    staleTime: 15_000,
  });
}

/** After any write: this order, every list, and — for anything that reserves or releases — stock. */
function useSettle() {
  const qc = useQueryClient();
  return (order: WholesaleOrderPayload, stockMoved = false) => {
    qc.setQueryData(orderKeys.detail(order.id), order);
    void qc.invalidateQueries({ queryKey: ['orders', 'list'] });
    void qc.invalidateQueries({ queryKey: ['orders', 'counts'] });
    void qc.invalidateQueries({ queryKey: ['orders', 'quote'] });
    void qc.invalidateQueries({ queryKey: ['orders', 'credit-overrides'] });
    if (stockMoved) {
      void qc.invalidateQueries({ queryKey: stockKeys.all });
      // Cancel and short close also cancel the order's open challans.
      void qc.invalidateQueries({ queryKey: ['dispatches'] });
    }
  };
}

export function useSaveOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: CreateOrderInput }) =>
      id ? api.updateOrder(id, body) : api.createOrder(body),
    onSuccess: (order) => settle(order),
  });
}

export function useConfirmOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConfirmOrderInput }) =>
      api.confirmOrder(id, body),
    onSuccess: (order) => settle(order, true),
  });
}

export function useApproveOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: OrderReasonInput }) =>
      api.approveOrder(id, body),
    onSuccess: (order) => settle(order, true),
  });
}

export function useRejectOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: OrderReasonInput }) =>
      api.rejectOrder(id, body),
    onSuccess: (order) => settle(order),
  });
}

export function useCancelOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CancelOrderInput }) =>
      api.cancelOrder(id, body),
    onSuccess: (order) => settle(order, true),
  });
}

export function useOrderCounts(locationId?: string) {
  return useQuery({
    queryKey: orderKeys.counts(locationId),
    queryFn: () => api.getOrderCounts({ locationId }),
    staleTime: 15_000,
  });
}

export function useShortCloseOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: OrderReasonInput }) =>
      api.shortCloseOrder(id, body),
    // Reservations released, open challans cancelled.
    onSuccess: (order) => settle(order, true),
  });
}

export function useCloseOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (id: string) => api.closeOrder(id),
    onSuccess: (order) => settle(order),
  });
}

/** The managers' credit overrides dashboard (Day 31). */
export function useCreditOverrides(params: CreditOverridesQuery) {
  return useQuery({
    queryKey: orderKeys.overrides(params),
    queryFn: () => api.getCreditOverrides(params),
    placeholderData: keepPreviousData,
  });
}
