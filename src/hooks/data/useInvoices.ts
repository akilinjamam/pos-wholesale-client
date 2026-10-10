import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as api from '@/api/endpoints/invoices';

import type { ListInvoicesParams } from '@/api/endpoints/invoices';

/**
 * Invoices (Day 36b). Under the `receivables` root on purpose: every receipt, credit note and
 * return already invalidates it, so a balance shown here is never older than the last payment.
 */
export const invoiceKeys = {
  list: (p: ListInvoicesParams) => ['receivables', 'invoices', p] as const,
  activity: (id: string) => ['receivables', 'invoice-activity', id] as const,
};

export const useInvoices = (p: ListInvoicesParams) =>
  useQuery({
    queryKey: invoiceKeys.list(p),
    queryFn: () => api.listInvoices(p),
    placeholderData: keepPreviousData,
  });

export const useInvoiceActivity = (id: string | undefined) =>
  useQuery({
    queryKey: invoiceKeys.activity(id ?? ''),
    queryFn: () => api.invoiceActivity(id!),
    enabled: Boolean(id),
  });
