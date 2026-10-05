import { ClipboardList, Printer } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { OffScreen } from '@/features/counter/print/PrintDocs';
import { fmtDate, usePrint } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';
import { useOrg } from '@/hooks/data/useOrg';
import { useCollectionSheet } from '@/hooks/data/useReceivables';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { CollectionDoc } from './print/ReceivablesDocs';

/**
 * The collection sheet (Day 29): who to visit and what to ask for. Every dealer with an open
 * invoice, most overdue first, their invoices, and any advance of theirs already on account.
 * Printed, it is the collector's round — with blank columns for what they collect and a signature.
 */
export function CollectionSheetPage() {
  const [territory, setTerritory] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const t = useDebouncedValue(territory.trim(), 300);
  const { data, isLoading } = useCollectionSheet({
    territory: t || undefined,
    overdueOnly: overdueOnly || undefined,
  });
  const { data: org } = useOrg();
  const printRef = useRef<HTMLDivElement>(null);
  const label =
    [t && `Territory: ${t}`, overdueOnly && 'Overdue only'].filter(Boolean).join(' · ') ||
    'All dealers';
  const print = usePrint(printRef, 'A4', `Collection sheet ${data?.asOf ?? ''}`);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Collection sheet"
        icon={ClipboardList}
        description="Dealers with money owing, most overdue first — print it for the round."
        actions={
          <Button variant="outline" onClick={print} disabled={!data?.rows.length}>
            <Printer aria-hidden="true" />
            Print
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-4">
        <Input
          value={territory}
          onChange={(e) => setTerritory(e.target.value)}
          placeholder="Territory — e.g. Chattogram"
          className="w-64"
          aria-label="Territory"
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={overdueOnly} onCheckedChange={setOverdueOnly} />
          Overdue only
        </label>
        {data && (
          <p className="ml-auto text-sm tabular-nums">
            {data.totals.dealers} dealer(s) · due <strong>{money(data.totals.dueMinor)}</strong>{' '}
            · overdue{' '}
            <strong className="text-destructive">{money(data.totals.overdueMinor)}</strong>
          </p>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data?.rows.length ? (
        <EmptyState
          icon={ClipboardList}
          title="Nobody owes anything"
          description="No dealer has an open invoice."
        />
      ) : (
        <div className="space-y-3">
          {data.rows.map((r) => (
            <Card key={r.partyId}>
              <CardContent className="grid gap-3 pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_10rem]">
                <div className="min-w-0 text-sm">
                  <Link
                    to={`/receivables/statement?partyId=${r.partyId}`}
                    className="font-semibold hover:underline"
                  >
                    {r.name}
                  </Link>{' '}
                  <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                  {r.phone && <p>{r.phone}</p>}
                  {r.address && <p className="text-xs text-muted-foreground">{r.address}</p>}
                  {r.territory && (
                    <p className="text-xs text-muted-foreground">{r.territory}</p>
                  )}
                </div>
                <ul className="space-y-0.5 text-xs">
                  {r.invoices.map((i) => (
                    <li key={i.id} className="flex justify-between gap-2 tabular-nums">
                      <span className="font-mono">{i.docNo}</span>
                      <span className="text-muted-foreground">
                        {i.dueDate ? `due ${fmtDate(i.dueDate)}` : ''}
                        {i.daysOverdue !== null && i.daysOverdue > 0 && (
                          <span className="ml-1 font-medium text-destructive">
                            {i.daysOverdue}d late
                          </span>
                        )}
                      </span>
                      <span>{money(i.balanceMinor)}</span>
                    </li>
                  ))}
                </ul>
                <div className="text-right text-sm tabular-nums">
                  <p className="text-lg font-semibold">{money(r.totalDueMinor)}</p>
                  {r.overdueMinor > 0 && (
                    <p className="text-destructive">{money(r.overdueMinor)} overdue</p>
                  )}
                  {r.advanceMinor > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {money(r.advanceMinor)} on account
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <OffScreen>
          <CollectionDoc ref={printRef} sheet={data} org={org} label={label} />
        </OffScreen>
      )}
    </div>
  );
}
