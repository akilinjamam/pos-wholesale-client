import { AlertTriangle, CheckCircle2, ShieldAlert, Wallet } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditUsage } from '@/features/dealers/credit';
import { money } from '@/features/dealers/creditMath';
import { cn } from '@/lib/utils';

import { fromMinor, toMinor } from '@shared/money';

import type { OrderCreditPosition, OrderDiscountSpec, OrderQuote } from '@shared/types';

/**
 * The builder's right-hand column: the dealer's credit against this order, and the totals. Both
 * are the server's figures, straight from the quote.
 */

/**
 * Where the dealer stands if this order goes through. The meter is exposure against the limit
 * today — not just the ledger balance: confirmed orders still to be invoiced count, and money on
 * account comes off (Day 31). The line under it is exposure *after* this order — the number the
 * confirm will be judged on.
 */
export function CreditPanel({
  credit,
  loading,
}: {
  credit: OrderCreditPosition | undefined;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wallet className="h-4 w-4" aria-hidden="true" />
          Credit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!credit ? (
          loading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <p className="text-muted-foreground">Choose a dealer and add a line.</p>
          )
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Exposure now</span>
              <CreditUsage balanceMinor={credit.exposureMinor} limitMinor={credit.limitMinor} />
            </div>
            <dl className="space-y-0.5 border-l-2 pl-3 text-xs text-muted-foreground">
              <Part label="Open invoices" minor={credit.openInvoicesMinor} />
              {credit.openOrdersMinor > 0 && (
                <Part label="Confirmed, not yet invoiced" minor={credit.openOrdersMinor} />
              )}
              {credit.unallocatedMinor > 0 && (
                <Part label="On account" minor={-credit.unallocatedMinor} />
              )}
            </dl>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">After this order</span>
              <span
                className={cn(
                  'font-medium tabular-nums',
                  credit.verdict !== 'OK' && 'text-destructive',
                )}
              >
                {money(credit.exposureAfterMinor)}
              </span>
            </div>
            {credit.shortfallMinor > 0 && credit.verdict === 'OVER_LIMIT' && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Over the limit by</span>
                <span className="font-medium tabular-nums text-destructive">
                  {money(credit.shortfallMinor)}
                </span>
              </div>
            )}
            <CreditVerdict credit={credit} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Part({ label, minor }: { label: string; minor: number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="tabular-nums">
        {minor < 0 ? '− ' : ''}
        {money(Math.abs(minor))}
      </dd>
    </div>
  );
}

function CreditVerdict({ credit }: { credit: OrderCreditPosition }) {
  if (credit.verdict === 'OK') {
    return (
      <p className="flex items-center gap-1.5 text-success">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Within the credit limit
      </p>
    );
  }
  const hold = credit.verdict === 'ON_HOLD';
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2',
        hold ? 'border-destructive/30 bg-destructive/5' : 'border-warning/30 bg-warning/10',
      )}
    >
      {hold ? (
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      )}
      <div>
        <p className={cn('font-medium', hold ? 'text-destructive' : 'text-warning')}>
          {credit.message}
        </p>
        <p className="text-xs text-muted-foreground">
          {hold
            ? 'No order can be confirmed until the hold is lifted.'
            : credit.canOverride
              ? 'You can confirm it anyway — you will be asked for a reason.'
              : 'Confirming will send it to a manager for approval.'}
        </p>
      </div>
    </div>
  );
}

type DiscountKind = 'NONE' | OrderDiscountSpec['kind'];

export function TotalsPanel({
  quote,
  loading,
  canDiscount,
  orderDiscount,
  onOrderDiscount,
  shippingMinor,
  onShipping,
  errors,
}: {
  quote: OrderQuote | undefined;
  loading: boolean;
  canDiscount: boolean;
  orderDiscount: OrderDiscountSpec | null;
  onOrderDiscount: (d: OrderDiscountSpec | null) => void;
  shippingMinor: number;
  onShipping: (minor: number) => void;
  errors: Record<string, string>;
}) {
  const kind: DiscountKind = orderDiscount?.kind ?? 'NONE';
  const value = !orderDiscount
    ? ''
    : orderDiscount.kind === 'PCT'
      ? orderDiscount.pct
      : fromMinor(orderDiscount.amountMinor);

  const setDiscount = (k: DiscountKind, raw: number | '') => {
    if (k === 'NONE' || raw === '' || raw <= 0) return onOrderDiscount(null);
    onOrderDiscount(
      k === 'PCT'
        ? { kind: 'PCT', pct: Math.min(100, raw) }
        : { kind: 'AMOUNT', amountMinor: toMinor(raw) },
    );
  };

  const row = (label: string, figure: number | undefined, strong = false) => (
    <div className={cn('flex justify-between gap-3', strong && 'text-base font-semibold')}>
      <span className={cn(!strong && 'text-muted-foreground')}>{label}</span>
      <span className="tabular-nums">
        {figure === undefined ? (loading ? '…' : '—') : money(figure)}
      </span>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Totals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {row('Subtotal', quote?.subtotalMinor)}

        {canDiscount ? (
          <div className="space-y-1.5">
            <label htmlFor="order-discount" className="block text-muted-foreground">
              Order discount
            </label>
            <div>
              <div className="flex items-center gap-1.5">
                <Select
                  value={kind}
                  onChange={(e) =>
                    setDiscount(
                      e.target.value as DiscountKind,
                      value === '' ? '' : Number(value),
                    )
                  }
                  className="h-8 w-28"
                  aria-label="Order discount type"
                >
                  <option value="NONE">None</option>
                  <option value="PCT">%</option>
                  <option value="AMOUNT">Amount</option>
                </Select>
                <Input
                  id="order-discount"
                  type="number"
                  min={0}
                  step={kind === 'PCT' ? '0.5' : '0.01'}
                  disabled={kind === 'NONE'}
                  // Committed on blur: each keystroke would re-price the whole order.
                  key={`${kind}-${String(value)}`}
                  defaultValue={value}
                  onBlur={(e) =>
                    setDiscount(kind, e.target.value === '' ? '' : Number(e.target.value))
                  }
                  aria-invalid={Boolean(errors.orderDiscount)}
                  className="h-8 flex-1 text-right tabular-nums"
                />
              </div>
            </div>
            {quote && quote.orderDiscountMinor > 0 && (
              <p className="text-right text-xs tabular-nums text-muted-foreground">
                − {money(quote.orderDiscountMinor)}, spread across the lines
              </p>
            )}
            {errors.orderDiscount && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.orderDiscount}
              </p>
            )}
          </div>
        ) : (
          quote &&
          quote.orderDiscountMinor > 0 &&
          row('Order discount', -quote.orderDiscountMinor)
        )}

        <div className="flex items-center justify-between gap-2">
          <label htmlFor="order-shipping" className="text-muted-foreground">
            Shipping
          </label>
          <Input
            id="order-shipping"
            type="number"
            min={0}
            step="0.01"
            key={shippingMinor}
            defaultValue={shippingMinor ? fromMinor(shippingMinor) : ''}
            placeholder="0"
            onBlur={(e) => onShipping(e.target.value ? toMinor(Number(e.target.value)) : 0)}
            className="h-8 w-28 text-right tabular-nums"
          />
        </div>
        {quote && quote.taxMinor > 0 && row('VAT', quote.taxMinor)}

        <div className="border-t pt-2">{row('Grand total', quote?.grandTotalMinor, true)}</div>
      </CardContent>
    </Card>
  );
}
