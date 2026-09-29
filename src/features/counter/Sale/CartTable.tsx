import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Barcode, PackageOpen, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { money } from './saleHelpers';

import { fromMinor, toMinor } from '@shared/money';

import type { CartLine } from '@/store/posCartSlice';
import type { PosQuote } from '@shared/types';

/**
 * The cart. Every figure in it — unit price, discount, line total — is the **server's**, from the
 * quote; the cart itself only knows quantities and choices.
 *
 * Motion is on add and remove only (the plan says so, and it is right): a line sliding in confirms
 * a scan landed; animating every quantity change would slow the eye down at a till.
 */
export interface CartTableProps {
  lines: CartLine[];
  quote: PosQuote | undefined;
  quoteStale: boolean;
  selectedKey: string | null;
  canDiscount: boolean;
  onSelect: (key: string) => void;
  onQty: (key: string, qty: number) => void;
  onUom: (key: string, uomCode: string) => void;
  onDiscount: (key: string, amountMinor: number) => void;
  onCapture: (key: string) => void;
  onRemove: (key: string) => void;
}

export function CartTable({
  lines,
  quote,
  quoteStale,
  selectedKey,
  canDiscount,
  onSelect,
  onQty,
  onUom,
  onDiscount,
  onCapture,
  onRemove,
}: CartTableProps) {
  const reduce = useReducedMotion();

  if (lines.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
        <PackageOpen className="h-8 w-8" aria-hidden="true" />
        <p className="text-sm">Scan a barcode or type to search.</p>
        <p className="text-xs">F9 resumes a parked sale · F1 shows every shortcut</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6rem_7rem_7rem_2.5rem] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>Item</span>
        <span className="text-right">Qty</span>
        <span>Unit</span>
        <span className="text-right">Price</span>
        <span className="text-right">Total</span>
        <span />
      </div>
      <ul
        aria-label="Cart"
        className={cn('divide-y transition-opacity', quoteStale && 'opacity-70')}
      >
        <AnimatePresence initial={false}>
          {lines.map((l, i) => {
            const q = quote?.lines[i];
            const selected = l.key === selectedKey;
            const short = q && q.availableBase !== null && q.qtyBase > q.availableBase;
            const units = [{ code: l.baseUom, factor: 1 }, ...l.packs];
            return (
              <motion.li
                key={l.key}
                layout={false}
                initial={reduce ? false : { opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: 12, height: 0 }}
                transition={{ duration: 0.16 }}
                aria-selected={selected}
                onClick={() => onSelect(l.key)}
                className={cn(
                  'px-3 py-2',
                  selected && 'bg-primary/5 ring-1 ring-inset ring-primary/40',
                )}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6rem_7rem_7rem_2.5rem] items-center gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-mono">{l.sku}</span>
                      {l.variantLabel && <span>· {l.variantLabel}</span>}
                      {l.lotNo && (
                        <Badge variant="outline" className="py-0">
                          lot {l.lotNo}
                        </Badge>
                      )}
                      {l.serials.length > 0 && (
                        <Badge variant="outline" className="py-0">
                          {l.serials.join(', ')}
                        </Badge>
                      )}
                      {q?.needs && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCapture(l.key);
                          }}
                          className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 text-warning hover:underline"
                        >
                          <Barcode className="h-3 w-3" aria-hidden="true" />
                          {q.needs === 'SERIALS' ? 'scan serial(s)' : 'choose lot'}
                        </button>
                      )}
                      {short && (
                        <span className="font-medium text-destructive">
                          only {q.availableBase} {l.baseUom} here
                        </span>
                      )}
                      {q?.priceOverridden && (
                        <Badge variant="secondary" className="py-0">
                          price changed
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={l.qty}
                    onChange={(e) => onQty(l.key, Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    disabled={l.trackingMode === 'SERIAL' && l.serials.length > 0}
                    className="h-9 text-right tabular-nums"
                    aria-label={`Quantity of ${l.sku}`}
                  />
                  <Select
                    value={l.uomCode}
                    onChange={(e) => onUom(l.key, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={l.trackingMode === 'SERIAL' || units.length === 1}
                    className="h-9"
                    aria-label={`Unit for ${l.sku}`}
                  >
                    {units.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.code}
                        {u.factor > 1 ? ` ×${u.factor}` : ''}
                      </option>
                    ))}
                  </Select>
                  <span className="text-right text-sm tabular-nums">
                    {q ? money(q.unitPriceMinor) : '…'}
                  </span>
                  <span className="text-right font-medium tabular-nums">
                    {q ? money(q.lineTotalMinor) : '…'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(l.key);
                    }}
                    aria-label={`Remove ${l.sku}`}
                    tabIndex={-1}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {selected && canDiscount && (
                  <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                    Line discount
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={l.lineDiscountMinor ? fromMinor(l.lineDiscountMinor) : ''}
                      onBlur={(e) =>
                        onDiscount(l.key, e.target.value ? toMinor(Number(e.target.value)) : 0)
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="h-8 w-28 text-right tabular-nums"
                      aria-label={`Discount on ${l.sku}`}
                    />
                    {q && (q.lineDiscountMinor > 0 || q.orderDiscountMinor > 0) && (
                      <span>− {money(q.lineDiscountMinor + q.orderDiscountMinor)}</span>
                    )}
                  </div>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
