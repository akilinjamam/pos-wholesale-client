import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

/**
 * A small popover menu — the user menu and the location switcher.
 *
 * Radix-free, like everything in `components/ui` here, but not therefore careless. A dropdown
 * that is only "a div that appears on click" fails in four ways people hit daily, so all four
 * are handled:
 *
 *  - **It closes on an outside click, on Escape, and on scroll** of an ancestor. The last one
 *    matters because this is anchored absolutely to its trigger: without it, scrolling the page
 *    leaves the menu floating over unrelated content.
 *  - **Focus returns to the trigger** on Escape, so keyboard users are not dumped at the top.
 *  - **↑/↓ move between items** and Home/End jump to the ends — a menu that can only be clicked
 *    is unusable from a counter keyboard.
 *  - `aria-expanded` and `aria-haspopup` on the trigger, `role="menu"` on the list.
 *
 * `onSelect` on each item closes the menu, so callers do not have to remember to.
 */

interface DropdownProps {
  /** Receives the props that must land on the trigger to keep the wiring intact. */
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
  }) => ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  /** Tailwind width for the panel. */
  className?: string;
}

const ITEM_SELECTOR =
  '[role="menuitem"]:not([disabled]),[role="menuitemradio"]:not([disabled])';

export function Dropdown({ trigger, children, align = 'end', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const reduceMotion = useReducedMotion();

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    // `true` — capture, so a scrolling container that stops propagation cannot strand the menu.
    const onScroll = () => close();

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, close]);

  // Focus the first item on open, so ↓ is not needed to get started.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;

    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])];
    if (items.length === 0) return;

    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);

    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : e.key === 'ArrowDown'
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length;

    items[next]?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((v) => !v),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': menuId,
      })}

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            role="menu"
            onKeyDown={onMenuKeyDown}
            onClick={() => close()}
            initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.13, ease: 'easeOut' }}
            className={cn(
              'absolute z-50 mt-2 min-w-48 origin-top overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg',
              align === 'end' ? 'right-0' : 'left-0',
              className,
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface DropdownItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Renders the tick column and marks the item as a radio, for the location switcher. */
  selected?: boolean;
  destructive?: boolean;
}

export function DropdownItem({
  className,
  selected,
  destructive,
  ...props
}: DropdownItemProps) {
  return (
    <button
      type="button"
      role={selected === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={selected}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
        destructive &&
          'text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{children}</div>
  );
}

export function DropdownSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-border" />;
}
