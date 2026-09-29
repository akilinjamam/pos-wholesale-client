import { AlertTriangle, Calculator, Printer, Wallet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useOrg } from '@/hooks/data/useOrg';
import {
  useCloseSession,
  useCurrentSession,
  useHeldSales,
  useSessions,
} from '@/hooks/data/usePos';

import { ZReport } from '../print/PrintDocs';
import { fmtDateTime, loadPrintSettings, METHOD_LABELS, usePrint } from '../print/printHelpers';
import { money } from '../Sale/saleHelpers';

import { DENOMINATIONS } from '@shared/pos';

import type { PosSessionPayload } from '@shared/types';

/**
 * The shift (Day 20): what the drawer should hold right now, the cash count, and the close that
 * freezes it all into the Z-report. Counted cash is the sum of the note-by-note count — never a
 * typed total — so a variance can be traced to a miscounted bundle later.
 */
export function ShiftScreen() {
  const current = useCurrentSession();
  const [zReport, setZReport] = useState<PosSessionPayload | null>(null);

  // The live figures are only as good as the last fetch — this screen always wants them fresh.
  const { refetch } = current;
  useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Shift"
        description="Count the drawer, close the shift, print the Z-report"
        icon={Wallet}
      />
      {current.isPending ? null : current.data ? (
        <CloseShift session={current.data} onClosed={setZReport} />
      ) : (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span>You have no open shift.</span>
            <Link
              to="/counter/sale"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Open one at the till
            </Link>
          </CardContent>
        </Card>
      )}
      <ShiftHistory onOpen={setZReport} />
      {zReport && <ZReportDialog session={zReport} onClose={() => setZReport(null)} />}
    </div>
  );
}

// ─── Live figures and the count ─────────────────────────────────────────────────────────

function CloseShift({
  session,
  onClosed,
}: {
  session: PosSessionPayload;
  onClosed: (s: PosSessionPayload) => void;
}) {
  const close = useCloseSession();
  const held = useHeldSales(true);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const counted = useMemo(
    () => DENOMINATIONS.reduce((s, n) => s + n * 100 * (Number(counts[n]) || 0), 0),
    [counts],
  );
  const variance = counted - session.expectedCashMinor;
  const t = session.totals;
  const parked = held.data?.length ?? 0;

  const submit = () =>
    close.mutate(
      {
        id: session.id,
        body: {
          denominations: DENOMINATIONS.map((note) => ({
            note,
            count: Number(counts[note]) || 0,
          })),
          note: note.trim() || null,
        },
      },
      {
        onSuccess: (s) => {
          setConfirming(false);
          onClosed(s);
        },
      },
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {session.locationName} · till {session.terminalCode}
            </p>
            <Badge variant="success">open</Badge>
            <span className="text-sm text-muted-foreground">
              since {fmtDateTime(session.openedAt)}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Figure label={`Sales (${t.salesCount})`} value={money(t.grossMinor)} />
            <Figure label="Discounts" value={`−${money(t.discountMinor)}`} />
            <Figure
              label={`Returns (${t.returnsCount ?? 0})`}
              value={`−${money(t.returnsMinor)}`}
            />
            <Figure label="Net sales" value={money(t.netMinor)} strong />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Taken by method</p>
            {t.byMethod.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing taken yet.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                {t.byMethod.map((m) => (
                  <div key={m.method} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">
                      {METHOD_LABELS[m.method] ?? m.method}
                    </dt>
                    <dd className="tabular-nums">{money(m.amountMinor)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">The drawer should hold</p>
            <dl className="space-y-1 text-sm">
              <Line label="Opening float" value={money(session.openingFloatMinor)} />
              <Line label="+ Cash taken" value={money(t.cashInMinor ?? 0)} />
              <Line label="− Cash refunded" value={money(t.cashOutMinor ?? 0)} />
              <Line label="Expected cash" value={money(session.expectedCashMinor)} strong />
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="flex items-center gap-2 font-medium">
            <Calculator className="h-4 w-4" aria-hidden="true" />
            Count the cash
          </p>
          <div className="grid grid-cols-[4rem_1fr_6rem] items-center gap-x-2 gap-y-1.5 text-sm">
            {DENOMINATIONS.map((n, i) => (
              <div key={n} className="contents">
                <label htmlFor={`den-${n}`} className="text-right font-medium tabular-nums">
                  ৳{n}
                </label>
                <Input
                  id={`den-${n}`}
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  autoFocus={i === 0}
                  inputMode="numeric"
                  value={counts[n] ?? ''}
                  onChange={(e) =>
                    setCounts({ ...counts, [n]: e.target.value.replace(/\D/g, '') })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      const next =
                        inputs.current[i + 1] ?? document.getElementById('shift-note');
                      next?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      inputs.current[i - 1]?.focus();
                    }
                  }}
                  placeholder="0"
                  className="h-8 text-right tabular-nums"
                  aria-label={`Number of ৳${n}`}
                />
                <span className="text-right tabular-nums text-muted-foreground">
                  {money(n * 100 * (Number(counts[n]) || 0))}
                </span>
              </div>
            ))}
          </div>
          <dl className="space-y-1 border-t pt-2 text-sm">
            <Line label="Counted" value={money(counted)} strong />
            <Line label="Expected" value={money(session.expectedCashMinor)} />
            <div className="flex justify-between">
              <dt className="font-medium">
                {variance < 0 ? 'Short' : variance > 0 ? 'Over' : 'Variance'}
              </dt>
              <dd
                className={cn(
                  'font-semibold tabular-nums',
                  variance < 0 && 'text-destructive',
                  variance > 0 && 'text-warning',
                  variance === 0 && 'text-success',
                )}
                aria-live="polite"
              >
                {money(Math.abs(variance))}
              </dd>
            </div>
          </dl>
          <Input
            id="shift-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setConfirming(true)}
            maxLength={300}
            placeholder="Note (why short or over)…"
            aria-label="Closing note"
          />
          {parked > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-warning/10 p-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {parked} parked sale(s) will be left behind — they expire after 24 hours.
            </p>
          )}
          <Button className="w-full" onClick={() => setConfirming(true)}>
            Close shift
          </Button>
        </CardContent>
      </Card>

      {confirming && (
        <Dialog
          open
          onClose={() => setConfirming(false)}
          title="Close the shift?"
          description="The figures are frozen into the Z-report. Nothing more can be sold on this shift."
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Keep counting
              </Button>
              <Button data-autofocus onClick={submit} disabled={close.isPending}>
                Close shift
              </Button>
            </>
          }
        >
          <dl className="space-y-1 text-sm">
            <Line label="Expected" value={money(session.expectedCashMinor)} />
            <Line label="Counted" value={money(counted)} />
            <Line
              label={variance < 0 ? 'Short' : variance > 0 ? 'Over' : 'Variance'}
              value={money(Math.abs(variance))}
              strong
            />
          </dl>
        </Dialog>
      )}
    </div>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('tabular-nums', strong ? 'text-xl font-semibold' : 'text-lg')}>
        {value}
      </p>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between', strong && 'font-semibold')}>
      <dt className={strong ? undefined : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

// ─── History and the Z-report ───────────────────────────────────────────────────────────

function ShiftHistory({ onOpen }: { onOpen: (s: PosSessionPayload) => void }) {
  const { data } = useSessions({ status: 'CLOSED', limit: 15 });
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-0">
        <p className="px-4 pt-4 text-sm font-medium">Closed shifts</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Closed</TableHead>
              <TableHead>Till</TableHead>
              <TableHead>Cashier</TableHead>
              <TableHead className="text-right">Net sales</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Counted</TableHead>
              <TableHead className="text-right">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((s) => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => onOpen(s)}>
                <TableCell>{fmtDateTime(s.closedAt)}</TableCell>
                <TableCell>
                  {s.locationName} · {s.terminalCode}
                </TableCell>
                <TableCell>{s.openedByName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(s.totals.netMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(s.expectedCashMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(s.countedCashMinor ?? 0)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium tabular-nums',
                    (s.varianceMinor ?? 0) < 0 && 'text-destructive',
                    (s.varianceMinor ?? 0) > 0 && 'text-warning',
                  )}
                >
                  {(s.varianceMinor ?? 0) < 0 ? '−' : ''}
                  {money(Math.abs(s.varianceMinor ?? 0))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** The Z-report as it prints, on screen — P prints it. */
function ZReportDialog({
  session,
  onClose,
}: {
  session: PosSessionPayload;
  onClose: () => void;
}) {
  const { data: org } = useOrg();
  const [paper] = useState(() => loadPrintSettings().paper);
  const zRef = useRef<HTMLDivElement>(null);
  const printZ = usePrint(
    zRef,
    paper,
    `Z-report ${session.terminalCode} ${session.closedAt?.slice(0, 10) ?? ''}`,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        printZ();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [printZ]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={session.status === 'CLOSED' ? 'Z-report' : 'X-report'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
          <Button data-autofocus onClick={printZ}>
            <Printer aria-hidden="true" />
            Print (P)
          </Button>
        </>
      }
    >
      <div className="flex justify-center overflow-x-auto rounded-md border bg-white p-2">
        <ZReport ref={zRef} s={session} org={org} paper={paper} />
      </div>
    </Dialog>
  );
}
