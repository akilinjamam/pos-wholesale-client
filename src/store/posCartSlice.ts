import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { PosSaleInput } from '@shared/pos';

/**
 * The till's cart (§6.10, Day 19). Redux rather than component state because the scan bar, the
 * cart, the payment dialog and the quick keys all edit it, and because it is **persisted**: a
 * reload mid-sale — a tab closed by accident, a browser that crashed — brings the cart back as it
 * was. (A *parked* sale is different: that lives on the server, see `HeldSale`.)
 *
 * The cart holds quantities and choices, never prices. Every figure on screen comes from the
 * server's quote (`POST /pos/quote`), and the sale re-prices on the server regardless.
 *
 * `clientRef` is the sale's idempotency key. It is made when a cart starts and replaced only when a
 * sale completes, so a retry after a dropped connection resends the same key and cannot sell twice.
 */

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  sku: string;
  baseUom: string;
  packs: { code: string; factor: number }[];
  trackingMode: 'NONE' | 'LOT' | 'SERIAL';
  variantId: string | null;
  variantLabel: string | null;
  uomCode: string;
  qty: number;
  serials: string[];
  lotNo: string | null;
  lineDiscountMinor: number;
  /** Only set by someone with `order:priceOverride`. */
  unitPriceMinor?: number;
}

export type OrderDiscount =
  { kind: 'AMOUNT'; amountMinor: number } | { kind: 'PCT'; pct: number } | null;

export interface PosCartState {
  clientRef: string;
  lines: CartLine[];
  party: { id: string; name: string; isDealer: boolean } | null;
  walkInName: string;
  walkInPhone: string;
  orderDiscount: OrderDiscount;
  paymentMode: 'CASH' | 'CREDIT';
  heldSaleId: string | null;
  selectedKey: string | null;
}

const STORAGE_KEY = 'pos-wholesale.posCart';

const newRef = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const empty = (): PosCartState => ({
  clientRef: newRef(),
  lines: [],
  party: null,
  walkInName: '',
  walkInPhone: '',
  orderDiscount: null,
  paymentMode: 'CASH',
  heldSaleId: null,
  selectedKey: null,
});

function load(): PosCartState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...empty(), ...(JSON.parse(raw) as Partial<PosCartState>) } : empty();
  } catch {
    return empty();
  }
}

/** Called from a store subscription — see `app/store.ts`. */
export function persistCart(state: PosCartState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A private window: the cart simply does not survive a reload.
  }
}

/** Lines that can simply have their quantity bumped when the same item is scanned again. */
const mergeable = (l: CartLine) =>
  l.trackingMode === 'NONE' && l.unitPriceMinor === undefined && l.lineDiscountMinor === 0;

const slice = createSlice({
  name: 'posCart',
  initialState: load,
  reducers: {
    /** Scan or pick an item. The same plain item in the same unit adds to its line. */
    addLine(
      state,
      {
        payload,
      }: PayloadAction<
        Omit<CartLine, 'key' | 'serials' | 'lotNo' | 'lineDiscountMinor'> & {
          serials?: string[];
        }
      >,
    ) {
      const same = state.lines.find(
        (l) =>
          l.productId === payload.productId &&
          l.variantId === payload.variantId &&
          l.uomCode === payload.uomCode &&
          mergeable(l),
      );
      if (same && payload.trackingMode === 'NONE') {
        same.qty += payload.qty;
        state.selectedKey = same.key;
        return;
      }
      const key = newRef();
      state.lines.push({
        ...payload,
        key,
        serials: payload.serials ?? [],
        lotNo: null,
        lineDiscountMinor: 0,
      });
      state.selectedKey = key;
    },
    setQty(state, { payload }: PayloadAction<{ key: string; qty: number }>) {
      const l = state.lines.find((x) => x.key === payload.key);
      if (l && Number.isInteger(payload.qty) && payload.qty >= 1) l.qty = payload.qty;
    },
    bumpQty(state, { payload }: PayloadAction<{ key: string; delta: number }>) {
      const l = state.lines.find((x) => x.key === payload.key);
      if (l) l.qty = Math.max(1, l.qty + payload.delta);
    },
    setUom(state, { payload }: PayloadAction<{ key: string; uomCode: string }>) {
      const l = state.lines.find((x) => x.key === payload.key);
      if (l) l.uomCode = payload.uomCode;
    },
    setSerials(state, { payload }: PayloadAction<{ key: string; serials: string[] }>) {
      const l = state.lines.find((x) => x.key === payload.key);
      if (l) {
        l.serials = payload.serials;
        // A serialised line is one base unit per serial: the count is the quantity.
        if (l.trackingMode === 'SERIAL' && payload.serials.length > 0) {
          l.uomCode = l.baseUom;
          l.qty = payload.serials.length;
        }
      }
    },
    setLotNo(state, { payload }: PayloadAction<{ key: string; lotNo: string | null }>) {
      const l = state.lines.find((x) => x.key === payload.key);
      if (l) l.lotNo = payload.lotNo;
    },
    setLineDiscount(state, { payload }: PayloadAction<{ key: string; amountMinor: number }>) {
      const l = state.lines.find((x) => x.key === payload.key);
      if (l) l.lineDiscountMinor = Math.max(0, payload.amountMinor);
    },
    setPrice(
      state,
      { payload }: PayloadAction<{ key: string; unitPriceMinor: number | undefined }>,
    ) {
      const l = state.lines.find((x) => x.key === payload.key);
      if (l) l.unitPriceMinor = payload.unitPriceMinor;
    },
    removeLine(state, { payload }: PayloadAction<string>) {
      const i = state.lines.findIndex((l) => l.key === payload);
      if (i < 0) return;
      state.lines.splice(i, 1);
      state.selectedKey = state.lines[Math.min(i, state.lines.length - 1)]?.key ?? null;
    },
    selectLine(state, { payload }: PayloadAction<string | null>) {
      state.selectedKey = payload;
    },
    /** Move the selection up (−1) or down (+1) the cart. */
    moveSelection(state, { payload }: PayloadAction<1 | -1>) {
      if (state.lines.length === 0) return;
      const i = state.lines.findIndex((l) => l.key === state.selectedKey);
      const next =
        i < 0
          ? payload > 0
            ? 0
            : state.lines.length - 1
          : Math.min(state.lines.length - 1, Math.max(0, i + payload));
      state.selectedKey = state.lines[next]!.key;
    },
    setParty(state, { payload }: PayloadAction<PosCartState['party']>) {
      state.party = payload;
      if (!payload?.isDealer) state.paymentMode = 'CASH';
    },
    setWalkIn(state, { payload }: PayloadAction<{ name?: string; phone?: string }>) {
      if (payload.name !== undefined) state.walkInName = payload.name;
      if (payload.phone !== undefined) state.walkInPhone = payload.phone;
    },
    setOrderDiscount(state, { payload }: PayloadAction<OrderDiscount>) {
      state.orderDiscount = payload;
    },
    setPaymentMode(state, { payload }: PayloadAction<'CASH' | 'CREDIT'>) {
      state.paymentMode = state.party?.isDealer ? payload : 'CASH';
    },
    /** Resume a parked sale: its lines replace the cart, and the sale will delete it. */
    loadCart(
      _state,
      {
        payload,
      }: PayloadAction<
        Pick<PosCartState, 'lines' | 'party' | 'walkInName' | 'orderDiscount' | 'heldSaleId'>
      >,
    ) {
      return { ...empty(), ...payload, selectedKey: payload.lines[0]?.key ?? null };
    },
    /** After a completed sale, or "void cart": a fresh cart with a fresh idempotency key. */
    clearCart() {
      return empty();
    },
  },
});

export const posCart = slice.actions;
export default slice.reducer;

/** The cart as the API's sale/quote body expects it. */
export function toSaleLines(lines: CartLine[]): PosSaleInput['lines'] {
  return lines.map((l) => ({
    productId: l.productId,
    variantId: l.variantId,
    uomCode: l.uomCode,
    qty: l.qty,
    ...(l.serials.length ? { serials: l.serials } : {}),
    ...(l.lotNo ? { lotNo: l.lotNo } : {}),
    ...(l.lineDiscountMinor ? { lineDiscountMinor: l.lineDiscountMinor } : {}),
    ...(l.unitPriceMinor !== undefined ? { unitPriceMinor: l.unitPriceMinor } : {}),
  }));
}
