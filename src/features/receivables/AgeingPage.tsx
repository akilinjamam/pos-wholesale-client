import { ChevronDown, ChevronRight, Hourglass, Printer } from 'lucide-react';
import { Fragment, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { OffScreen } from '@/features/counter/print/PrintDocs';
import { fmtDate, usePrint } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';
import { useOrg } from '@/hooks/data/useOrg';
import { useAgeing } from '@/hooks/data/useReceivables';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

import { AgeingDoc } from './print/ReceivablesDocs';

import type { AgeingBucket } from '@shared/enums';

/**
 * Receivables ageing (Day 30): who owes what, and how late — as of any day. Today by default; set
 * a past month-end and it shows that month-end exactly as it stood, payments since excluded. Click
 * a dealer to drill through to the invoices behind their figures.
 *
 * Every figure is the server's, from open invoices and their payment history; the totals tie to the
 * sum of open invoice balances.
 */

const LABEL: Record<AgeingBucket, string> = {
  CURRENT: 'Not due',
  '1-30': '1–30 days',
  '31-60': '31–60',
  '61-90': '61–90',
  '90+': 'Over 90',
};
const TONE: Record<AgeingBucket, string> = {
  CURRENT: '',
  '1-30': '',
  '31-60': 'text-warning',
  '61-90': 'text-warning',
  '90+': 'text-destructive',
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function AgeingPage() {
  const [asOf, setAsOf] = useState(() => iso(new Date()));
  const [territory, setTerritory] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const t = useDebouncedValue(territory.trim(), 300);
  const { data: r, isLoading, isFetching } = useAgeing({ asOf, territory: t || undefined });
  const { data: org } = useOrg();
  const printRef = useRef<HTMLDivElement>(null);
  const print = usePrint(printRef, 'A4', `Ageing as of ${asOf}`);
  const monthEnd = (() => {
    const d = new Date();
    return iso(new Date(d.getFullYear(), d.getMonth(), 0));
  })();

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ageing"
        icon={Hourglass}
        description="What dealers owe, by how far past due — as of any day."
        actions={
          <Button variant="outline" onClick={print} disabled={!r?.rows.length}>
            <Printer aria-hidden="true" />
            Print
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">As of</span>
          <Input
            type="date"
            value={asOf}
            max={iso(new Date())}
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
            className="h-9 w-44"
          />
        </label>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setAsOf(iso(new Date()))}>
            Today
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsOf(monthEnd)}>
            Last month-end
          </Button>
        </div>
        <Input
          value={territory}
          onChange={(e) => setTerritory(e.target.value)}
          placeholder="Territory"
          className="h-9 w-52"
          aria-label="Territory"
        />
      </div>

      {isLoading || !r ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            {r.buckets.map((b) => (
              <Card key={b}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{LABEL[b]}</p>
                  <p
                    className={cn(
                      'text-lg font-semibold tabular-nums',
                      r.totals[b] > 0 && TONE[b],
                    )}
                  >
                    {money(r.totals[b])}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {r.totalMinor ? Math.round((r.totals[b] / r.totalMinor) * 100) : 0}%
                  </p>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total owed</p>
                <p className="text-lg font-semibold tabular-nums">{money(r.totalMinor)}</p>
                <p className="text-xs text-muted-foreground">{r.rows.length} dealer(s)</p>
              </CardContent>
            </Card>
          </div>

          {r.rows.length === 0 ? (
            <EmptyState icon={Hourglass} title="Nothing owed on this day" />
          ) : (
            <div
              className={cn('overflow-x-auto rounded-md border', isFetching && 'opacity-70')}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dealer</TableHead>
                    {r.buckets.map((b) => (
                      <TableHead key={b} className="text-right">
                        {LABEL[b]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.rows.map((row) => {
                    const expanded = open.has(row.partyId);
                    return (
                      <Fragment key={row.partyId}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => toggle(row.partyId)}
                          aria-expanded={expanded}
                        >
                          <TableCell>
                            <span className="flex items-center gap-1.5">
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                              )}
                              <span className="font-medium">{row.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {row.code}
                              </span>
                            </span>
                            {row.territory && (
                              <span className="ml-6 text-xs text-muted-foreground">
                                {row.territory}
                              </span>
                            )}
                          </TableCell>
                          {r.buckets.map((b) => (
                            <TableCell
                              key={b}
                              className={cn(
                                'text-right tabular-nums',
                                row.buckets[b] && TONE[b],
                              )}
                            >
                              {row.buckets[b] ? money(row.buckets[b]) : '—'}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-semibold tabular-nums">
                            {money(row.totalMinor)}
                          </TableCell>
                        </TableRow>
                        {expanded &&
                          row.invoices.map((i) => (
                            <TableRow key={i.id} className="bg-muted/30 text-sm">
                              <TableCell className="pl-10">
                                <span className="font-mono">{i.docNo}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {fmtDate(i.invoiceDate)} · due{' '}
                                  {fmtDate(i.dueDate ?? i.invoiceDate)}
                                  {i.daysOverdue > 0 ? ` · ${i.daysOverdue}d late` : ''}
                                </span>
                              </TableCell>
                              {r.buckets.map((b) => (
                                <TableCell key={b} className="text-right tabular-nums">
                                  {i.bucket === b ? money(i.balanceMinor) : ''}
                                </TableCell>
                              ))}
                              <TableCell className="text-right">
                                <Link
                                  to={`/receivables/statement?partyId=${row.partyId}`}
                                  className="text-xs hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Statement →
                                </Link>
                              </TableCell>
                            </TableRow>
                          ))}
                      </Fragment>
                    );
                  })}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Total</TableCell>
                    {r.buckets.map((b) => (
                      <TableCell key={b} className="text-right tabular-nums">
                        {money(r.totals[b])}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">
                      {money(r.totalMinor)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
          <OffScreen>
            <AgeingDoc ref={printRef} r={r} org={org} labels={LABEL} />
          </OffScreen>
        </>
      )}
    </div>
  );
}
