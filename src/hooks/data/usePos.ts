import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import * as api from '@/api/endpoints/pos';
import { stockKeys } from '@/hooks/data/useStock';

import type {
  CloseSessionInput,
  CounterReturnInput,
  HoldSaleInput,
  OpenSessionInput,
  PosQuoteInput,
  PosSaleInput,
} from '@shared/pos';

export const posKeys = {
  all: ['pos'] as const,
  session: ['pos', 'session'] as const,
  quote: (body: PosQuoteInput) => ['pos', 'quote', body] as const,
  held: ['pos', 'held'] as const,
  customers: (q: string) => ['pos', 'customers', q] as const,
  lots: (productId: string) => ['pos', 'lots', productId] as const,
  sale: (id: string) => ['pos', 'sale', id] as const,
  sessions: (params: object) => ['pos', 'sessions', params] as const,
  sessionById: (id: string) => ['pos', 'session', id] as const,
  returnable: (docNo: string) => ['pos', 'returnable', docNo] as const,
  returns: (params: object) => ['pos', 'returns', params] as const,
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

// ─── Day 20: reprints, shifts, returns ──────────────────────────────────────────────────

export function useSale(id: string | null) {
  return useQuery({
    queryKey: posKeys.sale(id ?? ''),
    queryFn: () => api.getSale(id!),
    enabled: Boolean(id),
  });
}

export function useSessions(params: {
  status?: 'OPEN' | 'CLOSED';
  limit?: number;
  page?: number;
}) {
  return useQuery({
    queryKey: posKeys.sessions(params),
    queryFn: () => api.listSessions(params),
  });
}

export function useSessionById(id: string | null) {
  return useQuery({
    queryKey: posKeys.sessionById(id ?? ''),
    queryFn: () => api.getSession(id!),
    enabled: Boolean(id),
  });
}

/** Close the shift: the response is the frozen Z-report. */
export function useCloseSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CloseSessionInput }) =>
      api.closeSession(id, body),
    onSuccess: () => {
      // No shift now: say so at once, and drop the parked-sales list rather than refetch it —
      // the server answers "open a shift first", which would toast right after a clean close.
      qc.setQueryData(posKeys.session, null);
      qc.removeQueries({ queryKey: posKeys.held });
      void qc.invalidateQueries({
        queryKey: posKeys.all,
        predicate: (q) => q.queryKey[1] !== 'held' && q.queryKey[1] !== 'session',
      });
      toast.success('Shift closed');
    },
  });
}

export function useReturnable(docNo: string | null) {
  return useQuery({
    queryKey: posKeys.returnable(docNo ?? ''),
    queryFn: () => api.getReturnableInvoice(docNo!),
    enabled: Boolean(docNo),
    retry: false,
  });
}

export function useReturns(
  params: { posSessionId?: string; openExchange?: boolean; limit?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: posKeys.returns(params),
    queryFn: () => api.listReturns(params),
    enabled,
  });
}

/** A return moves stock and money: refresh the shift's figures and stock screens with it. */
export function usePostReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CounterReturnInput) => api.postReturn(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: posKeys.all });
      void qc.invalidateQueries({ queryKey: stockKeys.all });
    },
  });
}

export function useRefundExchange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.refundExchange(id),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: posKeys.all });
      toast.success(`Refunded ${r.docNo} in cash`);
    },
  });
}
