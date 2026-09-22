import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Radix-free, like the rest of `components/ui` in this project. shadcn's Label wraps
 * `@radix-ui/react-label`, whose only real contribution is forwarding clicks to the control —
 * which a plain `<label htmlFor>` already does. Not worth a dependency.
 */
const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export { Label };
