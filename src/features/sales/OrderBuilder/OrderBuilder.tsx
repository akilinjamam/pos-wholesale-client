import { CheckCircle2, Loader2, Save, ShoppingCart, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { errorCode, errorDetails, errorMessage, fieldErrors } from '@/api/client';
import { DealerPicker } from '@/components/common/DealerPicker';
import { PageHeader } from '@/components/common/PageHeader';
import { ProductPicker } from '@/components/common/ProductPicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { VariantDialog } from '@/features/counter/Sale/SaleDialogs';
import { HoldBanner } from '@/features/dealers/credit';
import { useCan } from '@/hooks/data/useAuth';
import { useMyLocations } from '@/hooks/data/useLocations';
import {
  useCancelOrder,
  useConfirmOrder,
  useOrderQuote,
  useSaveOrder,
} from '@/hooks/data/useOrders';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { ReasonDialog } from '../ReasonDialog';

import { lineFor, sameItem, toOrderInput } from './orderBuilder';
import { OrderLinesGrid } from './OrderLinesGrid';
import { CreditPanel, TotalsPanel } from './OrderSidePanels';

import type { BuilderLine, BuilderProduct, BuilderState } from './orderBuilder';
import type { WholesaleOrderPayload } from '@shared/types';

/**
 * The order builder (§11 Sales, Day 23): take a dealer's order, see it priced, see what is in stock,
 * see where the dealer stands on credit — and confirm it.
 *
 * Every figure is the server's. The builder sends the order as it stands to `POST /orders/quote`
 * (debounced) and renders what comes back: resolved prices and where they came from, totals with
 * the order discount prorated, availability at the chosen warehouse, and the credit verdict. Save
 * and confirm send the very same body, so what was on screen is what is stored.
 *
 * Keys: Ctrl+S saves the draft, Ctrl+Enter confirms.
 */

export interface OrderBuilderProps {
  /** The saved draft being edited, or null for a new order. */
  order: WholesaleOrderPayload | null;
  initial: BuilderState;
}

type Modal =
  | { kind: 'variant'; product: BuilderProduct }
  | { kind: 'override' }
  | { kind: 'discard' }
  | null;

const SELLS_FROM = new Set(['WAREHOUSE', 'COUNTER']);

export function OrderBuilder({ order, initial }: OrderBuilderProps) {
  const navigate = useNavigate();
  const can = useCan();
  const canOverride = can('order:priceOverride');
  const canDiscount = can('order:discount');
  const canConfirm = can('order:confirm');

  const [state, setState] = useState<BuilderState>(initial);
  const [modal, setModal] = useState<Modal>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLDivElement>(null);

  const locations = useMyLocations();
  const sellable = (locations.data ?? []).filter((l) => SELLS_FROM.has(l.type) && l.isActive);

  const save = useSaveOrder();
  const confirm = useConfirmOrder();
  const cancel = useCancelOrder();
  const busy = save.isPending || confirm.isPending || cancel.isPending;

  // ── What the server is asked to price, and what was last saved ──
  const input = useMemo(() => toOrderInput(state), [state]);
  const inputJson = JSON.stringify(input);
  const [savedJson, setSavedJson] = useState(() => (order ? inputJson : null));
  const dirty = inputJson !== savedJson;

  const debounced = useDebouncedValue(input, 300);
  const quote = useOrderQuote(debounced);
  const stale = quote.isFetching || JSON.stringify(debounced) !== inputJson;
  const quoteErrors = Object.fromEntries(
    fieldErrors(quote.error).map((f) => [f.path, f.message]),
  );
  const errors = { ...quoteErrors, ...saveErrors };
  const quoteProblem =
    quote.error && fieldErrors(quote.error).length === 0 ? errorMessage(quote.error) : null;
  const q = quote.data;

  // ── Editing ──
  const patch = (p: Partial<BuilderState>) => {
    setSaveErrors({});
    setState((s) => ({ ...s, ...p }));
  };
  const changeLine = (key: number, p: Partial<BuilderLine>) =>
    patch({ lines: state.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) });
  const removeLine = (key: number) =>
    patch({ lines: state.lines.filter((l) => l.key !== key) });

  const focusSearch = () =>
    requestAnimationFrame(() => searchRef.current?.querySelector('input')?.focus());

  /** Add a product — or, if it is already on the order, one more of it. */
  const addLine = (product: BuilderProduct, variant: { id: string; label: string } | null) => {
    const existing = state.lines.find((l) => sameItem(l, product.id, variant?.id ?? null));
    if (existing) {
      changeLine(existing.key, { qty: existing.qty + 1 });
      toast.info(
        `${product.sku} is already on the order — quantity raised to ${existing.qty + 1}`,
      );
    } else {
      patch({ lines: [...state.lines, lineFor(product, variant)] });
    }
    focusSearch();
  };

  // ── Save and confirm ──
  const saveDraft = async (): Promise<WholesaleOrderPayload | null> => {
    if (!input) {
      toast.error('Choose a dealer and a warehouse first');
      return null;
    }
    try {
      const saved = await save.mutateAsync({ id: order?.id ?? null, body: input });
      setSavedJson(inputJson);
      setSaveErrors({});
      return saved;
    } catch (error) {
      const fields = fieldErrors(error);
      if (fields.length) {
        setSaveErrors(Object.fromEntries(fields.map((f) => [f.path, f.message])));
        toast.error('The order has problems — see the highlighted lines');
      }
      return null;
    }
  };

  const onSave = async () => {
    const saved = await saveDraft();
    if (!saved) return;
    toast.success('Draft saved');
    if (!order) navigate(`/sales/orders/${saved.id}`, { replace: true });
  };

  const runConfirm = async (creditOverrideReason?: string) => {
    // Always confirm what is on screen: save first when anything changed (or nothing is saved yet).
    const saved = !order || dirty ? await saveDraft() : order;
    if (!saved) return;
    try {
      const result = await confirm.mutateAsync({
        id: saved.id,
        body: creditOverrideReason ? { creditOverrideReason } : {},
      });
      setModal(null);
      if (result.status === 'PENDING_APPROVAL') {
        toast.warning('Over the credit limit — sent to a manager for approval');
      } else {
        toast.success(`${result.docNo} confirmed — stock reserved`);
      }
      navigate(`/sales/orders/${result.id}`, { replace: true });
    } catch (error) {
      if (!order) navigate(`/sales/orders/${saved.id}`, { replace: true });
      if (
        errorCode(error) === 'CREDIT_LIMIT_EXCEEDED' &&
        errorDetails(error).canOverride === true
      ) {
        setModal({ kind: 'override' });
        return;
      }
      setModal(null);
      toast.error(errorMessage(error));
    }
  };

  // ── Why Confirm is unavailable, if it is — the server re-checks all of it ──
  const shortLines = q?.lines.filter((l) => l.qtyBase > l.availableBase).length ?? 0;
  const blocker = !state.dealer
    ? 'Choose a dealer'
    : state.lines.length === 0
      ? 'Add at least one line'
      : quote.error
        ? 'Fix the problems on the order first'
        : q?.credit.verdict === 'ON_HOLD'
          ? 'The dealer is on credit hold'
          : shortLines > 0
            ? `${shortLines} line${shortLines > 1 ? 's' : ''} short of stock`
            : null;

  // Keyboard: Ctrl+S saves, Ctrl+Enter confirms — unless a dialog owns the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal || busy || !(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void onSave();
      } else if (e.key === 'Enter' && !blocker && canConfirm) {
        e.preventDefault();
        void runConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const dealer = state.dealer;
  const addresses = dealer?.addresses ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ShoppingCart}
        title={order ? `Draft order${dirty ? ' — unsaved changes' : ''}` : 'New order'}
        description="Prices, availability and credit come from the server as you type."
        actions={
          <>
            {order && (
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => setModal({ kind: 'discard' })}
              >
                <Trash2 aria-hidden="true" />
                Discard draft
              </Button>
            )}
            <Button variant="outline" disabled={busy || !input} onClick={() => void onSave()}>
              {save.isPending && !confirm.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              Save draft
            </Button>
            {canConfirm && (
              <Button
                disabled={busy || Boolean(blocker)}
                title={blocker ?? 'Ctrl+Enter'}
                onClick={() => void runConfirm()}
              >
                {confirm.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 aria-hidden="true" />
                )}
                Confirm order
              </Button>
            )}
          </>
        }
      />

      {dealer && <HoldBanner party={dealer} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {/* ── Who, from where, by when ── */}
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              <Field label="Dealer" required error={errors.dealerPartyId}>
                {(props) => (
                  <DealerPicker
                    id={props.id}
                    value={dealer}
                    onChange={(d) => patch({ dealer: d, shippingAddressId: null })}
                    emptyLabel="Search dealers by name, code or phone…"
                  />
                )}
              </Field>
              <Field label="Ship from" required error={errors.locationId}>
                {(props) => (
                  <Select
                    {...props}
                    value={state.locationId}
                    onChange={(e) => patch({ locationId: e.target.value })}
                  >
                    <option value="">Choose a warehouse…</option>
                    {sellable.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Required by" error={errors.requiredDate}>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={state.requiredDate}
                    onChange={(e) => patch({ requiredDate: e.target.value })}
                  />
                )}
              </Field>
              <Field
                label="Ship to"
                error={errors.shippingAddressId}
                hint={
                  order?.shippingAddress && !state.shippingAddressId
                    ? `Currently: ${order.shippingAddress}`
                    : undefined
                }
              >
                {(props) => (
                  <Select
                    {...props}
                    value={state.shippingAddressId ?? ''}
                    disabled={addresses.length === 0}
                    onChange={(e) => patch({ shippingAddressId: e.target.value || null })}
                  >
                    <option value="">
                      {addresses.length === 0
                        ? 'No address on file'
                        : order
                          ? 'Keep as saved'
                          : "Dealer's default"}
                    </option>
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} — {[a.line1, a.city].filter(Boolean).join(', ')}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </CardContent>
          </Card>

          {/* ── Lines ── */}
          <div className="space-y-3">
            <div ref={searchRef} className="max-w-xl">
              <ProductPicker
                value={null}
                disabled={!dealer || !state.locationId}
                placeholder={
                  dealer && state.locationId
                    ? 'Add a product — search name or SKU…'
                    : 'Choose a dealer and a warehouse to add products'
                }
                onChange={(p) => {
                  if (!p) return;
                  if (p.hasVariants) setModal({ kind: 'variant', product: p });
                  else addLine(p, null);
                }}
              />
            </div>
            <OrderLinesGrid
              lines={state.lines}
              quote={q}
              stale={stale}
              errors={errors}
              canOverride={canOverride}
              canDiscount={canDiscount}
              onChange={changeLine}
              onRemove={removeLine}
            />
            {quoteProblem && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {quoteProblem}
              </p>
            )}
            {errors.lines && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {errors.lines}
              </p>
            )}
          </div>

          <Field label="Note" error={errors.note}>
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                maxLength={500}
                value={state.note}
                onChange={(e) => patch({ note: e.target.value })}
                placeholder="For the dispatch desk — delivery instructions, who to call"
              />
            )}
          </Field>
        </div>

        {/* ── Credit and totals, alongside ── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <CreditPanel credit={q?.credit} loading={quote.isFetching} />
          <TotalsPanel
            quote={q}
            loading={quote.isFetching}
            canDiscount={canDiscount}
            orderDiscount={state.orderDiscount}
            onOrderDiscount={(d) => patch({ orderDiscount: d })}
            shippingMinor={state.shippingMinor}
            onShipping={(m) => patch({ shippingMinor: m })}
            errors={errors}
          />
          {blocker && state.lines.length > 0 && (
            <p className="text-sm text-muted-foreground">{blocker}.</p>
          )}
        </div>
      </div>

      {modal?.kind === 'variant' && (
        <VariantDialog
          productId={modal.product.id}
          productName={modal.product.name}
          onPick={(v) => {
            setModal(null);
            addLine(modal.product, { id: v.id, label: v.label });
          }}
          onClose={() => {
            setModal(null);
            focusSearch();
          }}
        />
      )}
      {modal?.kind === 'override' && (
        <ReasonDialog
          title="Confirm over the credit limit?"
          description={
            q?.credit.message
              ? `${q.credit.message}. You can lend past it — say why; the reason is kept on the order.`
              : 'This order takes the dealer past their credit limit. Say why it should go through.'
          }
          confirmLabel="Override and confirm"
          pending={confirm.isPending}
          onConfirm={(reason) => void runConfirm(reason)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'discard' && order && (
        <ReasonDialog
          title="Discard this draft?"
          description="The draft is cancelled and kept on record. Nothing was reserved, so no stock moves."
          confirmLabel="Discard draft"
          optional
          destructive
          pending={cancel.isPending}
          onConfirm={(reason) =>
            cancel.mutate(
              { id: order.id, body: reason ? { reason } : {} },
              {
                onSuccess: () => {
                  toast.success('Draft discarded');
                  navigate('/sales/orders');
                },
              },
            )
          }
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
