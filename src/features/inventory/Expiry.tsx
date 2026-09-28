import { CalendarClock } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useExpiringLots } from '@/hooks/data/useStock';

import { LocationFilter } from './LocationFilter';

/**
 * Lots with stock that expire soon — and every one already expired, which is the more urgent half.
 * Soonest first. A lot with nothing left on the shelf is not a problem and is not listed.
 */
const WINDOWS = [30, 60, 90, 180] as const;

export function Expiry() {
  const [withinDays, setWithinDays] = useState<number>(90);
  const [locationId, setLocationId] = useState('');
  const { data, isLoading } = useExpiringLots(withinDays, locationId || undefined);
  const lots = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expiry report"
        icon={CalendarClock}
        description="Lots in stock that expire soon, and any already expired. Sell or return these first."
      />
      <div className="flex flex-wrap gap-2">
        <Select
          value={String(withinDays)}
          onChange={(e) => setWithinDays(Number(e.target.value))}
          className="w-48"
          aria-label="Window"
        >
          {WINDOWS.map((d) => (
            <option key={d} value={d}>
              Expiring within {d} days
            </option>
          ))}
        </Select>
        <LocationFilter value={locationId} onChange={setLocationId} />
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : lots.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing expiring"
          description={`No lot in stock expires within ${withinDays} days.`}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Where</TableHead>
                <TableHead className="text-right">On hand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <p className="font-medium">{l.productName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{l.lotNo}</TableCell>
                  <TableCell>
                    <p className="text-sm">{l.expiryDate}</p>
                    <StatusPill
                      status="EXPIRY"
                      tone={
                        (l.daysToExpiry ?? 0) < 0
                          ? 'danger'
                          : (l.daysToExpiry ?? 0) <= 30
                            ? 'warning'
                            : 'info'
                      }
                      label={
                        (l.daysToExpiry ?? 0) < 0
                          ? `expired ${Math.abs(l.daysToExpiry ?? 0)} day(s) ago`
                          : l.daysToExpiry === 0
                            ? 'expires today'
                            : `in ${l.daysToExpiry} day(s)`
                      }
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    {l.onHand.map((o) => `${o.locationCode}: ${o.qtyOnHand}`).join(' · ')}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {l.totalOnHand}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      {l.baseUom}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
