import { FileDown, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useStatement } from '@/hooks/data/useReceivables';
import { cn } from '@/lib/utils';

import { balanceText, docLabel } from './format';
import { StatementDoc } from './print/ReceivablesDocs';

/**
 * A party's statement for a period (Day 29): balance brought forward, every entry with the balance
 * after it, balance carried forward. Every figure is the server's — the running balance is computed
 * there, in posting order over the whole account, so a back-dated entry sits where its date puts it.
 *
 * "Print / PDF" prints the A4 statement; the browser's dialog saves it as a PDF named for the
 * dealer and the period.
 */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const RANGES = [
  { label: 'This month', from: (t: Date) => new Date(t.getFullYear(), t.getMonth(), 1) },
  { label: '3 months', from: (t: Date) => new Date(t.getFullYear(), t.getMonth() - 2, 1) },
  {
    label: '12 months',
    from: (t: Date) => new Date(t.getFullYear() - 1, t.getMonth(), t.getDate() + 1),
  },
  { label: 'Everything', from: () => new Date(2000, 0, 1) },
] as const;

export function StatementView({ partyId }: { partyId: string }) {
  const today = new Date();
  const [from, setFrom] = useState(() => iso(RANGES[1].from(today)));
  const [to, setTo] = useState(() => iso(today));
  const { data: s, isFetching, error } = useStatement({ partyId, from, to });
  const { data: org } = useOrg();
  const printRef = useRef<HTMLDivElement>(null);
  const print = usePrint(printRef, 'A4', `Statement ${s?.party.code ?? ''} ${from} to ${to}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="h-9 w-40"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">To</span>
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className="h-9 w-40"
          />
        </label>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.label}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom(iso(r.from(today)));
                setTo(iso(today));
              }}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isFetching && (
            <Loader2
              className="h-4 w-4 animate-spin text-muted-foreground"
              aria-label="Loading"
            />
          )}
          <Button variant="outline" onClick={print} disabled={!s}>
            <FileDown aria-hidden="true" />
            Print / PDF
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">The statement could not be produced.</p>
      )}

      {s && (
        <div
          className={cn(
            'overflow-x-auto rounded-md border transition-opacity',
            isFetching && 'opacity-70',
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/40">
                <TableCell colSpan={5} className="italic">
                  Brought forward
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {balanceText(s.openingBalanceMinor)}
                </TableCell>
              </TableRow>
              {s.lines.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No entries in this period.
                  </TableCell>
                </TableRow>
              )}
              {s.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {fmtDate(l.postedAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="text-sm">{docLabel(l.docType)}</span>
                    {l.refDocNo && (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {l.refDocNo}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{l.narration}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.debitMinor ? money(l.debitMinor) : ''}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.creditMinor ? money(l.creditMinor) : ''}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {balanceText(l.runningMinor)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={3}>Carried forward</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(s.totals.debitMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(s.totals.creditMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {balanceText(s.closingBalanceMinor)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
      {s && (
        <p className="text-xs text-muted-foreground">
          Balance now:{' '}
          <span className="font-medium tabular-nums">{balanceText(s.currentBalanceMinor)}</span>
          {s.to < iso(today) &&
            ' — the period ends before today, so later entries are not shown.'}
        </p>
      )}

      {s && (
        <OffScreen>
          <StatementDoc ref={printRef} s={s} org={org} />
        </OffScreen>
      )}
    </div>
  );
}
