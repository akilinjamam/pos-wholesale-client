import { getData, getPage } from '@/api/client';

import type { PaymentStatus, SalesChannel } from '@shared/enums';
import type { InvoiceActivity, InvoicePayload, Paginated } from '@shared/types';

/** Invoices, both channels (Day 36b): read-only — raised by sales and challans, settled by money. */

export type ListInvoicesParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  channel?: SalesChannel;
  partyId?: string;
  paymentStatus?: PaymentStatus;
  /** Only those with something still owed. */
  open?: boolean;
  from?: string;
  to?: string;
};

export const listInvoices = (p: ListInvoicesParams): Promise<Paginated<InvoicePayload>> =>
  getPage<InvoicePayload>('/invoices', p);
export const invoiceActivity = (id: string) =>
  getData<InvoiceActivity>(`/invoices/${id}/activity`);
