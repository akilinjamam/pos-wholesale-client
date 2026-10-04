import { describeQty } from '@shared/uom';

import type { DispatchLineInput, TransportInput } from '@shared/dispatch';
import type { DispatchLinePayload, DispatchPayload } from '@shared/types';

/**
 * The pick-and-pack form's state for one challan, and its conversion to the API's lines.
 *
 * A row is one challan line: an order line, how many base units, and — as the product's tracking
 * demands — the lot it comes from or the serials scanned. A lot-tracked line can be **split** into
 * several rows, one per lot, when one lot does not cover it; the server checks the rows of an
 * order line together against what is still to ship.
 */

export interface PackRow {
  key: number;
  orderLineId: string;
  qtyBase: number;
  lotNo: string;
  serials: string[];
  /** Display only — from the challan line it started as. */
  line: DispatchLinePayload;
}

let nextKey = 1;

export const rowsOf = (d: DispatchPayload): PackRow[] =>
  d.lines.map((l) => ({
    key: nextKey++,
    orderLineId: l.orderLineId,
    qtyBase: l.qtyBase,
    lotNo: l.lotNo ?? '',
    serials: l.serials,
    line: l,
  }));

/** Split a row in two, halving its quantity — for a line that ships from two lots. */
export function splitRow(rows: PackRow[], key: number): PackRow[] {
  const i = rows.findIndex((r) => r.key === key);
  const r = rows[i];
  if (!r || r.qtyBase < 2) return rows;
  const half = Math.floor(r.qtyBase / 2);
  return [
    ...rows.slice(0, i),
    { ...r, qtyBase: r.qtyBase - half },
    { ...r, key: nextKey++, qtyBase: half, lotNo: '', serials: [] },
    ...rows.slice(i + 1),
  ];
}

export function toLineInputs(rows: PackRow[]): DispatchLineInput[] {
  return rows.map((r) => ({
    orderLineId: r.orderLineId,
    qtyBase: r.qtyBase,
    ...(r.line.trackingMode === 'LOT' ? { lotNo: r.lotNo.trim() || null } : {}),
    ...(r.line.trackingMode === 'SERIAL' ? { serials: r.serials } : {}),
  }));
}

/** What still needs capturing before the challan can be packed — shown as a checklist. */
export function captureGaps(rows: PackRow[]): string[] {
  return rows.flatMap((r) => {
    const sku = r.line.sku ?? r.line.productName ?? 'a line';
    if (r.line.trackingMode === 'SERIAL' && r.serials.length !== r.qtyBase) {
      return [`${sku}: ${r.serials.length} of ${r.qtyBase} serials scanned`];
    }
    if (r.line.trackingMode === 'LOT' && !r.lotNo.trim()) return [`${sku}: which lot?`];
    return [];
  });
}

export interface TransportDraft {
  mode: TransportInput['mode'] | '';
  vehicleNo: string;
  driverName: string;
  driverPhone: string;
  courierName: string;
  trackingNo: string;
  /** Taka, as typed. */
  freight: string;
  freightPaidBy: 'US' | 'DEALER';
}

export const transportOf = (d: DispatchPayload): TransportDraft => ({
  mode: d.transport?.mode ?? '',
  vehicleNo: d.transport?.vehicleNo ?? '',
  driverName: d.transport?.driverName ?? '',
  driverPhone: d.transport?.driverPhone ?? '',
  courierName: d.transport?.courierName ?? '',
  trackingNo: d.transport?.trackingNo ?? '',
  freight: d.transport?.freightMinor ? String(d.transport.freightMinor / 100) : '',
  freightPaidBy: d.transport?.freightPaidBy ?? 'US',
});

const orNull = (s: string) => s.trim() || null;

export function toTransportInput(
  t: TransportDraft,
  toMinor: (n: number) => number,
): TransportInput | null {
  if (!t.mode) return null;
  return {
    mode: t.mode,
    vehicleNo: orNull(t.vehicleNo),
    driverName: orNull(t.driverName),
    driverPhone: orNull(t.driverPhone),
    courierName: orNull(t.courierName),
    trackingNo: orNull(t.trackingNo),
    freightMinor: t.freight ? toMinor(Number(t.freight)) : 0,
    freightPaidBy: t.freightPaidBy,
  };
}

export type BoxDraft = { boxNo: string; weightKg: string };

export const boxesInput = (boxes: BoxDraft[]) =>
  boxes
    .filter((b) => b.boxNo.trim())
    .map((b) => ({ boxNo: b.boxNo.trim(), weightKg: b.weightKg ? Number(b.weightKg) : null }));

/** 30 PCS of a DOZ×12 frame → "2 DOZ + 6 PCS": how it sits on the shelf. */
export function qtyText(l: Pick<DispatchLinePayload, 'qtyBase' | 'baseUom' | 'packs'>): string {
  if (!l.baseUom) return String(l.qtyBase);
  return describeQty(l.qtyBase, {
    baseUom: l.baseUom,
    packs: (l.packs ?? []).map((p) => ({ ...p, name: p.code })),
  });
}
