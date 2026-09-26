import { AxiosError } from 'axios';
import {
  ArrowDownRight,
  CheckCircle2,
  CircleDashed,
  CircleMinus,
  CircleSlash,
  Loader2,
  TrendingDown,
} from 'lucide-react';
import { useState } from 'react';

import { errorMessage, fieldErrors } from '@/api/client';
import { DealerPicker } from '@/components/common/DealerPicker';
import { ProductPicker } from '@/components/common/ProductPicker';
import { StatusPill } from '@/components/common/StatusPill';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { env } from '@/config/env';
import { cn } from '@/lib/utils';
import { useResolvedPrice } from '@/hooks/data/usePricing';
import { useVariants } from '@/hooks/data/useVariants';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { formatMoney } from '@shared/money';
import { uomOptions } from '@shared/uom';

import type { LucideIcon } from 'lucide-react';
import type {
  PartyPayload,
  PriceSource,
  PriceStepOutcome,
  ProductPayload,
} from '@shared/types';

/**
 * "What does dealer X pay for 3 dozen of this frame?" — answered by the server's pricing engine,
 * with the reasoning shown.
 *
 * Nothing is computed here. The widget sends the question to `GET /pricing/resolve` and renders
 * the answer: the same function the order builder and the counter will call on every save, so
 * the number on this card is the number an order would be priced at.
 *
 * The trace is the point. A price someone does not expect is nearly always a rule they forgot —
 * a dealer override from last year, a qty break that starts at 5 — and showing each step's
 * outcome turns "why is it ৳510?" into something the user can read off the screen.
 */

const SOURCE_LABEL: Record<PriceSource, string> = {
  DEALER: "Dealer's own price",
  TIER: "Dealer's tier",
  RETAIL: 'Retail tier',
  PRODUCT_DEFAULT: 'Product default',
};

const OUTCOME_ICON: Record<
  PriceStepOutcome,
  { icon: LucideIcon; className: string; label: string }
> = {
  MATCHED: { icon: CheckCircle2, className: 'text-success', label: 'Set the price' },
  NO_ENTRY: { icon: CircleMinus, className: 'text-muted-foreground', label: 'No price' },
  BELOW_MIN_QTY: {
    icon: ArrowDownRight,
    className: 'text-warning',
    label: 'Quantity too small',
  },
  NOT_APPLICABLE: {
    icon: CircleSlash,
    className: 'text-muted-foreground',
    label: 'Not applicable',
  },
  NOT_REACHED: {
    icon: CircleDashed,
    className: 'text-muted-foreground/60',
    label: 'Not needed',
  },
};

const money = (minor: number) => formatMoney(minor, { symbol: env.currencySymbol });

export interface PriceCheckProps {
  /** Fixes the dealer (dealer profile). Omit to let the user choose — or choose none. */
  dealer?: PartyPayload;
  /** Fixes the product (product list). Omit to let the user choose. */
  product?: ProductPayload;
  className?: string;
}

export function PriceCheck({
  dealer: fixedDealer,
  product: fixedProduct,
  className,
}: PriceCheckProps) {
  const [dealer, setDealer] = useState<PartyPayload | null>(fixedDealer ?? null);
  const [product, setProduct] = useState<ProductPayload | null>(fixedProduct ?? null);
  const [variantId, setVariantId] = useState('');
  const [uomCode, setUomCode] = useState(() => {
    const units = fixedProduct ? uomOptions(fixedProduct) : [];
    return units[units.length - 1]?.code ?? '';
  });
  const [qtyText, setQtyText] = useState('1');
  const [date, setDate] = useState('');

  const qty = useDebouncedValue(qtyText, 300);
  const qtyNumber = Number(qty);
  const qtyValid = Number.isInteger(qtyNumber) && qtyNumber >= 1;

  const { data: variants } = useVariants(
    { productId: product?.id ?? '', limit: 200 },
    Boolean(product?.hasVariants),
  );

  const params =
    product && uomCode && qtyValid
      ? {
          productId: product.id,
          ...(variantId ? { variantId } : {}),
          ...(dealer ? { partyId: dealer.id } : {}),
          uomCode,
          qty: qtyNumber,
          ...(date ? { date } : {}),
        }
      : null;

  const { data: result, error, isFetching } = useResolvedPrice(params);

  const onProduct = (next: ProductPayload | null) => {
    setProduct(next);
    setVariantId('');
    // The largest pack is how wholesale is usually quoted — a dozen or a carton, not a piece.
    const units = next ? uomOptions(next) : [];
    setUomCode(units[units.length - 1]?.code ?? '');
  };

  const units = product ? uomOptions(product) : [];
  const failure =
    error && params
      ? (fieldErrors(error)[0]?.message ??
        (error instanceof AxiosError && error.response?.status === 403
          ? 'Viewing prices needs the price:read permission.'
          : errorMessage(error)))
      : null;

  return (
    <Card className={className}>
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="text-sm font-medium">Price check</p>
          <p className="text-xs text-muted-foreground">
            The price an order would be charged, and which rule set it.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {!fixedDealer && (
            <Field
              label="Dealer"
              hint="Empty = a counter (walk-in) price."
              className="lg:col-span-3"
            >
              {(props) => (
                <DealerPicker
                  id={props.id}
                  value={dealer}
                  onChange={setDealer}
                  emptyLabel="Counter price — or search a dealer…"
                />
              )}
            </Field>
          )}
          {!fixedProduct && (
            <Field label="Product" className="lg:col-span-3">
              {(props) => <ProductPicker id={props.id} value={product} onChange={onProduct} />}
            </Field>
          )}

          {product?.hasVariants && (
            <Field label="Variant" className="lg:col-span-2">
              {(props) => (
                <Select
                  {...props}
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                >
                  <option value="">Any / whole product</option>
                  {(variants?.items ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <Field label="Unit">
            {(props) => (
              <Select
                {...props}
                value={uomCode}
                onChange={(e) => setUomCode(e.target.value)}
                disabled={units.length === 0}
              >
                {units.length === 0 && <option value="">—</option>}
                {units.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code}
                    {u.factor > 1 ? ` ×${u.factor}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Quantity"
            error={
              qtyText !== '' && !Number.isInteger(Number(qtyText)) ? 'Whole units' : undefined
            }
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                step={1}
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
              />
            )}
          </Field>

          <Field label="On date" hint="Blank = today.">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
        </div>

        {!product ? (
          <p className="text-sm text-muted-foreground">Choose a product to see its price.</p>
        ) : failure ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {failure}
          </p>
        ) : result ? (
          <div
            className={cn(
              'grid gap-4 lg:grid-cols-2',
              isFetching && 'opacity-60 transition-opacity',
            )}
            aria-live="polite"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-3xl font-semibold tabular-nums">
                  {money(result.unitPriceMinor)}
                </span>
                <span className="text-sm text-muted-foreground">per {result.uomCode}</span>
                {isFetching && (
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </div>
              <p className="text-sm">
                {result.qty} {result.uomCode} ={' '}
                <strong className="tabular-nums">{money(result.lineTotalMinor)}</strong>
                <span className="text-muted-foreground"> ({result.qtyBase} base units)</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  status={result.source}
                  tone={result.source === 'PRODUCT_DEFAULT' ? 'warning' : 'info'}
                  label={SOURCE_LABEL[result.source]}
                />
                {result.scopeName && (
                  <span className="text-sm text-muted-foreground">{result.scopeName}</span>
                )}
              </div>
              {result.discountPct > 0 && (
                <p className="text-sm text-muted-foreground">
                  List {money(result.listUnitPriceMinor)} less the dealer's {result.discountPct}
                  % trade discount.
                </p>
              )}
              {result.unpriced && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  Nothing prices this product — an order would be charged {money(0)}. Add a
                  price or a default sell price.
                </p>
              )}
              {result.nextBreak && (
                <p className="flex items-center gap-1.5 text-sm">
                  <TrendingDown className="h-4 w-4 text-success" aria-hidden="true" />
                  From {result.nextBreak.minQty} {result.nextBreak.uomCode}:{' '}
                  <strong className="tabular-nums">
                    {money(result.nextBreak.unitPriceMinor)}
                  </strong>{' '}
                  per {result.uomCode}
                </p>
              )}
            </div>

            <ol className="space-y-2" aria-label="How the price was decided">
              {result.trace.map((t, i) => {
                const o = OUTCOME_ICON[t.outcome];
                const Icon = o.icon;
                return (
                  <li key={t.step} className="flex gap-2 text-sm">
                    <Icon
                      className={cn('mt-0.5 h-4 w-4 shrink-0', o.className)}
                      aria-hidden="true"
                    />
                    <div className={cn(t.outcome === 'NOT_REACHED' && 'text-muted-foreground')}>
                      <p className="font-medium">
                        {i + 1}. {SOURCE_LABEL[t.step]}
                        <span className="sr-only"> — {o.label}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{t.note}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Resolving…
          </p>
        )}
      </CardContent>
    </Card>
  );
}
