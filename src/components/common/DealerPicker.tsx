import { Check, Loader2, Search, Users, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useParties } from '@/hooks/data/useParties';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

import type { PartyPayload } from '@shared/types';

/**
 * Pick one dealer by name, code or phone — the same combobox pattern as `ProductPicker`, for
 * the same reasons: server-side search, ten at a time, fully keyboard-driven.
 *
 * `null` is a legitimate value: "no dealer" means a counter (walk-in) price, and the clear
 * button says so rather than leaving an empty box to be interpreted.
 */
export interface DealerPickerProps {
  value: PartyPayload | null;
  onChange: (dealer: PartyPayload | null) => void;
  id?: string;
  /** What `null` means where this picker is used. */
  emptyLabel?: string;
}

const RESULTS = 10;

export function DealerPicker({
  value,
  onChange,
  id,
  emptyLabel = 'Search dealers…',
}: DealerPickerProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const q = useDebouncedValue(text.trim(), 250);
  const { data, isFetching } = useParties('DEALER', {
    q: q || undefined,
    limit: RESULTS,
    isActive: true,
    sort: 'name',
  });
  const options = open ? (data?.items ?? []) : [];

  const choose = (dealer: PartyPayload) => {
    onChange(dealer);
    setText('');
    setOpen(false);
  };

  if (value) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">{value.displayName ?? value.name}</span>{' '}
          <span className="font-mono text-xs text-muted-foreground">{value.code}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Clear dealer"
          onClick={() => {
            onChange(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <X />
        </Button>
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
        value={text}
        placeholder={emptyLabel}
        autoComplete="off"
        className="pl-9"
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
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
              {isFetching ? 'Searching…' : q ? 'No dealer matches' : 'Start typing to search'}
            </li>
          ) : (
            options.map((d, index) => (
              <li
                key={d.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(d)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm',
                  index === active && 'bg-accent',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{d.displayName ?? d.name}</span>
                <span className="text-xs text-muted-foreground">
                  {d.dealer?.priceTierName ?? 'no tier'}
                </span>
                {index === active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
