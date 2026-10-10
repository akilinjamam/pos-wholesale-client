import { getData, getPage, patchData, postData } from '@/api/client';

import type { GrnStatus, PaymentMethod, PoStatus } from '@shared/enums';
import type { AllocateSupplierPaymentInput, SupplierPaymentInput } from '@shared/payments';
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
import type {
  GoodsReceiptPayload,
  Paginated,
  PayablesPreview,
  PurchaseOrderPayload,
  PurchaseRegisterPayload,
  PurchaseReturnPayload,
  ReorderSuggestionPayload,
  SupplierPaymentPayload,
  SupplierPaymentResult,
} from '@shared/types';

/** Purchasing (Days 32–34): purchase orders, goods receipts, purchase returns, reorder. */

type ListBase = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
};

// ─── Purchase orders ────────────────────────────────────────────────────────────────────

export type ListPosParams = ListBase & {
  status?: PoStatus;
  supplierPartyId?: string;
  locationId?: string;
  /** Only POs that can still be received against. */
  open?: boolean;
};

export const listPos = (params: ListPosParams): Promise<Paginated<PurchaseOrderPayload>> =>
  getPage<PurchaseOrderPayload>('/purchase-orders', params);
export const getPo = (id: string) => getData<PurchaseOrderPayload>(`/purchase-orders/${id}`);
export const createPo = (body: CreatePoInput) =>
  postData<PurchaseOrderPayload>('/purchase-orders', body);
export const updatePo = (id: string, body: UpdatePoInput) =>
  patchData<PurchaseOrderPayload>(`/purchase-orders/${id}`, body);
export const approvePo = (id: string) =>
  postData<PurchaseOrderPayload>(`/purchase-orders/${id}/approve`);
export const sendPo = (id: string) =>
  postData<PurchaseOrderPayload>(`/purchase-orders/${id}/send`);
export const reopenPo = (id: string, body: PoReasonInput) =>
  postData<PurchaseOrderPayload>(`/purchase-orders/${id}/reopen`, body);
export const cancelPo = (id: string, body: CancelPoInput) =>
  postData<PurchaseOrderPayload>(`/purchase-orders/${id}/cancel`, body);
export const shortClosePo = (id: string, body: PoReasonInput) =>
  postData<PurchaseOrderPayload>(`/purchase-orders/${id}/short-close`, body);

export type ReorderParams = { locationId?: string; q?: string };
export const reorderSuggestions = (params: ReorderParams) =>
  getData<ReorderSuggestionPayload[]>('/purchase-orders/reorder-suggestions', params);

// ─── Goods receipts ─────────────────────────────────────────────────────────────────────

export type ListGrnsParams = ListBase & {
  status?: GrnStatus;
  supplierPartyId?: string;
  locationId?: string;
  poId?: string;
};

export const listGrns = (params: ListGrnsParams): Promise<Paginated<GoodsReceiptPayload>> =>
  getPage<GoodsReceiptPayload>('/goods-receipts', params);
export const getGrn = (id: string) => getData<GoodsReceiptPayload>(`/goods-receipts/${id}`);
export const createGrn = (body: CreateGrnInput) =>
  postData<GoodsReceiptPayload>('/goods-receipts', body);
export const updateGrn = (id: string, body: UpdateGrnInput) =>
  patchData<GoodsReceiptPayload>(`/goods-receipts/${id}`, body);
export const postGrn = (id: string) =>
  postData<GoodsReceiptPayload>(`/goods-receipts/${id}/post`);
export const cancelGrn = (id: string, body: CancelGrnInput) =>
  postData<GoodsReceiptPayload>(`/goods-receipts/${id}/cancel`, body);

// ─── Purchase returns ───────────────────────────────────────────────────────────────────

export type ListPurchaseReturnsParams = ListBase & {
  supplierPartyId?: string;
  locationId?: string;
  grnId?: string;
};

export const listPurchaseReturns = (
  params: ListPurchaseReturnsParams,
): Promise<Paginated<PurchaseReturnPayload>> =>
  getPage<PurchaseReturnPayload>('/purchase-returns', params);
export const createPurchaseReturn = (body: CreatePurchaseReturnInput) =>
  postData<PurchaseReturnPayload>('/purchase-returns', body);

// ─── Supplier payments & register (Day 35) ──────────────────────────────────────────────

export type ListSupplierPaymentsParams = ListBase & {
  partyId?: string;
  method?: PaymentMethod;
  /** Only payments with an advance left on them. */
  unallocated?: boolean;
};

export const listSupplierPayments = (
  params: ListSupplierPaymentsParams,
): Promise<Paginated<SupplierPaymentPayload>> =>
  getPage<SupplierPaymentPayload>('/payments/supplier-payments', params);
export const getSupplierPayment = (id: string) =>
  getData<SupplierPaymentPayload>(`/payments/supplier-payments/${id}`);
export const postSupplierPayment = (body: SupplierPaymentInput) =>
  postData<SupplierPaymentResult>('/payments/supplier-payments', body);
export const allocateSupplierPayment = (id: string, body: AllocateSupplierPaymentInput) =>
  postData<SupplierPaymentResult>(`/payments/supplier-payments/${id}/allocate`, body);
/** Silent: it re-runs as the amount is typed; a failure shows beside the grid. */
export const payablesPreview = (partyId: string, amountMinor: number) =>
  getData<PayablesPreview>(
    '/payments/payables-preview',
    { partyId, amountMinor },
    { silent: true },
  );

export type RegisterParams = {
  from?: string;
  to?: string;
  supplierPartyId?: string;
  locationId?: string;
};
export const purchaseRegister = (params: RegisterParams) =>
  getData<PurchaseRegisterPayload>('/goods-receipts/register', params);
