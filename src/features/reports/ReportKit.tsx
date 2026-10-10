import { CheckCircle2, Download, Printer, TriangleAlert } from 'lucide-react';
import { useRef } from 'react';

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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePrint } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';
import { LocationFilter } from '@/features/inventory/LocationFilter';
import { useOrg } from '@/hooks/data/useOrg';
import { cn } from '@/lib/utils';

import { downloadCsv } from './reportCsv';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ReportTie } from '@shared/types';

/**
 * The report kit (Day 37): one shell for every report, so they all filter, total, tie, export and
 * print the same way.
 *
 *  - **Print / PDF** prints the report card itself — title, period, table, totals and ties — on A4;
 *    the browser's dialog saves it as a PDF, as every other document in the app does.
 *  - **CSV** downloads exactly the columns on screen.
 *  - **Ties** show each total recomputed from the ledger underneath, green when they agree.
 */

export interface ReportColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** What goes in the CSV. Omit to leave the column out of the export. */
  csv?: (row: T) => string | number | null;
  align?: 'right';
  /** The totals-row cell, and its CSV value. */
  total?: ReactNode;
  csvTotal?: string | number | null;
}

export function ReportShell<T>({
  title,
  icon,
  description,
  subtitle,
  filters,
  ties,
  columns,
  rows,
  rowKey,
  isLoading,
  isFetching,
  note,
  csvName,
  emptyTitle = 'Nothing in this period',
  extra,
}: {
  title: string;
  icon: LucideIcon;
  description: string;
  /** The period and filters in words — printed under the title. */
  subtitle: string;
  filters: ReactNode;
  ties?: ReportTie[];
  columns: ReportColumn<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  isLoading: boolean;
  isFetching?: boolean;
  /** A caveat under the table — hidden costs, uncosted lines. */
  note?: ReactNode;
  csvName: string;
  emptyTitle?: string;
  /** Summary cards or a second table, above the main one. */
  extra?: ReactNode;
}) {
  const { data: org } = useOrg();
  const ref = useRef<HTMLDivElement>(null);
  const print = usePrint(ref, 'A4', `${title} ${subtitle}`);
  const hasTotals = columns.some((c) => c.total !== undefined);

  const exportCsv = () => {
    const cols = columns.filter((c) => c.csv);
    const body = (rows ?? []).map((r) => cols.map((c) => c.csv!(r)));
    if (hasTotals) body.push(cols.map((c, i) => c.csvTotal ?? (i === 0 ? 'Total' : '')));
    downloadCsv(
      `${csvName}.csv`,
      cols.map((c) => c.header),
      body,
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        icon={icon}
        description={description}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!rows?.length}>
              <Download aria-hidden="true" />
              CSV
            </Button>
            <Button variant="outline" onClick={print} disabled={!rows}>
              <Printer aria-hidden="true" />
              Print / PDF
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-end gap-3">{filters}</div>
      {extra}
      <Card>
        <CardContent className={cn('pt-6', isFetching && 'opacity-70')}>
          <div ref={ref} className="space-y-3 bg-background print:p-6">
            <div className="hidden print:block">
              <p className="text-lg font-semibold">{org?.name}</p>
              <p className="text-base font-medium">{title}</p>
              <p className="text-sm">{subtitle}</p>
            </div>
            {isLoading ? (
              <Skeleton className="h-64" />
            ) : !rows || rows.length === 0 ? (
              <EmptyState icon={icon} title={emptyTitle} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((c) => (
                        <TableHead
                          key={c.key}
                          className={cn(c.align === 'right' && 'text-right')}
                        >
                          {c.header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={rowKey(r)}>
                        {columns.map((c) => (
                          <TableCell
                            key={c.key}
                            className={cn(c.align === 'right' && 'text-right tabular-nums')}
                          >
                            {c.cell(r)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                  {hasTotals && (
                    <TableFooter>
                      <TableRow className="font-semibold">
                        {columns.map((c, i) => (
                          <TableCell
                            key={c.key}
                            className={cn(c.align === 'right' && 'text-right tabular-nums')}
                          >
                            {c.total ?? (i === 0 ? 'Total' : '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            )}
            {note && <div className="text-xs text-muted-foreground">{note}</div>}
            {ties && ties.length > 0 && <Ties ties={ties} />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Ties({ ties }: { ties: ReportTie[] }) {
  return (
    <ul className="space-y-1 border-t pt-3 text-xs">
      {ties.map((t) => (
        <li
          key={t.label}
          className={cn(
            'flex items-center gap-1.5',
            t.matches ? 'text-success' : 'font-medium text-destructive',
          )}
        >
          {t.matches ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>
            {t.label}: {fmtTie(t.reportMinor, t.label)}
            {t.matches
              ? ' — ties.'
              : ` — but the ledger says ${fmtTie(t.ledgerMinor, t.label)}.`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Unit ties are counts, not money. */
const fmtTie = (n: number, label: string) =>
  /units|counted/i.test(label) ? n.toLocaleString() : money(n);

/** The period and location every report starts from. */
export function PeriodFilters({
  from,
  to,
  locationId,
  onChange,
  children,
}: {
  from: string;
  to: string;
  locationId: string;
  onChange: (patch: { from?: string; to?: string; locationId?: string }) => void;
  children?: ReactNode;
}) {
  return (
    <>
      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">From</span>
        <Input
          type="date"
          value={from}
          max={to}
          onChange={(e) => onChange({ from: e.target.value })}
          aria-label="From"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-muted-foreground">To</span>
        <Input
          type="date"
          value={to}
          min={from}
          onChange={(e) => onChange({ to: e.target.value })}
          aria-label="To"
        />
      </label>
      <LocationFilter
        value={locationId}
        onChange={(id) => onChange({ locationId: id })}
        excludeTransit
      />
      {children}
    </>
  );
}
