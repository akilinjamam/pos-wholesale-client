import { deleteData, getData, getPage, patchData, postData } from '@/api/client';

import type {
  AdjustmentReason,
  CountStatus,
  DocumentStatus,
  SerialStatus,
  StockMovementType,
  TransferStatus,
} from '@shared/enums';
import type {
  CreateAdjustmentInput,
  CreateCountInput,
  CreateTransferInput,
  PostCountInput,
  RecordCountInput,
  UpdateAdjustmentInput,
  UpdateTransferInput,
} from '@shared/stockDocs';
import type {
  LotPayload,
  Paginated,
  ReconcileResult,
  SerialHistoryPayload,
  SerialUnitPayload,
  StockAdjustmentPayload,
  StockBalancePayload,
  StockCountPayload,
  StockLedgerPayload,
  StockTransferPayload,
} from '@shared/types';

/**
 * Every inventory endpoint in one place (Days 13–16). Stock is only ever *read* here directly —
 * every write is a document (adjustment, transfer, count) that the server posts through its single
 * stock writer.
 */

type ListBase = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
};

// ─── Balances & ledger ──────────────────────────────────────────────────────────────────

export type ListBalancesParams = ListBase & {
  locationId?: string;
  productId?: string;
  variantId?: string;
  nonZero?: boolean;
};

export const listBalances = (
  params: ListBalancesParams,
): Promise<Paginated<StockBalancePayload>> =>
  getPage<StockBalancePayload>('/stock/balances', params);

export type ListLedgerParams = ListBase & {
  locationId?: string;
  productId?: string;
  variantId?: string;
  movementType?: StockMovementType;
  refType?: string;
  refId?: string;
  refDocNo?: string;
  serialNo?: string;
  from?: string;
  to?: string;
};

export const listLedger = (params: ListLedgerParams): Promise<Paginated<StockLedgerPayload>> =>
  getPage<StockLedgerPayload>('/stock/ledger', params);

export const reconcileStock = (locationId?: string): Promise<ReconcileResult> =>
  postData<ReconcileResult>('/stock/reconcile', locationId ? { locationId } : {});

// ─── Adjustments ────────────────────────────────────────────────────────────────────────

export type ListAdjustmentsParams = ListBase & {
  status?: DocumentStatus;
  locationId?: string;
  reason?: AdjustmentReason;
};

export const listAdjustments = (params: ListAdjustmentsParams) =>
  getPage<StockAdjustmentPayload>('/stock-adjustments', params);
export const createAdjustment = (body: CreateAdjustmentInput) =>
  postData<StockAdjustmentPayload>('/stock-adjustments', body);
export const updateAdjustment = (id: string, body: UpdateAdjustmentInput) =>
  patchData<StockAdjustmentPayload>(`/stock-adjustments/${id}`, body);
export const deleteAdjustment = (id: string) => deleteData<void>(`/stock-adjustments/${id}`);
export const postAdjustment = (id: string) =>
  postData<StockAdjustmentPayload>(`/stock-adjustments/${id}/post`);
export const cancelAdjustment = (id: string, reason: string) =>
  postData<StockAdjustmentPayload>(`/stock-adjustments/${id}/cancel`, { reason });

// ─── Transfers ──────────────────────────────────────────────────────────────────────────

export type ListTransfersParams = ListBase & { status?: TransferStatus; locationId?: string };

export const listTransfers = (params: ListTransfersParams) =>
  getPage<StockTransferPayload>('/stock-transfers', params);
export const createTransfer = (body: CreateTransferInput) =>
  postData<StockTransferPayload>('/stock-transfers', body);
export const updateTransfer = (id: string, body: UpdateTransferInput) =>
  patchData<StockTransferPayload>(`/stock-transfers/${id}`, body);
export const deleteTransfer = (id: string) => deleteData<void>(`/stock-transfers/${id}`);
export const postTransfer = (id: string) =>
  postData<StockTransferPayload>(`/stock-transfers/${id}/post`);
export const receiveTransfer = (id: string) =>
  postData<StockTransferPayload>(`/stock-transfers/${id}/receive`);

// ─── Counts ─────────────────────────────────────────────────────────────────────────────

export type ListCountsParams = ListBase & { status?: CountStatus; locationId?: string };

export const listCounts = (params: ListCountsParams) =>
  getPage<StockCountPayload>('/stock-counts', params);
export const getCount = (id: string) => getData<StockCountPayload>(`/stock-counts/${id}`);
export const openCount = (body: CreateCountInput) =>
  postData<StockCountPayload>('/stock-counts', body);
export const recordCount = (id: string, body: RecordCountInput) =>
  postData<StockCountPayload>(`/stock-counts/${id}/record`, body);
export const postCount = (id: string, body: PostCountInput) =>
  postData<StockCountPayload>(`/stock-counts/${id}/post`, body);
export const cancelCount = (id: string) =>
  postData<StockCountPayload>(`/stock-counts/${id}/cancel`);

// ─── Serials & lots ─────────────────────────────────────────────────────────────────────

export type ListSerialsParams = ListBase & {
  productId?: string;
  status?: SerialStatus;
  locationId?: string;
  warrantyEndingBefore?: string;
};

export const listSerials = (params: ListSerialsParams) =>
  getPage<SerialUnitPayload>('/serials', params);
export const getSerialHistory = (serialNo: string) =>
  getData<SerialHistoryPayload>(`/serials/${encodeURIComponent(serialNo)}`);

export const expiringLots = (params: { withinDays: number; locationId?: string }) =>
  getData<LotPayload[]>('/lots/expiring', params);
