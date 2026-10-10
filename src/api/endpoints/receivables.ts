import { getData, getPage, postData } from '@/api/client';

import type {
  AllocateReceiptInput,
  BounceChequeInput,
  ChequeInput,
  ClearChequeInput,
  DepositChequeInput,
  ReceiptInput,
} from '@shared/payments';
import type { ChequeStatus } from '@shared/enums';
import type {
  AgeingReport,
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

// ─── Cheques and ageing (Day 30) ────────────────────────────────────────────────────────

export const listCheques = (params: {
  page?: number;
  limit?: number;
  q?: string;
  status?: ChequeStatus;
  partyId?: string;
}) => getPage<ReceiptPayload>('/payments/cheques', params);
export const receiveCheque = (body: ChequeInput) =>
  postData<ReceiptPayload>('/payments/cheques', body);
export const depositCheque = (id: string, body: DepositChequeInput) =>
  postData<ReceiptPayload>(`/payments/cheques/${id}/deposit`, body);
export const clearCheque = (id: string, body: ClearChequeInput) =>
  postData<ReceiptResult>(`/payments/cheques/${id}/clear`, body);
export const bounceCheque = (id: string, body: BounceChequeInput) =>
  postData<ReceiptResult>(`/payments/cheques/${id}/bounce`, body);

export const getAgeing = (params: { asOf?: string; territory?: string; partyId?: string }) =>
  getData<AgeingReport>('/payments/ageing', params);
