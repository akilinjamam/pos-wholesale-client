import { getParty } from '@/api/endpoints/parties';
import { getProduct } from '@/api/endpoints/products';
import { getPo } from '@/api/endpoints/purchasing';
import { emptyLine, parseSerials } from '@/features/inventory/stockLines';

import { inputFromMinor, minorFromInput, todayDay } from './purchaseFormat';

import type { LineDraft } from '@/features/inventory/stockLines';
import type { QcStatus } from '@shared/enums';
import type { CreateGrnInput, GrnLineInput } from '@shared/purchasing';
import type {
  GoodsReceiptPayload,
  PartyPayload,
  ProductPayload,
  PurchaseOrderPayload,
} from '@shared/types';

/** The goods receipt screen's state and its conversions (Day 34). */

export interface GrnLineDraft extends LineDraft {
  /** The PO line this fills; null on a direct receipt. Its item is then fixed. */
  poLineId: string | null;
  /** Major units per `uomCode`; blank keeps the PO's price (or the item's cost on a direct one). */
  unitCost: string;
  discountPct: string;
  qcStatus: QcStatus;
  /** What the PO line still expects, in base units — shown beside the quantity. */
  outstandingBase: number | null;
}

export interface GrnDraft {
  po: PurchaseOrderPayload | null;
  supplier: PartyPayload | null;
  locationId: string;
  receivedDate: string;
  supplierInvoiceNo: string;
  supplierInvoiceDate: string;
  otherCharges: string;
  note: string;
  lines: GrnLineDraft[];
}

export const emptyGrnLine = (): GrnLineDraft => ({
  ...emptyLine(),
  poLineId: null,
  unitCost: '',
  discountPct: '',
  qcStatus: 'OK',
  outstandingBase: null,
});

async function products(ids: string[]): Promise<Map<string, ProductPayload>> {
  const unique = [...new Set(ids)];
  return new Map((await Promise.all(unique.map((id) => getProduct(id)))).map((p) => [p.id, p]));
}

/** In the PO line's unit when the quantity fills it exactly, else in base units. */
function asEntered(product: ProductPayload | undefined, uomCode: string, qtyBase: number) {
  const factor =
    uomCode === product?.baseUom
      ? 1
      : (product?.packs.find((p) => p.code === uomCode)?.factor ?? 1);
  return qtyBase % factor === 0
    ? { uomCode, qty: String(qtyBase / factor) }
    : { uomCode: product?.baseUom ?? uomCode, qty: String(qtyBase) };
}

/** A new receipt against a PO: one line per PO line with something still to come. */
export async function fromPoForReceipt(
  poId: string,
  locationId: string | null,
): Promise<GrnDraft> {
  const po = await getPo(poId);
  const open = po.lines.filter((l) => l.qtyOutstandingBase > 0);
  const byId = await products(open.map((l) => l.productId));
  return {
    ...emptyGrn(locationId),
    po,
    locationId: po.locationId,
    lines: open.map((l) => ({
      ...emptyGrnLine(),
      product: byId.get(l.productId) ?? null,
      variantId: l.variantId ?? '',
      poLineId: l.id,
      outstandingBase: l.qtyOutstandingBase,
      ...asEntered(byId.get(l.productId), l.uomCode, l.qtyOutstandingBase),
    })),
  };
}

export const emptyGrn = (locationId: string | null): GrnDraft => ({
  po: null,
  supplier: null,
  locationId: locationId ?? '',
  receivedDate: todayDay(),
  supplierInvoiceNo: '',
  supplierInvoiceDate: '',
  otherCharges: '',
  note: '',
  lines: [emptyGrnLine()],
});

/** A saved draft, re-opened. */
export async function fromGrn(g: GoodsReceiptPayload): Promise<GrnDraft> {
  const [po, supplier, byId] = await Promise.all([
    g.poId ? getPo(g.poId) : Promise.resolve(null),
    g.poId ? Promise.resolve(null) : getParty('SUPPLIER', g.supplierPartyId),
    products(g.lines.map((l) => l.productId)),
  ]);
  const outstanding = new Map((po?.lines ?? []).map((l) => [l.id, l.qtyOutstandingBase]));
  return {
    po,
    supplier,
    locationId: g.locationId,
    receivedDate: localDay(g.receivedAt),
    supplierInvoiceNo: g.supplierInvoiceNo ?? '',
    supplierInvoiceDate: g.supplierInvoiceDate ?? '',
    otherCharges: inputFromMinor(g.otherChargesMinor || null),
    note: g.note ?? '',
    lines: g.lines.map((l) => ({
      ...emptyGrnLine(),
      product: byId.get(l.productId) ?? null,
      variantId: l.variantId ?? '',
      uomCode: l.uomCode,
      qty: String(l.qty),
      lotNo: l.lotNo ?? '',
      mfgDate: l.mfgDate ?? '',
      expiryDate: l.expiryDate ?? '',
      serialsText: l.serials.join('\n'),
      poLineId: l.poLineId,
      unitCost: inputFromMinor(l.unitCostMinor),
      discountPct: l.discountPct ? String(l.discountPct) : '',
      qcStatus: l.qcStatus,
      outstandingBase: l.poLineId ? (outstanding.get(l.poLineId) ?? null) : null,
    })),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A chosen day as an instant: now, if it is today; otherwise midday that day, local time. */
export function receivedAtOf(day: string): string {
  if (day === todayDay()) return new Date().toISOString();
  return new Date(`${day}T12:00:00`).toISOString();
}

function lineInput(l: GrnLineDraft, seesCost: boolean): GrnLineInput {
  const p = l.product!;
  const unitCostMinor = seesCost ? minorFromInput(l.unitCost) : undefined;
  return {
    poLineId: l.poLineId,
    productId: p.id,
    variantId: l.variantId || null,
    uomCode: l.uomCode || null,
    qty: Number(l.qty),
    ...(unitCostMinor !== undefined ? { unitCostMinor } : {}),
    ...(l.discountPct.trim() ? { discountPct: Number(l.discountPct) } : {}),
    ...(p.trackingMode === 'LOT'
      ? {
          lotNo: l.lotNo.trim() || null,
          expiryDate: l.expiryDate || null,
          mfgDate: l.mfgDate || null,
        }
      : {}),
    ...(p.trackingMode === 'SERIAL' ? { serials: parseSerials(l.serialsText) } : {}),
    qcStatus: l.qcStatus,
  };
}

/** The draft as the API takes it — header and lines; the PO is fixed once a draft exists. */
export function toGrnInput(
  d: GrnDraft,
  seesCost: boolean,
  originalDay: string | null,
): CreateGrnInput {
  const otherChargesMinor = seesCost ? minorFromInput(d.otherCharges) : undefined;
  return {
    poId: d.po?.id ?? null,
    ...(d.po ? {} : { supplierPartyId: d.supplier?.id, locationId: d.locationId || undefined }),
    ...(d.receivedDate && d.receivedDate !== originalDay
      ? { receivedAt: receivedAtOf(d.receivedDate) }
      : {}),
    supplierInvoiceNo: d.supplierInvoiceNo.trim() || null,
    supplierInvoiceDate: d.supplierInvoiceDate || null,
    ...(otherChargesMinor !== undefined ? { otherChargesMinor } : {}),
    note: d.note.trim() || null,
    lines: d.lines.filter((l) => l.product).map((l) => lineInput(l, seesCost)),
  };
}
