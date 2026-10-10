import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtDateTime } from '@/features/counter/print/printHelpers';
import { CreditUsage } from '@/features/dealers/credit';
import { money } from '@/features/dealers/creditMath';
import { useCreditOverrides } from '@/hooks/data/useOrders';
import { cn } from '@/lib/utils';

import type { CreditOverrideRow } from '@shared/types';

/**
 * Credit overrides (Day 31): every time someone lent past a dealer's limit — confirming over it,
 * approving a parked order, or letting a challan leave — with who, why, and by how much. Read from
 * the audit log, which nothing can edit.
 *
 * The dealer table is each dealer's position *now*, not then: which overrides were paid back down,
 * and who is still over.
 */

const STAGE: Record<CreditOverrideRow['stage'], string> = {
  CONFIRM: 'At confirm',
  APPROVE: 'Approved',
  DISPATCH: 'At dispatch',
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

export function CreditOverrides() {
  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(() => iso(new Date()));
  const { data: d, isLoading, isFetching } = useCreditOverrides({ from, to });
  const stillOver = d?.dealers.filter((x) => x.overNowMinor > 0).length ?? 0;

  const preset = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };
  const monthStart = (() => {
    const n = new Date();
    return iso(new Date(n.getFullYear(), n.getMonth(), 1));
  })();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Credit overrides"
        icon={ShieldAlert}
        description="Who lent past a dealer's credit limit, why, and where that dealer stands now."
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="h-9 w-44"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">To</span>
          <Input
            type="date"
            value={to}
            min={from}
            max={iso(new Date())}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className="h-9 w-44"
          />
        </label>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => preset(daysAgo(29), iso(new Date()))}
          >
            Last 30 days
          </Button>
          <Button size="sm" variant="ghost" onClick={() => preset(monthStart, iso(new Date()))}>
            This month
          </Button>
        </div>
      </div>

      {isLoading || !d ? (
        <Skeleton className="h-48 w-full" />
      ) : d.count === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No overrides in this period"
          description="Every order went through within its dealer's limit."
        />
      ) : (
        <div className={cn('space-y-5', isFetching && 'opacity-70')}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Figure label="Overrides" value={String(d.count)} />
            <Figure
              label="Lent past limits"
              value={money(d.shortfallMinor)}
              hint="Σ how far over each one went"
            />
            <Figure
              label="Dealers still over"
              value={`${stillOver} of ${d.dealers.length}`}
              danger={stillOver > 0}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Dealers, as they stand now</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto px-0 pb-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dealer</TableHead>
                      <TableHead className="text-right">Overrides</TableHead>
                      <TableHead className="text-right">Exposure / limit</TableHead>
                      <TableHead className="text-right">Over now</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.dealers.map((x) => (
                      <TableRow key={x.partyId}>
                        <TableCell>
                          <Link
                            to={`/receivables/statement?partyId=${x.partyId}`}
                            className="font-medium hover:underline"
                          >
                            {x.name}
                          </Link>
                          <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                            {x.code}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{x.overrides}</TableCell>
                        <TableCell className="text-right">
                          <CreditUsage
                            balanceMinor={x.exposureNowMinor}
                            limitMinor={x.limitMinor}
                            className="ml-auto"
                          />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular-nums',
                            x.overNowMinor > 0 && 'font-medium text-destructive',
                          )}
                        >
                          {x.overNowMinor > 0 ? money(x.overNowMinor) : 'Within'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">By who overrode</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto px-0 pb-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Manager</TableHead>
                      <TableHead className="text-right">Overrides</TableHead>
                      <TableHead className="text-right">Lent past limits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.byApprover.map((a) => (
                      <TableRow key={a.userId ?? 'unknown'}>
                        <TableCell className="font-medium">
                          {a.name ?? 'Unknown user'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{a.count}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(a.shortfallMinor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Dealer</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Over by</TableHead>
                  <TableHead>Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmtDateTime(r.at)}
                      <span className="block text-xs text-muted-foreground">
                        {STAGE[r.stage]}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.orderId ? (
                        <Link
                          to={`/sales/orders/${r.orderId}`}
                          className="font-mono text-sm hover:underline"
                        >
                          {r.orderDocNo ?? 'Order'}
                        </Link>
                      ) : (
                        '—'
                      )}
                      {r.orderStatus && (
                        <StatusPill status={r.orderStatus} className="ml-2 align-middle" />
                      )}
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {money(r.orderTotalMinor)}
                      </span>
                    </TableCell>
                    <TableCell>{r.dealerName ?? '—'}</TableCell>
                    <TableCell>{r.byName ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="font-medium text-destructive">
                        {money(r.shortfallMinor)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        limit {r.limitMinor > 0 ? money(r.limitMinor) : 'cash only'}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs text-sm">“{r.reason}”</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-lg font-semibold tabular-nums', danger && 'text-destructive')}>
          {value}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
