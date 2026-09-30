import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PackageOpen, RotateCcw, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { money } from '@/features/dealers/creditMath';

import { fromMinor, toMinor } from '@shared/money';

import type { BuilderLine } from './orderBuilder';
import type { OrderQuote, OrderQuoteLine, PriceSource } from '@shared/types';

/**
 * The order's lines. Each row holds the user's choices — product, unit, quantity — and shows the
 * **server's** answer beside them: the resolved unit price and where it came from, the line total,
 * and how much is available at the chosen warehouse. The row does no arithmetic on money.
 *
 * Motion on add and remove only: a line sliding in confirms the search landed; animating every
 * quantity change would only slow the eye.
 */

const SOURCE_LABEL: Record<PriceSource, string> = {
  DEALER: 'dealer price',
  TIER: 'tier price',
  RETAIL: 'retail price',
  PRODUCT_DEFAULT: 'list price',
};

const GRID =
  'grid grid-cols-[minmax(0,1fr)_5rem_7.5rem_8rem_4.5rem_8rem_2.25rem] items-start gap-2';

export interface OrderLinesGridProps {
  lines: BuilderLine[];
  quote: OrderQuote | undefined;
  /** The quote on screen is for an earlier state of the lines — a newer one is loading. */
  stale: boolean;
  /** Server field errors keyed by path, e.g. `lines.2.qty`. */
  errors: Record<string, string>;
  canOverride: boolean;
  canDiscount: boolean;
  onChange: (key: number, patch: Partial<BuilderLine>) => void;
  onRemove: (key: number) => void;
}

export function OrderLinesGrid({
  lines,
  quote,
  stale,
  errors,
  canOverride,
  canDiscount,
  onChange,
  onRemove,
}: OrderLinesGridProps) {
  const reduce = useReducedMotion();

  if (lines.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
        <PackageOpen className="h-7 w-7" aria-hidden="true" />
        <p className="text-sm">Search for a product above to add the first line.</p>
      </div>
    );
  }

  // The quote is only trusted row-for-row when it priced exactly these lines.
  const aligned = quote && quote.lines.length === lines.length ? quote : undefined;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[49rem]">
        <div
          className={cn(
            GRID,
            'border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground',
          )}
        >
          <span>Item</span>
          <span className="text-right">Qty</span>
          <span>Unit</span>
          <span className="text-right">Unit price</span>
          <span className="text-right">Disc %</span>
          <span className="text-right">Line total</span>
          <span />
        </div>
        <ul
          aria-label="Order lines"
          className={cn('divide-y transition-opacity', stale && 'opacity-70')}
        >
          <AnimatePresence initial={false}>
            {lines.map((line, i) => (
              <motion.li
                key={line.key}
                layout={false}
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: 16, height: 0 }}
                transition={{ duration: 0.16 }}
                className="px-3 py-2"
              >
                <LineRow
                  index={i}
                  line={line}
                  q={aligned?.lines[i]}
                  errors={errors}
                  canOverride={canOverride}
                  canDiscount={canDiscount}
                  onChange={(patch) => onChange(line.key, patch)}
                  onRemove={() => onRemove(line.key)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

function LineRow({
  index,
  line,
  q,
  errors,
  canOverride,
  canDiscount,
  onChange,
  onRemove,
}: {
  index: number;
  line: BuilderLine;
  q: OrderQuoteLine | undefined;
  errors: Record<string, string>;
  canOverride: boolean;
  canDiscount: boolean;
  onChange: (patch: Partial<BuilderLine>) => void;
  onRemove: () => void;
}) {
  const p = line.product;
  const err = (field: string) => errors[`lines.${index}.${field}`];
  const rowError = err('productId') ?? err('variantId') ?? err('uomCode');
  const units = [{ code: p.baseUom, factor: 1 }, ...p.packs];
  const short = q ? q.qtyBase > q.availableBase : false;

  return (
    <div className="space-y-1.5">
      <div className={GRID}>
        {/* Item */}
        <div className="min-w-0 pt-1.5">
          <p className="truncate font-medium">{p.name}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{q?.sku ?? p.sku}</span>
            {line.variantLabel && <span>· {line.variantLabel}</span>}
            {q && q.qtyBase !== line.qty && (
              <span className="tabular-nums">
                · {q.qtyBase} {p.baseUom}
              </span>
            )}
            {p.trackingMode !== 'NONE' && (
              <Badge variant="outline" className="py-0">
                {p.trackingMode === 'SERIAL' ? 'serials at dispatch' : 'lot at dispatch'}
              </Badge>
            )}
          </div>
        </div>

        {/* Quantity */}
        <Input
          type="number"
          min={1}
          step={1}
          value={line.qty}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value));
            if (n >= 1) onChange({ qty: n });
          }}
          aria-invalid={Boolean(err('qty'))}
          className="h-9 text-right tabular-nums"
          aria-label={`Quantity of ${p.sku}`}
        />

        {/* Unit */}
        <Select
          value={line.uomCode}
          onChange={(e) => onChange({ uomCode: e.target.value, unitPriceMinor: null })}
          disabled={units.length === 1 || p.trackingMode === 'SERIAL'}
          className="h-9"
          aria-label={`Unit for ${p.sku}`}
        >
          {units.map((u) => (
            <option key={u.code} value={u.code}>
              {u.code}
              {u.factor > 1 ? ` ×${u.factor}` : ''}
            </option>
          ))}
        </Select>

        {/* Unit price — the server's, or an override for those allowed one */}
        <div className="text-right">
          {canOverride ? (
            <div className="flex items-center gap-1">
              <Input
                // Re-mount when the server's answer changes, so the box shows the new price.
                key={`${q?.unitPriceMinor ?? 'x'}-${line.uomCode}`}
                type="number"
                min={0}
                step="0.01"
                defaultValue={q ? fromMinor(q.unitPriceMinor) : ''}
                onBlur={(e) => {
                  if (!q || e.target.value === '') return;
                  const typed = toMinor(Number(e.target.value));
                  if (typed === q.unitPriceMinor) return;
                  onChange({
                    unitPriceMinor: typed === q.resolvedUnitPriceMinor ? null : typed,
                  });
                }}
                className={cn(
                  'h-9 text-right tabular-nums',
                  line.unitPriceMinor !== null && 'border-warning',
                )}
                aria-label={`Unit price of ${p.sku}`}
              />
              {line.unitPriceMinor !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => onChange({ unitPriceMinor: null })}
                  aria-label={`Back to the resolved price for ${p.sku}`}
                  title="Back to the resolved price"
                >
                  <RotateCcw />
                </Button>
              )}
            </div>
          ) : (
            <p className="pt-1.5 tabular-nums">{q ? money(q.unitPriceMinor) : '…'}</p>
          )}
        </div>

        {/* Extra line discount */}
        {canDiscount ? (
          <Input
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={line.discountPct ?? ''}
            placeholder="0"
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value);
              if (v === null || (v >= 0 && v <= 100)) onChange({ discountPct: v || null });
            }}
            aria-invalid={Boolean(err('discountPct'))}
            className="h-9 text-right tabular-nums"
            aria-label={`Extra discount on ${p.sku}, percent`}
          />
        ) : (
          <p className="pt-1.5 text-right tabular-nums text-muted-foreground">
            {line.discountPct ? `${line.discountPct}%` : '—'}
          </p>
        )}

        {/* Line total */}
        <div className="pt-1.5 text-right">
          <p className="font-medium tabular-nums">{q ? money(q.lineTotalMinor) : '…'}</p>
          {q && q.discountMinor > 0 && (
            <p className="text-xs tabular-nums text-muted-foreground">
              − {money(q.discountMinor)}
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-0.5 h-8 w-8 text-destructive hover:bg-destructive/10"
          onClick={onRemove}
          aria-label={`Remove ${p.sku}`}
        >
          <Trash2 />
        </Button>
      </div>

      {/* The server's notes on this line: price source, stock, the next qty break */}
      {q && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {SOURCE_LABEL[q.priceSource]}
            {q.tradeDiscountPct > 0 && (
              <>
                {' '}
                {money(q.listUnitPriceMinor)} less {q.tradeDiscountPct}% trade
              </>
            )}
          </span>
          {q.priceOverridden && (
            <Badge variant="secondary" className="py-0">
              price changed from {money(q.resolvedUnitPriceMinor)}
            </Badge>
          )}
          <span
            className={cn(
              'tabular-nums',
              short ? 'font-medium text-destructive' : 'text-success',
            )}
          >
            {short
              ? `only ${q.availableBase} ${p.baseUom} available — ${q.qtyBase} needed`
              : `${q.availableBase} ${p.baseUom} available`}
          </span>
          {q.nextBreak && (
            <span>
              {q.nextBreak.minQty}+ {q.nextBreak.uomCode} at {money(q.nextBreak.unitPriceMinor)}{' '}
              each
            </span>
          )}
        </div>
      )}
      {(rowError ?? err('qty') ?? err('unitPriceMinor') ?? err('discountPct')) && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {rowError ?? err('qty') ?? err('unitPriceMinor') ?? err('discountPct')}
        </p>
      )}
    </div>
  );
}
