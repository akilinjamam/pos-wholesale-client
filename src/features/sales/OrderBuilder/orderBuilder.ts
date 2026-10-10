import { getParty } from '@/api/endpoints/parties';
import { getProduct } from '@/api/endpoints/products';
import { listVariants } from '@/api/endpoints/variants';

import type { CreateOrderInput, OrderLineInput } from '@shared/orders';
import type {
  OrderDiscountSpec,
  PartyPayload,
  ProductPayload,
  WholesaleOrderPayload,
} from '@shared/types';

/**
 * The order builder's state, and its one-way conversions to and from the API.
 *
 * The state holds **choices** — dealer, products, units, quantities, and (for those permitted) an
 * override price or a discount. It holds no money that it computed: every price, discount, total
 * and availability figure on screen is read from the server's quote. That is the Day-23 rule —
 * "prices and availability shown live and never computed client-side" — and it is enforced by
 * there being nothing here to compute with.
 */

export type BuilderProduct = Pick<
  ProductPayload,
  'id' | 'name' | 'sku' | 'baseUom' | 'packs' | 'trackingMode' | 'hasVariants'
>;

export interface BuilderLine {
  /** Client-only identity, for React keys and motion. */
  key: number;
  product: BuilderProduct;
  variantId: string | null;
  variantLabel: string | null;
  uomCode: string;
  qty: number;
  /** An override, per `uomCode`, in minor units. Only sent by someone with `order:priceOverride`. */
  unitPriceMinor: number | null;
  /** An extra line discount. Only sent by someone with `order:discount`. */
  discountPct: number | null;
}

export interface BuilderState {
  dealer: PartyPayload | null;
  locationId: string;
  requiredDate: string;
  /** Null: keep what the server has (the dealer's default, or what was chosen before). */
  shippingAddressId: string | null;
  shippingMinor: number;
  orderDiscount: OrderDiscountSpec | null;
  note: string;
  lines: BuilderLine[];
}

let nextKey = 1;
export const newKey = () => nextKey++;

export const emptyBuilder = (locationId: string | null): BuilderState => ({
  dealer: null,
  locationId: locationId ?? '',
  requiredDate: '',
  shippingAddressId: null,
  shippingMinor: 0,
  orderDiscount: null,
  note: '',
  lines: [],
});

export function lineFor(
  product: BuilderProduct,
  variant: { id: string; label: string } | null = null,
): BuilderLine {
  return {
    key: newKey(),
    product,
    variantId: variant?.id ?? null,
    variantLabel: variant?.label ?? null,
    // Wholesale is ordered by the pack where there is one: a dealer asks for dozens, not pieces.
    uomCode:
      product.trackingMode === 'SERIAL'
        ? product.baseUom
        : (product.packs[0]?.code ?? product.baseUom),
    qty: 1,
    unitPriceMinor: null,
    discountPct: null,
  };
}

/** The same item twice is refused by the server ("combine them"); the builder adds to it instead. */
export const sameItem = (a: BuilderLine, productId: string, variantId: string | null) =>
  a.product.id === productId && a.variantId === variantId;

function toLineInput(l: BuilderLine): OrderLineInput {
  return {
    productId: l.product.id,
    variantId: l.variantId,
    uomCode: l.uomCode,
    qty: l.qty,
    ...(l.unitPriceMinor !== null ? { unitPriceMinor: l.unitPriceMinor } : {}),
    ...(l.discountPct ? { discountPct: l.discountPct } : {}),
  };
}

/**
 * The request body — for the quote, the save and the confirm alike, so what was priced is what is
 * saved. Null until there is a dealer and a location to price for.
 */
export function toOrderInput(s: BuilderState): CreateOrderInput | null {
  if (!s.dealer || !s.locationId) return null;
  return {
    dealerPartyId: s.dealer.id,
    locationId: s.locationId,
    lines: s.lines.map(toLineInput),
    orderDiscount: s.orderDiscount,
    shippingMinor: s.shippingMinor,
    requiredDate: s.requiredDate || null,
    note: s.note.trim() || null,
    ...(s.shippingAddressId ? { shippingAddressId: s.shippingAddressId } : {}),
  };
}

/**
 * Re-open a saved draft. The grid needs each line's full product (its units and tracking) and the
 * dealer's full record (addresses, hold), so they are loaded once, in parallel.
 */
export async function fromOrder(order: WholesaleOrderPayload): Promise<BuilderState> {
  const productIds = [...new Set(order.lines.map((l) => l.productId))];
  const variantProducts = [
    ...new Set(order.lines.filter((l) => l.variantId).map((l) => l.productId)),
  ];
  const [dealer, products, variantLists] = await Promise.all([
    getParty('DEALER', order.dealerPartyId),
    Promise.all(productIds.map((id) => getProduct(id))),
    Promise.all(variantProducts.map((productId) => listVariants({ productId, limit: 200 }))),
  ]);
  const productBy = new Map(products.map((p) => [p.id, p]));
  const variantLabel = new Map(
    variantLists.flatMap((page) => page.items).map((v) => [v.id, v.label]),
  );

  return {
    dealer,
    locationId: order.locationId,
    requiredDate: order.requiredDate?.slice(0, 10) ?? '',
    shippingAddressId: null,
    shippingMinor: order.shippingMinor,
    orderDiscount: order.orderDiscount,
    note: order.note ?? '',
    lines: order.lines.map((l) => ({
      key: newKey(),
      product: productBy.get(l.productId)!,
      variantId: l.variantId,
      variantLabel: l.variantId ? (variantLabel.get(l.variantId) ?? null) : null,
      uomCode: l.uomCode,
      qty: l.uomQty,
      unitPriceMinor: l.priceOverridden ? l.unitPriceMinor : null,
      discountPct: l.discountPct || null,
    })),
  };
}
