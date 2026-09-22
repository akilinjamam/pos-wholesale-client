import { useId } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

/**
 * One labelled form control, with its error message.
 *
 * shadcn's `form` component is deliberately not used here: it exists to wire Radix primitives
 * into react-hook-form through four layers of context, and this project's `components/ui` is
 * Radix-free. What is actually needed is an id shared by the label, the input and the error —
 * so the label focuses the field and a screen reader announces the message. That is this.
 *
 * `aria-invalid` and `aria-describedby` are not decoration. Without them a validation failure
 * is a red border, which a screen-reader user cannot see and a colour-blind user may not
 * distinguish.
 */
export interface FieldProps {
  label: string;
  /** The message from react-hook-form, if this field failed. */
  error?: string;
  hint?: string;
  required?: boolean;
  /** Receives the props that must land on the input to keep the wiring intact. */
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}

export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={cn(error && 'text-destructive')}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>

      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}

      {error ? (
        // `role="alert"` so the message is announced when it appears, not only when focused.
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
