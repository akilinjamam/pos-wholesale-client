import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * What a list shows when it has nothing to show.
 *
 * The distinction this makes, and which a bare "No data" does not, is between **empty** and
 * **filtered to nothing**. They demand opposite actions — create the first record, or clear the
 * search — and conflating them is why people conclude their data has been deleted when they
 * have in fact left a filter set. Callers pass a different `title`/`action` for each case.
 */
export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** The way out: "Add the first dealer", or "Clear filters". */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </span>
      )}

      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {action}
    </div>
  );
}
