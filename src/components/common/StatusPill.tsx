import { Badge } from '@/components/ui/badge';
import { cn, humanise } from '@/lib/utils';

/**
 * One coloured label for every status in the system.
 *
 * The rule it enforces is that a colour means the same thing everywhere: green is "settled,
 * nothing to do", amber is "open, awaiting someone", red is "stopped or failed", grey is
 * "inert". In the retail app each screen picks its own, so DELIVERED is green on one page and
 * blue on another, and the colour stops carrying information at all.
 *
 * Statuses arrive as the server's SCREAMING_SNAKE enum values; this maps them to a tone and
 * renders them in sentence case. Unknown values fall back to neutral rather than throwing —
 * a status added on a later day should look plain, not break the row.
 */

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/**
 * Known statuses, by tone. Entries for statuses whose models land on later days are already
 * here so the mapping stays in one place rather than accumulating per-screen ternaries.
 */
const TONE_BY_STATUS: Record<string, StatusTone> = {
  // Lifecycle
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  CONFIRMED: 'info',
  CANCELLED: 'danger',
  CLOSED: 'neutral',

  // Fulfilment
  NONE: 'neutral',
  PARTIAL: 'warning',
  COMPLETE: 'success',
  PICKING: 'info',
  PACKED: 'info',
  PARTIALLY_DISPATCHED: 'warning',
  DISPATCHED: 'info',
  DELIVERED: 'success',

  // Money
  UNBILLED: 'neutral',
  BILLED: 'success',
  UNPAID: 'danger',
  PAID: 'success',
  OVERDUE: 'danger',
  PENDING: 'warning',
  DEPOSITED: 'info',
  CLEARED: 'success',
  BOUNCED: 'danger',
};

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground border-transparent',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-destructive/15 text-destructive border-destructive/30',
  info: 'bg-primary/10 text-primary border-primary/25',
};

export interface StatusPillProps {
  /** The server's enum value, e.g. `PARTIALLY_DISPATCHED`. */
  status: string;
  /** Override the mapping — for a boolean rendered as a status, say. */
  tone?: StatusTone;
  /** Override the text; by default the status is humanised. */
  label?: string;
  className?: string;
}

export function StatusPill({ status, tone, label, className }: StatusPillProps) {
  const resolved = tone ?? TONE_BY_STATUS[status] ?? 'neutral';

  return (
    <Badge variant="outline" className={cn('font-medium', TONE_CLASSES[resolved], className)}>
      {label ?? humanise(status)}
    </Badge>
  );
}
