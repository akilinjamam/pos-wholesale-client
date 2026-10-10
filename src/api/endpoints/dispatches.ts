import { api, getData, getPage, patchData, postData } from '@/api/client';

import type {
  CancelDispatchInput,
  CreateDispatchInput,
  DeliverDispatchInput,
  PostDispatchInput,
  UpdateDispatchInput,
} from '@shared/dispatch';
import type { DispatchStatus } from '@shared/enums';
import type {
  DispatchPayload,
  DispatchPostResult,
  InvoicePayload,
  Paginated,
} from '@shared/types';

/** Challans (Day 24 server, Day 25 screens) and the invoices they raise. */

export type ListDispatchesParams = {
  page?: number;
  limit?: number;
  q?: string;
  status?: DispatchStatus;
  orderId?: string;
  dealerPartyId?: string;
  locationId?: string;
  sort?: string;
  order?: 'asc' | 'desc';
};

export const listDispatches = (
  params: ListDispatchesParams,
): Promise<Paginated<DispatchPayload>> => getPage<DispatchPayload>('/dispatches', params);
export const getDispatch = (id: string) => getData<DispatchPayload>(`/dispatches/${id}`);
export const createDispatch = (body: CreateDispatchInput) =>
  postData<DispatchPayload>('/dispatches', body);
export const updateDispatch = (id: string, body: UpdateDispatchInput) =>
  patchData<DispatchPayload>(`/dispatches/${id}`, body);
export const packDispatch = (id: string) =>
  postData<DispatchPayload>(`/dispatches/${id}/pack`, {});
/**
 * Silent, like confirming an order: a post refused on credit is a question for a manager
 * ("post anyway, with a reason?"), and the challan page asks it in a dialog. It toasts the other
 * refusals itself.
 */
export const postDispatch = async (
  id: string,
  body: PostDispatchInput = {},
): Promise<DispatchPostResult> => {
  const { data } = await api.post<{ data: DispatchPostResult }>(
    `/dispatches/${id}/post`,
    body,
    {
      _silent: true,
    } as never,
  );
  return data.data;
};
export const deliverDispatch = (id: string, body: DeliverDispatchInput) =>
  postData<DispatchPayload>(`/dispatches/${id}/deliver`, body);
export const cancelDispatch = (id: string, body: CancelDispatchInput) =>
  postData<DispatchPayload>(`/dispatches/${id}/cancel`, body);

export const getInvoice = (id: string) => getData<InvoicePayload>(`/invoices/${id}`);
export const listOrderInvoices = (orderId: string) =>
  getPage<InvoicePayload>('/invoices', {
    orderId,
    limit: 100,
    sort: 'invoiceDate',
    order: 'asc',
  });
