import { getData, getPage, postData } from '@/api/client';

import type { AllocateReceiptInput, ReceiptInput } from '@shared/payments';
import type {
  AllocationPreview,
  CollectionSheet,
  Paginated,
  ReceiptPayload,
  ReceiptResult,
  StatementPayload,
} from '@shared/types';

/** Receivables (Day 28 server, Day 29 screens): receipts, allocation, statement, collections. */

export type ListReceiptsParams = {
  page?: number;
  limit?: number;
  q?: string;
  partyId?: string;
  /** Only receipts with an advance still on them. */
  unallocated?: boolean;
  sort?: string;
  order?: 'asc' | 'desc';
};

export const allocationPreview = (partyId: string, amountMinor: number) =>
  getData<AllocationPreview>('/payments/allocation-preview', { partyId, amountMinor });
export const postReceipt = (body: ReceiptInput) =>
  postData<ReceiptResult>('/payments/receipts', body);
export const allocateReceipt = (id: string, body: AllocateReceiptInput) =>
  postData<ReceiptResult>(`/payments/receipts/${id}/allocate`, body);
export const listReceipts = (params: ListReceiptsParams): Promise<Paginated<ReceiptPayload>> =>
  getPage<ReceiptPayload>('/payments/receipts', params);

export const getStatement = (params: { partyId: string; from?: string; to?: string }) =>
  getData<StatementPayload>('/ledger/statement', params);

export const getCollectionSheet = (params: {
  salespersonUserId?: string;
  territory?: string;
  overdueOnly?: boolean;
}) => getData<CollectionSheet>('/payments/collection-sheet', params);
