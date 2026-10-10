import { getParty } from '@/api/endpoints/parties';
import { getProduct } from '@/api/endpoints/products';
import { emptyLine } from '@/features/inventory/stockLines';

import { inputFromMinor, minorFromInput, todayDay } from './purchaseFormat';

import type { LineDraft } from '@/features/inventory/stockLines';
import type { CreatePoInput } from '@shared/purchasing';
import type { PartyPayload, ProductPayload, PurchaseOrderPayload } from '@shared/types';

/**
 * The PO builder's state and its conversions — apart from the component so it exports only
 * components, and so the reorder screen can seed a builder without importing it.
 */

export interface PoLineDraft extends LineDraft {
  /** Major units per `uomCode`; blank lets the server use the item's current cost. */
  unitCost: string;
  discountPct: string;
}

export interface PoDraft {
  supplier: PartyPayload | null;
  locationId: string;
  orderDate: string;
  expectedDate: string;
  paymentTermsDays: string;
  supplierRef: string;
  shipping: string;
  note: string;
  lines: PoLineDraft[];
}

export const emptyPoLine = (): PoLineDraft => ({
  ...emptyLine(),
  unitCost: '',
  discountPct: '',
});

export const emptyPo = (locationId: string | null): PoDraft => ({
  supplier: null,
  locationId: locationId ?? '',
  orderDate: todayDay(),
  expectedDate: '',
  paymentTermsDays: '',
  supplierRef: '',
  shipping: '',
  note: '',
  lines: [emptyPoLine()],
});

async function products(ids: string[]): Promise<Map<string, ProductPayload>> {
  const unique = [...new Set(ids)];
  return new Map((await Promise.all(unique.map((id) => getProduct(id)))).map((p) => [p.id, p]));
}

/** A saved draft, re-opened: its supplier's full record and each line's product. */
export async function fromPo(po: PurchaseOrderPayload): Promise<PoDraft> {
  const [supplier, byId] = await Promise.all([
    getParty('SUPPLIER', po.supplierPartyId),
    products(po.lines.map((l) => l.productId)),
  ]);
  return {
    supplier,
    locationId: po.locationId,
    orderDate: po.orderDate.slice(0, 10),
    expectedDate: po.expectedDate?.slice(0, 10) ?? '',
    paymentTermsDays: String(po.paymentTermsDays),
    supplierRef: po.supplierRef ?? '',
    shipping: inputFromMinor(po.shippingMinor || null),
    note: po.note ?? '',
    lines: po.lines.length
      ? po.lines.map((l) => ({
          ...emptyPoLine(),
          product: byId.get(l.productId) ?? null,
          variantId: l.variantId ?? '',
          uomCode: l.uomCode,
          qty: String(l.uomQty),
          unitCost: inputFromMinor(l.unitCostMinor),
          discountPct: l.discountPct ? String(l.discountPct) : '',
        }))
      : [emptyPoLine()],
  };
}

/** What the reorder screen hands the builder: a supplier and quantities in base units. */
export interface PoSeed {
  supplierPartyId: string | null;
  locationId: string | null;
  lines: { productId: string; qtyBase: number }[];
}

export async function fromSeed(
  seed: PoSeed,
  fallbackLocationId: string | null,
): Promise<PoDraft> {
  const [supplier, byId] = await Promise.all([
    seed.supplierPartyId ? getParty('SUPPLIER', seed.supplierPartyId) : Promise.resolve(null),
    products(seed.lines.map((l) => l.productId)),
  ]);
  return {
    ...emptyPo(seed.locationId ?? fallbackLocationId),
    supplier,
    paymentTermsDays: supplier?.supplier ? String(supplier.supplier.paymentTermsDays) : '',
    lines: seed.lines.map((l) => {
      const product = byId.get(l.productId) ?? null;
      // In the biggest pack the quantity fills exactly, else in base units.
      const pack = [...(product?.packs ?? [])]
        .sort((a, b) => b.factor - a.factor)
        .find((p) => l.qtyBase % p.factor === 0);
      return {
        ...emptyPoLine(),
        product,
        uomCode: pack?.code ?? product?.baseUom ?? '',
        qty: String(pack ? l.qtyBase / pack.factor : l.qtyBase),
      };
    }),
  };
}

/** The draft as the API takes it. Rows without a product are dropped; the server checks the rest. */
export function toPoInput(d: PoDraft, seesCost: boolean): CreatePoInput {
  const shippingMinor = minorFromInput(d.shipping);
  return {
    supplierPartyId: d.supplier?.id ?? '',
    locationId: d.locationId,
    orderDate: d.orderDate || undefined,
    expectedDate: d.expectedDate || null,
    ...(d.paymentTermsDays.trim() ? { paymentTermsDays: Number(d.paymentTermsDays) } : {}),
    supplierRef: d.supplierRef.trim() || null,
    note: d.note.trim() || null,
    ...(seesCost && shippingMinor !== undefined ? { shippingMinor } : {}),
    lines: d.lines
      .filter((l) => l.product)
      .map((l) => {
        const unitCostMinor = seesCost ? minorFromInput(l.unitCost) : undefined;
        return {
          productId: l.product!.id,
          variantId: l.variantId || null,
          uomCode: l.uomCode || null,
          qty: Number(l.qty),
          ...(unitCostMinor !== undefined ? { unitCostMinor } : {}),
          ...(l.discountPct.trim() ? { discountPct: Number(l.discountPct) } : {}),
        };
      }),
  };
}
