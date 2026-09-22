import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

import type { ReactNode } from 'react';

/**
 * "Are you sure?" — once, properly.
 *
 * `window.confirm` is what the retail app uses, and it blocks the main thread, cannot be
 * styled, cannot say *what* is about to happen beyond one line of plain text, and is silently
 * suppressed by some browsers after the second use on a page.
 *
 * Two details this gets right that a naive modal does not:
 *
 *  - **The confirm button names the act** — "Deactivate", not "OK". A dialog read quickly is a
 *    button and a colour, so the button has to carry the meaning.
 *  - **It stays open while the mutation runs** and shows the pending state. Closing on click
 *    and letting the result arrive as a toast means the user is already elsewhere when the
 *    operation fails, and the row they were looking at is gone.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** What will happen, and to what. Name the record. */
  description: ReactNode;
  /** The verb. Defaults to "Confirm", which is a fallback, not a good label. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red for anything that removes, cancels or reverses. */
  destructive?: boolean;
  pending?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  pending = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      // A half-finished destructive action should not be dismissible by a stray Escape.
      onClose={pending ? () => undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground">{description}</div>
    </Dialog>
  );
}
