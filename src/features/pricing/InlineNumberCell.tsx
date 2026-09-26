import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { fieldErrors } from '@/api/client';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A number edited in place, in the grid.
 *
 * Click (or Enter on the focused cell) to edit; **Enter** or leaving the cell saves; **Escape**
 * abandons. Entering a price list is hundreds of consecutive edits, and a dialog per number
 * would be hundreds of open-type-save-close round trips.
 *
 * The cell shows the saved value, never an optimistic one: if the server refuses the number,
 * what stays on screen is what is actually stored, and the reason arrives as a toast.
 */
export interface InlineNumberCellProps {
  /** The stored value, in the unit the user edits (major units for money). */
  value: number;
  display: string;
  /** Resolves on success; rejects with the API error. */
  onSave: (next: number) => Promise<unknown>;
  step?: number;
  min?: number;
  integer?: boolean;
  disabled?: boolean;
  label: string;
  className?: string;
}

export function InlineNumberCell({
  value,
  display,
  onSave,
  step = 0.01,
  min = 0,
  integer = false,
  disabled,
  label,
  className,
}: InlineNumberCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // Enter commits, and the blur that follows when the input unmounts — or a click elsewhere
  // while the save is in flight — would commit again. One save per edit.
  const committing = useRef(false);

  const start = () => {
    if (disabled) return;
    setDraft(String(value));
    setEditing(true);
  };

  const commit = async () => {
    if (committing.current) return;
    committing.current = true;
    const next = Number(draft);
    const valid =
      draft.trim() !== '' &&
      Number.isFinite(next) &&
      next >= min &&
      (!integer || Number.isInteger(next));

    if (!valid) {
      toast.error(`${label}: ${integer ? 'a whole number' : 'a number'} of ${min} or more`);
      setEditing(false);
      committing.current = false;
      return;
    }
    if (next === value) {
      setEditing(false);
      committing.current = false;
      return;
    }

    setSaving(true);
    try {
      await onSave(next);
    } catch (error) {
      // 422s are not toasted by the interceptor — they are meant for a form field, and here the
      // cell *is* the field.
      const first = fieldErrors(error)[0];
      if (first) toast.error(`${label}: ${first.message}`);
    } finally {
      setSaving(false);
      setEditing(false);
      committing.current = false;
    }
  };

  if (editing) {
    return (
      <Input
        autoFocus
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn('h-8 w-28 text-right tabular-nums', className)}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || saving}
      onClick={(e) => {
        e.stopPropagation();
        start();
      }}
      title={disabled ? undefined : 'Click to edit'}
      aria-label={disabled ? `${label}: ${display}` : `${label}: ${display}. Edit`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2 py-1 tabular-nums',
        !disabled &&
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {display}
    </button>
  );
}
