import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The title block every screen opens with.
 *
 * One component rather than a hand-rolled `<h1>` per page, because the alternative is what the
 * retail app has: eleven screens whose headings differ in size, spacing and whether the action
 * button sits left or right, so moving between them feels like moving between applications.
 *
 * `actions` is a slot rather than a prop list — a screen may need a button, a button and a
 * filter, or nothing — and it wraps below the title on a narrow screen instead of squeezing it.
 */
export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Buttons, right-aligned on desktop and below the title on mobile. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.header
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-3 pb-1',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>

      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}
