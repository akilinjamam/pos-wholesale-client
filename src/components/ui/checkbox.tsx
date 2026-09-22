import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A native checkbox, styled.
 *
 * `accent-color` gets the tick and the box from the browser in both themes for one line of CSS,
 * and keeps every behaviour a real checkbox has: the label click target, space to toggle, form
 * participation, and — the reason this matters for the permission matrix — the ability to be
 * put into the **indeterminate** state, which is a DOM property and cannot be set from JSX.
 *
 * The matrix's group headers use it: a module whose permissions are partly ticked shows a dash,
 * not an unticked box that would imply clicking it changes nothing.
 */
export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate = false, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(forwardedRef, () => innerRef.current!, []);

    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
      <input
        ref={innerRef}
        type="checkbox"
        className={cn(
          'h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
