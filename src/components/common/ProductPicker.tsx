import { Check, Loader2, Package, Search, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProducts } from '@/hooks/data/useProducts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

import type { ProductPayload } from '@shared/types';

/**
 * Pick one product by typing its name or SKU.
 *
 * A searchable combobox rather than a `<select>`: a catalogue of a few thousand frames cannot
 * be a dropdown, and loading it all to fill one would be the retail app's mistake. Search is
 * server-side, ten results at a time.
 *
 * Follows the ARIA combobox pattern — `aria-expanded`, `aria-activedescendant`, arrow keys to
 * move, Enter to choose, Escape to close — so it works from the keyboard alone, which is how
 * price lists actually get entered.
 */
export interface ProductPickerProps {
  value: ProductPayload | null;
  onChange: (product: ProductPayload | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  'aria-describedby'?: string;
  placeholder?: string;
}

const RESULTS = 10;

export function ProductPicker({
  value,
  onChange,
  disabled,
  invalid,
  id,
  placeholder = 'Search name or SKU…',
  ...aria
}: ProductPickerProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const q = useDebouncedValue(text.trim(), 250);
  const { data, isFetching } = useProducts({
    q: q || undefined,
    limit: RESULTS,
    isActive: true,
    sort: 'name',
  });
  const options = open ? (data?.items ?? []) : [];

  const choose = (product: ProductPayload) => {
    onChange(product);
    setText('');
    setOpen(false);
  };

  if (value) {
    return (
      <div
        className={cn(
          'flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm',
          invalid && 'border-destructive',
        )}
      >
        <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">{value.name}</span>{' '}
          <span className="font-mono text-xs text-muted-foreground">{value.sku}</span>
        </span>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Choose a different product"
            onClick={() => {
              onChange(null);
              // Straight back into the search, since that is the only thing to do next.
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            <X />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        aria-describedby={aria['aria-describedby']}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        className="pl-9"
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delayed so a click on an option lands before the list disappears under it.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && open && options[active]) {
            e.preventDefault();
            choose(options[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {isFetching && open && (
        <Loader2
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {isFetching ? 'Searching…' : q ? 'No product matches' : 'Start typing to search'}
            </li>
          ) : (
            options.map((p, index) => (
              <li
                key={p.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm',
                  index === active && 'bg-accent',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                {index === active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
