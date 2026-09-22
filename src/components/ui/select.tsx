import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A styled native `<select>`.
 *
 * Deliberately not a custom listbox. On the hardware this runs on — counter tablets and older
 * Android devices — the native control opens the platform picker, which is large, scrollable
 * with a thumb, searchable by typing, and works without JavaScript getting the keyboard
 * interaction subtly wrong. A div-based dropdown looks better in a screenshot and is worse at
 * the till.
 *
 * `appearance-none` plus our own chevron, so it matches `Input` in both themes — Safari and
 * Firefox draw very different arrows otherwise.
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Rendered as a disabled first option, so "nothing chosen" is visible rather than implied. */
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, placeholder, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex h-9 w-full appearance-none rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {placeholder !== undefined && (
          <option value="" disabled={props.required}>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
