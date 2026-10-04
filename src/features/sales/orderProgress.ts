import type { WholesaleOrderPayload } from '@shared/types';

/**
 * How far an order has got, in base units — the board's and the detail page's progress bars.
 *
 * Measured against what will ship: ordered less what was short-closed or cancelled. A short-closed
 * order that shipped 12 of 24 is therefore 100% shipped — the rest will never come — and its bar
 * says so rather than sitting at 50% forever. Quantities only; no money is computed here.
 */
export interface OrderProgress {
  /** Ordered − cancelled. */
  toShipBase: number;
  dispatchedBase: number;
  invoicedBase: number;
  cancelledBase: number;
  reservedBase: number;
  /** 0–1 */
  dispatched: number;
  invoiced: number;
}

export function orderProgress(o: Pick<WholesaleOrderPayload, 'lines'>): OrderProgress {
  let ordered = 0;
  let dispatchedBase = 0;
  let invoicedBase = 0;
  let cancelledBase = 0;
  let reservedBase = 0;
  for (const l of o.lines) {
    ordered += l.qtyBase;
    dispatchedBase += l.qtyDispatchedBase;
    invoicedBase += l.qtyInvoicedBase;
    cancelledBase += l.qtyCancelledBase;
    reservedBase += l.qtyReservedBase;
  }
  const toShipBase = ordered - cancelledBase;
  const ratio = (n: number) => (toShipBase > 0 ? Math.min(1, n / toShipBase) : 0);
  return {
    toShipBase,
    dispatchedBase,
    invoicedBase,
    cancelledBase,
    reservedBase,
    dispatched: ratio(dispatchedBase),
    invoiced: ratio(invoicedBase),
  };
}
