import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

/**
 * A modal dialog, without Radix — like the rest of `components/ui` in this project.
 *
 * shadcn's Dialog wraps `@radix-ui/react-dialog`, which is excellent and about 30 KB. What it
 * actually contributes over the 90 lines below is edge-case focus restoration and nested-modal
 * bookkeeping, neither of which this app does. What it cannot be allowed to drop is the part
 * people skip when they hand-roll a modal:
 *
 *  - **Focus moves into the dialog** on open and **returns to the trigger** on close, so a
 *    keyboard user is not left tabbing through the page behind the overlay.
 *  - **Tab is trapped.** Without this, Tab walks out of the dialog and into the form underneath
 *    it, where the user edits fields they cannot see.
 *  - **Escape closes** and **the page behind does not scroll**.
 *  - `role="dialog"` + `aria-modal` + `aria-labelledby`, so a screen reader announces what
 *    opened rather than reading the page from the top.
 *
 * Rendered through a portal to `document.body`: nested inside the page, an ancestor's
 * `overflow: hidden` or `transform` (the route transition uses one) would clip the overlay or
 * break its fixed positioning.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Tailwind max-width for the panel. Editors want more room than confirmations. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Rendered in the footer, right-aligned — the actions. */
  footer?: ReactNode;
  children: ReactNode;
}

const SIZES: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const titleId = useId();
  const descriptionId = `${titleId}-description`;

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;

    // Captured now, not in the cleanup: by then the element may have been unmounted by the
    // very state change that closed us, and focus would have nowhere to go.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }

      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      // Wrap at both ends. Without the `!panel.contains` case, focus that has already escaped
      // (a browser autofill dropdown, say) never comes back.
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Next frame, so the panel has mounted and its entrance animation has begun. Focusing the
    // first control rather than the panel itself puts the caret where typing should go.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel)?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, close]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
            aria-hidden="true"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'relative z-10 flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-lg border bg-card text-card-foreground shadow-xl outline-none',
              SIZES[size],
            )}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
              <div className="min-w-0 space-y-1">
                <h2 id={titleId} className="truncate font-semibold leading-none tracking-tight">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="text-sm text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-2 -mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* The body scrolls, not the dialog: the header and the actions stay put on a long
                form, which is the difference between a usable editor and one where Save is
                below the fold. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>

            {footer && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
