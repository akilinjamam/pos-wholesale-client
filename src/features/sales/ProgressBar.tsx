import { cn } from '@/lib/utils';

/** A labelled 0–100% bar — shipped and billed on the order board and the order page. */
export function ProgressBar({
  label,
  value,
  detail,
  compact = false,
}: {
  label: string;
  /** 0–1 */
  value: number;
  detail?: string;
  compact?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className={cn('space-y-1', compact ? 'min-w-[7rem]' : 'w-full')}>
      <div className="flex justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{detail ?? `${pct}%`}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cn('h-full transition-[width]', pct >= 100 ? 'bg-success' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
