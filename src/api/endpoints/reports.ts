import { getData } from '@/api/client';

import type {
  CollectionRegisterQuery,
  DeadStockQuery,
  PeriodQuery,
  SalesReportQuery,
  StockValuationQuery,
} from '@shared/reports';
import type {
  CollectionRegister,
  DeadStock,
  DispatchRegister,
  SalesReport,
  ShiftSummary,
  StockValuation,
} from '@shared/types';

/** The report suite (Day 37). Every one is a single read; the server computes it whole. */

type Params<Q> = Partial<Q>;
const clean = <Q extends object>(q: Q) =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== '' && v !== undefined));

export const salesReport = (q: Params<SalesReportQuery>) =>
  getData<SalesReport>('/reports/sales', clean(q));
export const stockValuation = (q: Params<StockValuationQuery>) =>
  getData<StockValuation>('/reports/stock-valuation', clean(q));
export const dispatchRegister = (q: Params<PeriodQuery>) =>
  getData<DispatchRegister>('/reports/dispatch-register', clean(q));
export const collectionRegister = (q: Params<CollectionRegisterQuery>) =>
  getData<CollectionRegister>('/reports/collections', clean(q));
export const shiftSummary = (q: Params<PeriodQuery>) =>
  getData<ShiftSummary>('/reports/shifts', clean(q));
export const deadStock = (q: Params<DeadStockQuery>) =>
  getData<DeadStock>('/reports/dead-stock', clean(q));
