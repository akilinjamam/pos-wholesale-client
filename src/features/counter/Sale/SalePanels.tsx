import { Pin, PinOff, Store, UserRound, X } from 'lucide-react';
import { forwardRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useCustomerSearch, useOpenSession } from '@/hooks/data/usePos';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { LocationFilter } from '../../inventory/LocationFilter';

import { money } from './saleHelpers';

import { toMinor } from '@shared/money';

import type { QuickKey } from './saleHelpers';
import type { OrderDiscount, PosCartState } from '@/store/posCartSlice';
import type { PosQuote } from '@shared/types';

// ─── Customer ───────────────────────────────────────────────────────────────────────────

/**
 * Who is buying: nobody in particular (a walk-in, optionally named for the receipt), a counter
 * customer, or a dealer — whose own tier prices then apply automatically (§9), and who may take
 * the unpaid part on account.
 */
export const CustomerBox = forwardRef<
  HTMLInputElement,
  {
    party: PosCartState['party'];
    walkInName: string;
    walkInPhone: string;
    paymentMode: 'CASH' | 'CREDIT';
    balanceMinor: number | null;
    onParty: (p: PosCartState['party']) => void;
    onWalkIn: (v: { name?: string; phone?: string }) => void;
    onMode: (m: 'CASH' | 'CREDIT') => void;
    onDone: () => void;
  }
>(function CustomerBox(
  {
    party,
    walkInName,
    walkInPhone,
    paymentMode,
    balanceMinor,
    onParty,
    onWalkIn,
    onMode,
    onDone,
  },
  ref,
) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const q = useDebouncedValue(text, 250);
  const { data } = useCustomerSearch(q);
  const results = text.trim().length >= 2 ? (data ?? []) : [];

  const pick = (i: number) => {
    const p = results[i];
    if (!p) return;
    onParty({ id: p.id, name: p.displayName ?? p.name, isDealer: p.roles.includes('DEALER') });
    setText('');
    onDone();
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <UserRound className="h-4 w-4" aria-hidden="true" />
          Customer <kbd className="ml-auto rounded border px-1 font-mono text-[10px]">F4</kbd>
        </p>
        {party ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{party.name}</span>
              {party.isDealer && <Badge variant="secondary">dealer</Badge>}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onParty(null)}
                aria-label="Remove customer"
              >
                <X />
              </Button>
            </div>
            {party.isDealer && (
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>
                  On account (credit)
                  {balanceMinor !== null && (
                    <span className="block text-xs text-muted-foreground">
                      Owes {money(balanceMinor)} now
                    </span>
                  )}
                </span>
                <Switch
                  checked={paymentMode === 'CREDIT'}
                  onCheckedChange={(v) => onMode(v ? 'CREDIT' : 'CASH')}
                />
              </label>
            )}
          </div>
        ) : (
          <div className="relative space-y-2">
            <Input
              ref={ref}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (results.length) pick(active);
                  else onDone();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setText('');
                  onDone();
                }
              }}
              placeholder="Search dealer or customer…"
              aria-label="Search dealer or customer"
            />
            {results.length > 0 && (
              <ul
                role="listbox"
                className="absolute z-40 w-full overflow-hidden rounded-md border bg-popover shadow-lg"
              >
                {results.map((p, i) => (
                  <li
                    key={p.id}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(i)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                      i === active && 'bg-accent',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{p.displayName ?? p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.roles.includes('DEALER') ? 'dealer' : 'customer'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!text && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={walkInName}
                  onChange={(e) => onWalkIn({ name: e.target.value })}
                  placeholder="Walk-in name"
                  aria-label="Walk-in name"
                />
                <Input
                  value={walkInPhone}
                  onChange={(e) => onWalkIn({ phone: e.target.value })}
                  placeholder="Phone"
                  aria-label="Walk-in phone"
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// ─── Totals ─────────────────────────────────────────────────────────────────────────────

export function TotalsBox({
  quote,
  stale,
  error,
  canDiscount,
  orderDiscount,
  onOrderDiscount,
}: {
  quote: PosQuote | undefined;
  stale: boolean;
  error: string | null;
  canDiscount: boolean;
  orderDiscount: OrderDiscount;
  onOrderDiscount: (d: OrderDiscount) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-muted-foreground">Items</dt>
          <dd className="text-right tabular-nums">{quote ? money(quote.grossMinor) : '—'}</dd>
          {quote && quote.discountMinor > 0 && (
            <>
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="text-right tabular-nums text-success">
                − {money(quote.discountMinor)}
              </dd>
            </>
          )}
        </dl>
        {canDiscount && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Order discount
            <Input
              inputMode="decimal"
              defaultValue={
                orderDiscount?.kind === 'AMOUNT'
                  ? orderDiscount.amountMinor / 100
                  : orderDiscount?.kind === 'PCT'
                    ? `${orderDiscount.pct}%`
                    : ''
              }
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) return onOrderDiscount(null);
                if (v.endsWith('%'))
                  onOrderDiscount({ kind: 'PCT', pct: Number(v.slice(0, -1)) || 0 });
                else onOrderDiscount({ kind: 'AMOUNT', amountMinor: toMinor(Number(v) || 0) });
              }}
              placeholder="৳ or %"
              className="h-8 w-24 text-right"
              aria-label="Order discount, amount or percent"
            />
          </div>
        )}
        <div
          className={cn(
            'flex items-baseline justify-between border-t pt-2',
            stale && 'opacity-60',
          )}
        >
          <span className="text-sm font-medium">Total</span>
          <span className="text-3xl font-semibold tabular-nums" aria-live="polite">
            {quote ? money(quote.totalMinor) : money(0)}
          </span>
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Quick keys ─────────────────────────────────────────────────────────────────────────

/** Pinned fast-sellers, Alt+1…9. Per till (browser), since what sells fast differs by counter. */
export function QuickKeys({
  keys,
  onPress,
  onUnpin,
  canPinSelected,
  onPinSelected,
}: {
  keys: QuickKey[];
  onPress: (k: QuickKey) => void;
  onUnpin: (id: string) => void;
  canPinSelected: boolean;
  onPinSelected: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Quick keys</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onPinSelected}
            disabled={!canPinSelected}
            title="Pin the selected cart line's product"
          >
            <Pin aria-hidden="true" />
            Pin selected
          </Button>
        </div>
        {keys.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Select a cart line and pin it — then Alt+1…9 adds it.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {keys.map((k, i) => (
              <div key={k.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onPress(k)}
                  className="flex h-14 w-full flex-col items-start justify-between rounded-md border p-1.5 text-left text-xs hover:bg-accent"
                  title={`${k.name} — Alt+${i + 1}`}
                >
                  <span className="line-clamp-2 font-medium">{k.name}</span>
                  <kbd className="font-mono text-[10px] text-muted-foreground">Alt+{i + 1}</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => onUnpin(k.id)}
                  className="absolute right-0.5 top-0.5 hidden rounded p-0.5 text-muted-foreground hover:bg-muted group-hover:block"
                  aria-label={`Unpin ${k.name}`}
                >
                  <PinOff className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Open a shift ───────────────────────────────────────────────────────────────────────

export function OpenShiftPanel({ defaultLocationId }: { defaultLocationId: string | null }) {
  const open = useOpenSession();
  const [locationId, setLocationId] = useState(defaultLocationId ?? '');
  const [terminal, setTerminal] = useState('T1');
  const [float, setFloat] = useState('');

  const submit = () =>
    open.mutate({
      locationId,
      terminalCode: terminal.trim().toUpperCase() || 'T1',
      openingFloatMinor: toMinor(Number(float) || 0),
    });

  return (
    <Card className="mx-auto mt-10 max-w-md">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5" aria-hidden="true" />
          <p className="text-lg font-semibold">Open your shift</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Count the cash in the drawer. It is the float the shift closes against.
        </p>
        <Field label="Counter">
          {() => (
            <LocationFilter
              value={locationId}
              onChange={setLocationId}
              includeAll={false}
              excludeTransit
              className="w-full"
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Till">
            {(p) => (
              <Input
                {...p}
                value={terminal}
                onChange={(e) => setTerminal(e.target.value)}
                className="uppercase"
              />
            )}
          </Field>
          <Field label="Opening float (৳)">
            {(p) => (
              <Input
                {...p}
                autoFocus
                inputMode="decimal"
                value={float}
                onChange={(e) => setFloat(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && locationId && submit()}
                className="text-right tabular-nums"
              />
            )}
          </Field>
        </div>
        <Button className="w-full" onClick={submit} disabled={!locationId || open.isPending}>
          Open shift (Enter)
        </Button>
      </CardContent>
    </Card>
  );
}
