import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as api from '@/api/endpoints/reports';

import type {
  CollectionRegisterQuery,
  DeadStockQuery,
  PeriodQuery,
  SalesReportQuery,
  StockValuationQuery,
} from '@shared/reports';

/**
 * Reports (Day 37). Read-only and never cached for long: a report is asked for to see *now*, so
 * each is re-read when the screen opens, and the previous figures stay up while new ones load.
 */
const report = <Q, T>(name: string, fn: (q: Q) => Promise<T>, q: Q) => ({
  queryKey: ['reports', name, q] as const,
  queryFn: () => fn(q),
  placeholderData: keepPreviousData,
  staleTime: 0,
});

export const useSalesReport = (q: Partial<SalesReportQuery>) =>
  useQuery(report('sales', api.salesReport, q));
export const useStockValuation = (q: Partial<StockValuationQuery>) =>
  useQuery(report('stock-valuation', api.stockValuation, q));
export const useDispatchRegister = (q: Partial<PeriodQuery>) =>
  useQuery(report('dispatch-register', api.dispatchRegister, q));
export const useCollectionRegister = (q: Partial<CollectionRegisterQuery>) =>
  useQuery(report('collections', api.collectionRegister, q));
export const useShiftSummary = (q: Partial<PeriodQuery>) =>
  useQuery(report('shifts', api.shiftSummary, q));
export const useDeadStock = (q: Partial<DeadStockQuery>) =>
  useQuery(report('dead-stock', api.deadStock, q));
