import { ShieldAlert } from 'lucide-react';

import { StatusPill } from '@/components/common/StatusPill';
import { cn } from '@/lib/utils';

import { creditUsage, money } from './creditMath';

import type { PartyPayload } from '@shared/types';

/**
 * Balance against limit, with a meter.
 *
 * The meter changes colour at 80% and 100% because that is when someone should act — the order
 * builder (Day 31) blocks at 100%, and 80% is the point where a sales rep still has time to
 * chase a payment before the next order is refused.
 */
export function CreditUsage({
  balanceMinor,
  limitMinor,
  className,
}: {
  balanceMinor: number;
  limitMinor: number;
  className?: string;
}) {
  const usage = creditUsage(balanceMinor, limitMinor);
  const over = limitMinor <= 0 ? balanceMinor > 0 : (usage ?? 0) > 1;
  const tone = over ? 'bg-destructive' : (usage ?? 0) >= 0.8 ? 'bg-warning' : 'bg-success';

  return (
    <div className={cn('min-w-[8rem] space-y-1', className)}>
      <p className="text-right text-sm tabular-nums">
        <span className={cn(over && 'font-medium text-destructive')}>
          {money(balanceMinor)}
        </span>
        <span className="text-muted-foreground">
          {' / '}
          {limitMinor > 0 ? money(limitMinor) : 'cash only'}
        </span>
      </p>
      {usage !== null && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usage * 100)}
          aria-label="Credit used"
        >
          <div
            className={cn('h-full', tone)}
            style={{ width: `${Math.min(100, usage * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Hold outranks inactive outranks active: a held dealer is the thing to notice. */
export function DealerStatus({ party }: { party: PartyPayload }) {
  if (party.dealer?.creditHold) {
    return <StatusPill status="ON_HOLD" tone="danger" label="On hold" className="gap-1" />;
  }
  return <StatusPill status={party.isActive ? 'ACTIVE' : 'INACTIVE'} />;
}

export function HoldBanner({ party }: { party: PartyPayload }) {
  const d = party.dealer;
  if (!d?.creditHold) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div>
        <p className="font-medium text-destructive">On credit hold</p>
        <p className="text-muted-foreground">
          {d.creditHoldReason ?? 'No reason recorded.'}
          {d.creditHoldSince && ` · since ${new Date(d.creditHoldSince).toLocaleDateString()}`}
        </p>
      </div>
    </div>
  );
}
