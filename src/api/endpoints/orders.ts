import { api, getData, getPage, patchData, postData } from '@/api/client';

import type {
  CancelOrderInput,
  ConfirmOrderInput,
  CreateOrderInput,
  OrderReasonInput,
  QuoteOrderInput,
  UpdateOrderInput,
} from '@shared/orders';
import type { FulfillmentStatus, OrderStatus } from '@shared/enums';
import type { OrderCounts, OrderQuote, Paginated, WholesaleOrderPayload } from '@shared/types';

/** Wholesale orders (Day 22 server, Day 23 builder). */

export type ListOrdersParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  status?: OrderStatus;
  fulfillmentStatus?: FulfillmentStatus;
  dealerPartyId?: string;
  locationId?: string;
};

export const listOrders = (
  params: ListOrdersParams,
): Promise<Paginated<WholesaleOrderPayload>> =>
  getPage<WholesaleOrderPayload>('/orders', params);

export const getOrder = (id: string) => getData<WholesaleOrderPayload>(`/orders/${id}`);

/**
 * Silent: the builder re-quotes on every change, and a half-typed order is routinely invalid
 * (no lines yet, a quantity of 0). The failure is shown inline beside the grid, not as a toast
 * per keystroke.
 */
export const quoteOrder = async (body: QuoteOrderInput): Promise<OrderQuote> => {
  const { data } = await api.post<{ data: OrderQuote }>('/orders/quote', body, {
    _silent: true,
  } as never);
  return data.data;
};

export const createOrder = (body: CreateOrderInput) =>
  postData<WholesaleOrderPayload>('/orders', body);
export const updateOrder = (id: string, body: UpdateOrderInput) =>
  patchData<WholesaleOrderPayload>(`/orders/${id}`, body);

/**
 * Silent: a confirm refused on credit is not an error to toast — it is a question for a manager
 * ("override, with a reason?"), and the builder asks it in a dialog. The builder toasts the other
 * refusals itself.
 */
export const confirmOrder = async (
  id: string,
  body: ConfirmOrderInput,
): Promise<WholesaleOrderPayload> => {
  const { data } = await api.post<{ data: WholesaleOrderPayload }>(
    `/orders/${id}/confirm`,
    body,
    { _silent: true } as never,
  );
  return data.data;
};

export const approveOrder = (id: string, body: OrderReasonInput) =>
  postData<WholesaleOrderPayload>(`/orders/${id}/approve`, body);
export const rejectOrder = (id: string, body: OrderReasonInput) =>
  postData<WholesaleOrderPayload>(`/orders/${id}/reject`, body);
export const cancelOrder = (id: string, body: CancelOrderInput) =>
  postData<WholesaleOrderPayload>(`/orders/${id}/cancel`, body);

// ─── Day 26 ─────────────────────────────────────────────────────────────────────────────

/** Orders per status — the board's tabs. */
export const getOrderCounts = (params: { locationId?: string }) =>
  getData<OrderCounts>('/orders/counts', params);

/** Ship what we have, forget the rest: releases what is still reserved. Needs a reason. */
export const shortCloseOrder = (id: string, body: OrderReasonInput) =>
  postData<WholesaleOrderPayload>(`/orders/${id}/short-close`, body);

/** A delivered order is done. */
export const closeOrder = (id: string) =>
  postData<WholesaleOrderPayload>(`/orders/${id}/close`, {});
