import {
  Keyboard,
  Loader2,
  PauseCircle,
  PlayCircle,
  Printer,
  Repeat,
  Store,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { errorMessage } from '@/api/client';
import { quoteCart } from '@/api/endpoints/pos';
import { getProduct } from '@/api/endpoints/products';
import { listVariants } from '@/api/endpoints/variants';
import { useAppDispatch, useAppSelector } from '@/app/store';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { useCan } from '@/hooks/data/useAuth';
import {
  useCurrentSession,
  useDiscardHeld,
  useHoldSale,
  usePostSale,
  useQuote,
} from '@/hooks/data/usePos';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { posCart, toSaleLines } from '@/store/posCartSlice';

import { PrintSettingsDialog } from '../print/PrintControls';

import { CartTable } from './CartTable';
import { PaymentDialog } from './PaymentDialog';
import {
  DoneDialog,
  HeldDialog,
  ParkDialog,
  ShortcutsDialog,
  TrackingDialog,
  VariantDialog,
} from './SaleDialogs';
import { CustomerBox, OpenShiftPanel, QuickKeys, TotalsBox } from './SalePanels';
import {
  lineFromProduct,
  loadQuickKeys,
  MAX_QUICK_KEYS,
  money,
  saveQuickKeys,
} from './saleHelpers';
import { ScanBar } from './ScanBar';

import type { QuickKey } from './saleHelpers';
import type { CartLine } from '@/store/posCartSlice';
import type { PosQuoteInput, TenderInput } from '@shared/pos';
import type {
  HeldSalePayload,
  PosSaleResult,
  ProductPayload,
  VariantPayload,
} from '@shared/types';

/**
 * The counter sale (§6.10, Day 19).
 *
 * One screen, one input in charge: focus lives in the scan bar and every dialog hands it back.
 * The global keys (F-keys, Alt+digit, Ctrl+Enter) are caught here on `window`, so they work
 * wherever focus happens to be — except inside an open dialog, which owns the keyboard.
 */

type SaleProduct = Pick<
  ProductPayload,
  'id' | 'name' | 'sku' | 'baseUom' | 'packs' | 'trackingMode'
>;

type Modal =
  | { kind: 'variant'; product: SaleProduct; uomCode?: string; qty: number }
  | { kind: 'tracking'; key: string }
  | { kind: 'pay' }
  | { kind: 'park' }
  | { kind: 'held' }
  | { kind: 'done'; result: PosSaleResult }
  | { kind: 'help' }
  | { kind: 'printer' }
  | null;

export function SaleScreen() {
  const session = useCurrentSession();
  const activeLocationId = useAppSelector((s) => s.ui.activeLocationId);

  if (session.isPending) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      </div>
    );
  }
  if (!session.data) return <OpenShiftPanel defaultLocationId={activeLocationId} />;
  return (
    <Till
      sessionLabel={`${session.data.locationName ?? 'Counter'} · till ${session.data.terminalCode}`}
    />
  );
}

function Till({ sessionLabel }: { sessionLabel: string }) {
  const dispatch = useAppDispatch();
  const cart = useAppSelector((s) => s.posCart);
  const can = useCan();
  const canDiscount = can('pos:discount');

  const scanRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [quickKeys, setQuickKeys] = useState<QuickKey[]>(loadQuickKeys);
  const [payError, setPayError] = useState<string | null>(null);

  const postSale = usePostSale();
  const holdSale = useHoldSale();
  const discardHeld = useDiscardHeld();

  const focusScan = useCallback(
    () => requestAnimationFrame(() => scanRef.current?.focus()),
    [],
  );
  const close = useCallback(() => {
    setModal(null);
    focusScan();
  }, [focusScan]);

  // ── Quote: the server prices the cart as it changes (debounced; the last good quote stays up) ──
  const quoteBody = useMemo<PosQuoteInput | null>(
    () =>
      cart.lines.length
        ? {
            lines: toSaleLines(cart.lines),
            ...(cart.party ? { partyId: cart.party.id } : {}),
            ...(cart.orderDiscount ? { orderDiscount: cart.orderDiscount } : {}),
          }
        : null,
    [cart.lines, cart.party, cart.orderDiscount],
  );
  const debouncedBody = useDebouncedValue(quoteBody, 150);
  const quote = useQuote(debouncedBody);
  const quoteData = cart.lines.length ? quote.data : undefined;
  const quoteStale = quoteBody !== debouncedBody || quote.isFetching || quote.isPlaceholderData;
  const quoteError = quote.error && cart.lines.length ? errorMessage(quote.error) : null;

  const selected = cart.lines.find((l) => l.key === cart.selectedKey) ?? null;
  const needsCapture = (quoteData?.lines ?? []).some((l) => l.needs);

  // ── Adding ──
  const addProduct = useCallback(
    (
      product: SaleProduct,
      variant: Pick<VariantPayload, 'id' | 'label'> | null,
      uomCode: string | undefined,
      qty: number,
      hasVariants: boolean,
    ) => {
      if (hasVariants && !variant) {
        setModal({ kind: 'variant', product, uomCode, qty });
        return;
      }
      dispatch(
        posCart.addLine(
          lineFromProduct(product, {
            variantId: variant?.id ?? null,
            variantLabel: variant?.label ?? null,
            uomCode,
            qty,
          }),
        ),
      );
      setModal(null);
      focusScan();
    },
    [dispatch, focusScan],
  );

  // A tracked line cannot be sold until its serials / lot are known. It becomes the selection when
  // added, so ask for them right then, while the item is in hand.
  const lastCount = useRef(cart.lines.length);
  useEffect(() => {
    if (
      cart.lines.length > lastCount.current &&
      selected &&
      selected.trackingMode !== 'NONE' &&
      !selected.serials.length &&
      !selected.lotNo
    ) {
      setModal({ kind: 'tracking', key: selected.key });
    }
    lastCount.current = cart.lines.length;
  }, [cart.lines.length, selected]);

  const pressQuickKey = useCallback(
    (k: QuickKey) => addProduct(k, null, undefined, 1, k.hasVariants),
    [addProduct],
  );

  const pinSelected = async () => {
    if (!selected || quickKeys.some((k) => k.id === selected.productId)) return;
    if (quickKeys.length >= MAX_QUICK_KEYS)
      return toast.error(`Up to ${MAX_QUICK_KEYS} quick keys — unpin one first.`);
    try {
      const p = await getProduct(selected.productId);
      const next = [
        ...quickKeys,
        {
          id: p.id,
          name: p.name,
          sku: p.sku,
          baseUom: p.baseUom,
          packs: p.packs,
          trackingMode: p.trackingMode,
          hasVariants: p.hasVariants,
        },
      ];
      setQuickKeys(next);
      saveQuickKeys(next);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const unpin = (id: string) => {
    const next = quickKeys.filter((k) => k.id !== id);
    setQuickKeys(next);
    saveQuickKeys(next);
  };

  // ── Paying ──
  const openPay = useCallback(() => {
    if (!cart.lines.length) return;
    if (!quoteData || quoteStale) return toast.info('Pricing the cart — one moment.');
    if (quoteError) return toast.error(quoteError);
    const pending = quoteData.lines.findIndex((l) => l.needs);
    if (pending >= 0) {
      const line = cart.lines[pending]!;
      dispatch(posCart.selectLine(line.key));
      setModal({ kind: 'tracking', key: line.key });
      return;
    }
    setPayError(null);
    setModal({ kind: 'pay' });
  }, [cart.lines, dispatch, quoteData, quoteError, quoteStale]);

  const complete = (tenders: TenderInput[]) => {
    setPayError(null);
    postSale.mutate(
      {
        clientRef: cart.clientRef,
        paymentMode: cart.paymentMode,
        ...(cart.party ? { partyId: cart.party.id } : {}),
        ...(cart.walkInName.trim() ? { walkInName: cart.walkInName.trim() } : {}),
        ...(cart.walkInPhone.trim() ? { walkInPhone: cart.walkInPhone.trim() } : {}),
        lines: toSaleLines(cart.lines),
        ...(cart.orderDiscount ? { orderDiscount: cart.orderDiscount } : {}),
        tenders,
        ...(cart.heldSaleId ? { heldSaleId: cart.heldSaleId } : {}),
      },
      {
        onSuccess: (result) => {
          // The cart is sold: clear it now, not when "New sale" is pressed — a cashier who walks
          // away from the done screen must not come back to a sold cart (and its spent key).
          dispatch(posCart.clearCart());
          setModal({ kind: 'done', result });
        },
        onError: (e) => setPayError(errorMessage(e)),
      },
    );
  };

  const nextSale = () => close();

  // ── Park & resume ──
  const openPark = useCallback(() => {
    if (cart.lines.length) setModal({ kind: 'park' });
  }, [cart.lines.length]);

  const park = (label: string) =>
    holdSale.mutate(
      {
        label,
        partyId: cart.party?.id ?? null,
        walkInName: cart.walkInName.trim() || null,
        lines: toSaleLines(cart.lines),
        ...(cart.orderDiscount ? { orderDiscount: cart.orderDiscount } : {}),
      },
      {
        onSuccess: () => {
          // The parked copy replaces the one this cart was resumed from, if any.
          if (cart.heldSaleId) discardHeld.mutate(cart.heldSaleId);
          dispatch(posCart.clearCart());
          close();
        },
      },
    );

  const resume = async (h: HeldSalePayload) => {
    if (cart.lines.length && !window.confirm('Replace the current cart with this parked sale?'))
      return;
    try {
      const ids = [...new Set(h.lines.map((l) => l.productId))];
      const products = new Map((await Promise.all(ids.map(getProduct))).map((p) => [p.id, p]));
      const variantIds = new Set(h.lines.map((l) => l.variantId).filter(Boolean));
      const labels = new Map<string, string>();
      for (const p of products.values()) {
        if (!p.hasVariants) continue;
        const { items } = await listVariants({ productId: p.id, limit: 200 });
        for (const v of items) if (variantIds.has(v.id)) labels.set(v.id, v.label);
      }
      const lines: CartLine[] = h.lines.map((l) => {
        const p = products.get(l.productId)!;
        return {
          ...lineFromProduct(p, {
            variantId: l.variantId ?? null,
            variantLabel: l.variantId ? (labels.get(l.variantId) ?? null) : null,
            uomCode: l.uomCode ?? undefined,
            qty: l.qty,
          }),
          key: crypto.randomUUID(),
          serials: l.serials ?? [],
          lotNo: l.lotNo ?? null,
          lineDiscountMinor: l.lineDiscountMinor ?? 0,
          ...(l.unitPriceMinor !== undefined ? { unitPriceMinor: l.unitPriceMinor } : {}),
        };
      });
      // The quote knows the party's name and whether it is a dealer — no separate lookup needed.
      const party = h.partyId
        ? await quoteCart({ partyId: h.partyId, lines: toSaleLines(lines) })
            .then((q) =>
              q.customer
                ? { id: q.customer.id, name: q.customer.name, isDealer: q.customer.isDealer }
                : null,
            )
            .catch(() => null)
        : null;
      dispatch(
        posCart.loadCart({
          lines,
          party,
          walkInName: h.walkInName ?? '',
          orderDiscount: h.orderDiscount,
          heldSaleId: h.id,
        }),
      );
      close();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ── Global keys ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal) return; // a dialog owns the keyboard
      const inField =
        e.target instanceof HTMLElement && e.target.matches('input, textarea, select');
      if (e.key === 'F2' || (e.key === '/' && !inField)) {
        e.preventDefault();
        scanRef.current?.focus();
      } else if (e.key === 'F1') {
        e.preventDefault();
        setModal({ kind: 'help' });
      } else if (e.key === 'F3') {
        e.preventDefault();
        if (selected && selected.trackingMode !== 'NONE')
          setModal({ kind: 'tracking', key: selected.key });
      } else if (e.key === 'F4') {
        e.preventDefault();
        customerRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        openPark();
      } else if (e.key === 'F9') {
        e.preventDefault();
        setModal({ kind: 'held' });
      } else if (e.key === 'F10' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        openPay();
      } else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        const k = quickKeys[Number(e.code.slice(5)) - 1];
        if (k) pressQuickKey(k);
      } else if (e.key === 'Escape' && inField && e.target !== scanRef.current) {
        scanRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, openPark, openPay, pressQuickKey, quickKeys, selected]);

  const onCartKey = (key: 'up' | 'down' | 'plus' | 'minus' | 'delete') => {
    if (key === 'up' || key === 'down')
      return void dispatch(posCart.moveSelection(key === 'up' ? -1 : 1));
    if (!selected) return;
    if (key === 'delete') dispatch(posCart.removeLine(selected.key));
    else if (selected.trackingMode === 'SERIAL' && selected.serials.length)
      setModal({ kind: 'tracking', key: selected.key });
    else dispatch(posCart.bumpQty({ key: selected.key, delta: key === 'plus' ? 1 : -1 }));
  };

  const trackingLine =
    modal?.kind === 'tracking' ? cart.lines.find((l) => l.key === modal.key) : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Counter sale"
        description={sessionLabel}
        icon={Store}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModal({ kind: 'printer' })}>
              <Printer aria-hidden="true" />
              Printer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setModal({ kind: 'help' })}>
              <Keyboard aria-hidden="true" />
              Shortcuts (F1)
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-3">
          <ScanBar
            ref={scanRef}
            disabled={postSale.isPending}
            onAdd={({ product, variant, uomCode, qty }) =>
              addProduct(product, variant, uomCode, qty, product.hasVariants)
            }
            onCartKey={onCartKey}
          />
          {cart.heldSaleId && (
            <p className="text-xs text-muted-foreground">
              Resumed from a parked sale — completing it removes the parked copy.
            </p>
          )}
          <CartTable
            lines={cart.lines}
            quote={quoteData}
            quoteStale={quoteStale}
            selectedKey={cart.selectedKey}
            canDiscount={canDiscount}
            onSelect={(key) => dispatch(posCart.selectLine(key))}
            onQty={(key, qty) => dispatch(posCart.setQty({ key, qty }))}
            onUom={(key, uomCode) => dispatch(posCart.setUom({ key, uomCode }))}
            onDiscount={(key, amountMinor) =>
              dispatch(posCart.setLineDiscount({ key, amountMinor }))
            }
            onCapture={(key) => setModal({ kind: 'tracking', key })}
            onRemove={(key) => {
              dispatch(posCart.removeLine(key));
              focusScan();
            }}
          />
        </div>

        <aside className="space-y-3">
          <CustomerBox
            ref={customerRef}
            party={cart.party}
            walkInName={cart.walkInName}
            walkInPhone={cart.walkInPhone}
            paymentMode={cart.paymentMode}
            balanceMinor={quoteData?.customer?.balanceMinor ?? null}
            onParty={(p) => dispatch(posCart.setParty(p))}
            onWalkIn={(v) => dispatch(posCart.setWalkIn(v))}
            onMode={(m) => dispatch(posCart.setPaymentMode(m))}
            onDone={focusScan}
          />
          {cart.exchange && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
              <Repeat className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                Exchange credit <span className="font-mono">{cart.exchange.docNo}</span>
              </span>
              <span className="font-semibold tabular-nums">
                {money(cart.exchange.amountMinor)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => dispatch(posCart.setExchange(null))}
                aria-label="Take the exchange credit off this sale"
              >
                <X />
              </Button>
            </div>
          )}
          <TotalsBox
            quote={quoteData}
            stale={quoteStale}
            error={quoteError}
            canDiscount={canDiscount}
            orderDiscount={cart.orderDiscount}
            onOrderDiscount={(d) => dispatch(posCart.setOrderDiscount(d))}
          />
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              onClick={openPark}
              disabled={!cart.lines.length}
              className="h-auto flex-col gap-0.5 py-2"
            >
              <PauseCircle aria-hidden="true" />
              <span className="text-xs">Park · F8</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setModal({ kind: 'held' })}
              className="h-auto flex-col gap-0.5 py-2"
            >
              <PlayCircle aria-hidden="true" />
              <span className="text-xs">Resume · F9</span>
            </Button>
            <Button
              onClick={openPay}
              disabled={!cart.lines.length || Boolean(quoteError)}
              className="h-auto flex-col gap-0.5 py-2"
            >
              <Wallet aria-hidden="true" />
              <span className="text-xs">{needsCapture ? 'Needs info' : 'Pay · F10'}</span>
            </Button>
          </div>
          <QuickKeys
            keys={quickKeys}
            onPress={pressQuickKey}
            onUnpin={unpin}
            canPinSelected={
              Boolean(selected) && !quickKeys.some((k) => k.id === selected?.productId)
            }
            onPinSelected={() => void pinSelected()}
          />
        </aside>
      </div>

      {modal?.kind === 'variant' && (
        <VariantDialog
          productId={modal.product.id}
          productName={modal.product.name}
          onPick={(v) => addProduct(modal.product, v, modal.uomCode, modal.qty, true)}
          onClose={close}
        />
      )}
      {trackingLine && (
        <TrackingDialog
          line={trackingLine}
          onSerials={(serials) => {
            dispatch(posCart.setSerials({ key: trackingLine.key, serials }));
            close();
          }}
          onLot={(lotNo) => {
            dispatch(posCart.setLotNo({ key: trackingLine.key, lotNo }));
            close();
          }}
          onClose={close}
        />
      )}
      {modal?.kind === 'pay' && quoteData && (
        <PaymentDialog
          totalMinor={quoteData.totalMinor}
          paymentMode={cart.paymentMode}
          customerName={cart.party?.name ?? (cart.walkInName.trim() || null)}
          exchange={cart.exchange}
          pending={postSale.isPending}
          error={payError}
          onComplete={complete}
          onClose={close}
        />
      )}
      {modal?.kind === 'park' && (
        <ParkDialog onPark={park} onClose={close} pending={holdSale.isPending} />
      )}
      {modal?.kind === 'held' && (
        <HeldDialog
          onResume={(h) => void resume(h)}
          onDiscard={(id) => discardHeld.mutate(id)}
          onClose={close}
        />
      )}
      {modal?.kind === 'done' && <DoneDialog result={modal.result} onNext={nextSale} />}
      {modal?.kind === 'help' && <ShortcutsDialog onClose={close} />}
      {modal?.kind === 'printer' && <PrintSettingsDialog onClose={close} />}
    </div>
  );
}
