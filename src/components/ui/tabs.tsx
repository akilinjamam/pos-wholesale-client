import { useId, useRef } from 'react';

import { cn } from '@/lib/utils';

import type { KeyboardEvent, ReactNode } from 'react';

/**
 * Tabs, Radix-free like the rest of `components/ui`.
 *
 * Follows the WAI-ARIA tabs pattern rather than being a row of buttons that happen to swap
 * content: `role="tablist"` / `tab` / `tabpanel` with the ids wired both ways, a roving
 * `tabIndex` so Tab moves *past* the strip rather than through every tab, and arrow keys,
 * Home and End to move along it. Without that a keyboard user has to tab through seven dealer
 * tabs to reach the content of the first.
 *
 * Controlled: the caller owns `value`, so a tab can live in the URL.
 */
export interface TabItem {
  value: string;
  label: ReactNode;
  /** Small trailing marker, e.g. a count or a "soon" hint. */
  badge?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** The active tab's content. Only the active panel is rendered. */
  children: ReactNode;
  className?: string;
  label: string;
}

export function Tabs({ items, value, onValueChange, children, className, label }: TabsProps) {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabId = (v: string) => `${baseId}-tab-${v}`;
  const panelId = `${baseId}-panel`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((i) => i.value === value);
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;

    if (next === null) return;
    event.preventDefault();
    onValueChange(items[next]!.value);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b"
      >
        {items.map((item, index) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={tabId(item.value)}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(item.value)}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
              {item.badge}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(value)} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}
