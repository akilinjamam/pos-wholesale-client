import { getData, getPage, postData } from '@/api/client';

import type { SalesChannel } from '@shared/enums';
import type { AllocateCreditNoteInput, WholesaleReturnInput } from '@shared/returns';
import type {
  CreditNotePayload,
  InvoicePayload,
  Paginated,
  ReturnableWholesaleInvoice,
  SalesReturnPayload,
  WholesaleReturnResult,
} from '@shared/types';

/** Sales returns and credit notes (Day 36). */

type ListBase = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
};

export type ListSalesReturnsParams = ListBase & {
  channel?: SalesChannel;
  partyId?: string;
  invoiceId?: string;
};
export const listSalesReturns = (
  p: ListSalesReturnsParams,
): Promise<Paginated<SalesReturnPayload>> => getPage<SalesReturnPayload>('/sales-returns', p);
export const getReturnableInvoice = (invoiceId: string) =>
  getData<ReturnableWholesaleInvoice>(`/sales-returns/invoice/${invoiceId}`);
export const postWholesaleReturn = (body: WholesaleReturnInput) =>
  postData<WholesaleReturnResult>('/sales-returns', body);

/** A dealer's posted wholesale invoices, newest first — what a return can be against. */
export const listDealerInvoices = (partyId: string, q?: string) =>
  getPage<InvoicePayload>('/invoices', {
    partyId,
    channel: 'WHOLESALE',
    limit: 50,
    sort: 'invoiceDate',
    order: 'desc',
    ...(q ? { q } : {}),
  });

export type ListCreditNotesParams = ListBase & {
  channel?: SalesChannel;
  partyId?: string;
  unallocated?: boolean;
};
export const listCreditNotes = (
  p: ListCreditNotesParams,
): Promise<Paginated<CreditNotePayload>> => getPage<CreditNotePayload>('/credit-notes', p);
export const allocateCreditNote = (id: string, body: AllocateCreditNoteInput) =>
  postData<CreditNotePayload>(`/credit-notes/${id}/allocate`, body);
