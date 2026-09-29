import { Loader2, ScanLine } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { toast } from 'sonner';

import { lookupBarcode } from '@/api/endpoints/pos';
import { listProducts } from '@/api/endpoints/products';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useProducts } from '@/hooks/data/useProducts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { money, parseEntry } from './saleHelpers';

import type { ProductPayload, VariantPayload } from '@shared/types';

/**
 * The one input the till lives in.
 *
 * A barcode scanner is a keyboard that types fast and presses Enter, so scanning and typing are
 * the same act here:
 *
 *  - **Enter** adds the highlighted search result, or — if there are no results to pick — looks
 *    the text up as a barcode. A carton label adds a carton, not a piece (`BarcodeMatch.uomCode`).
 *  - `5*` in front sets the quantity: `5*FRM-001`.
 *  - ↑ / ↓ move through the results while there is text.
 *  - With the box **empty**, ↑ / ↓ / + / − / Delete act on the cart instead — see `onCartKey` —
 *    so the cashier never has to leave this input to fix a line.
 *
 * Focus returns here after every add, every dialog and every sale: that is the "keyboard focus
 * discipline" the plan asks for.
 */
export interface ScanBarProps {
  onAdd: (args: {
    product: ProductPayload;
    variant: VariantPayload | null;
    uomCode?: string;
    qty: number;
  }) => void;
  onCartKey: (key: 'up' | 'down' | 'plus' | 'minus' | 'delete') => void;
  disabled?: boolean;
}

export const ScanBar = forwardRef<HTMLInputElement, ScanBarProps>(function ScanBar(
  { onAdd, onCartKey, disabled },
  ref,
) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [looking, setLooking] = useState(false);

  const { qty, text: term } = parseEntry(text);
  const q = useDebouncedValue(term, 200);
  const { data, isFetching } = useProducts({
    q: q.length >= 2 ? q : undefined,
    limit: 8,
    isActive: true,
  });
  const results = q.length >= 2 ? (data?.items ?? []).filter((p) => p.isSellableAtCounter) : [];
  // Results only count once they belong to what is typed — a stale list must not grab the Enter.
  const resultsCurrent = q === term && !isFetching;

  const reset = () => {
    setText('');
    setActive(0);
  };

  const submit = async () => {
    if (!term) return;
    if (resultsCurrent && results[active]) {
      onAdd({ product: results[active], variant: null, qty });
      reset();
      return;
    }
    setLooking(true);
    try {
      const match = await lookupBarcode(term).catch(() => null);
      if (match) {
        onAdd({ product: match.product, variant: match.variant, uomCode: match.uomCode, qty });
        reset();
        return;
      }
      // Not a barcode. A SKU typed and entered faster than the search could answer lands here
      // too, so ask the search now: an exact SKU match, or the only result, is what was meant.
      const found = (await listProducts({ q: term, limit: 8, isActive: true })).items.filter(
        (p) => p.isSellableAtCounter,
      );
      const pick =
        found.find((p) => p.sku.toLowerCase() === term.toLowerCase()) ??
        (found.length === 1 ? found[0] : undefined);
      if (pick) {
        onAdd({ product: pick, variant: null, qty });
        reset();
      } else {
        toast.error(
          found.length
            ? `Several items match “${term}” — choose one`
            : `Nothing found for “${term}”`,
        );
      }
    } catch {
      toast.error(`Nothing found for “${term}”`);
    } finally {
      setLooking(false);
    }
  };

  return (
    <div className="relative">
      <ScanLine
        className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={ref}
        value={text}
        disabled={disabled}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="pos-results"
        aria-label="Scan a barcode or search products (F2)"
        placeholder="Scan or type — 5*code for five     (F2)"
        className="h-12 pl-11 text-base"
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          const empty = text.trim() === '';
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (empty) onCartKey('down');
            else setActive((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (empty) onCartKey('up');
            else setActive((i) => Math.max(i - 1, 0));
          } else if (empty && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            onCartKey('plus');
          } else if (empty && e.key === '-') {
            e.preventDefault();
            onCartKey('minus');
          } else if (empty && e.key === 'Delete') {
            e.preventDefault();
            onCartKey('delete');
          } else if (e.key === 'Escape' && !empty) {
            e.preventDefault();
            e.stopPropagation();
            reset();
          }
        }}
      />
      {(looking || (isFetching && term.length >= 2)) && (
        <Loader2
          className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      )}

      {results.length > 0 && (
        <ul
          id="pos-results"
          role="listbox"
          className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg"
        >
          {results.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onAdd({ product: p, variant: null, qty });
                reset();
              }}
              className={cn(
                'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm',
                i === active && 'bg-accent',
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
              {p.trackingMode !== 'NONE' && (
                <span className="text-xs text-muted-foreground">
                  {p.trackingMode.toLowerCase()}
                </span>
              )}
              <span className="w-24 text-right tabular-nums">
                {money(p.defaultSellPriceMinor)}
              </span>
            </li>
          ))}
          <li className="border-t px-3 py-1 text-xs text-muted-foreground">
            ↑↓ choose · Enter add · Esc clear — prices shown are defaults; the cart shows the
            real one
          </li>
        </ul>
      )}
    </div>
  );
});
