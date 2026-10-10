import { Download, NotebookTabs } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { DealerPicker } from '@/components/common/DealerPicker';
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
import { LocationFilter } from '@/features/inventory/LocationFilter';
import { usePurchaseRegister } from '@/hooks/data/usePurchasing';
import { cn } from '@/lib/utils';

import { money, todayDay } from './purchaseFormat';

import { fromMinor } from '@shared/money';

import type { PartyPayload, PurchaseRegisterPayload } from '@shared/types';

/**
 * The purchase register (Day 35): every supplier bill posted in a period, and every return as a
 * negative row, with what is paid and still owed on each. Its billed and returned totals are the
 * supplier ledger's purchase and debit-note entries for the same period.
 */
export function PurchaseRegister() {
  const today = todayDay();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [supplier, setSupplier] = useState<PartyPayload | null>(null);
  const [locationId, setLocationId] = useState('');
  const { data, isLoading, isFetching } = usePurchaseRegister({
    from,
    to,
    supplierPartyId: supplier?.id,
    locationId: locationId || undefined,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase register"
        icon={NotebookTabs}
        description="Supplier bills and returns for a period, with what is paid and still owed."
        actions={
          data && (
            <Button variant="outline" onClick={() => downloadCsv(data)}>
              <Download aria-hidden="true" />
              CSV
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="w-72">
          <DealerPicker
            role="SUPPLIER"
            value={supplier}
            onChange={setSupplier}
            emptyLabel="All suppliers…"
          />
        </div>
        <LocationFilter value={locationId} onChange={setLocationId} excludeTransit />
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Billed" value={money(data.totals.billedMinor)} />
          <Stat label="Returned" value={`−${money(data.totals.returnedMinor)}`} />
          <Stat label="Net purchases" value={money(data.totals.netMinor)} strong />
          <Stat label="Paid on these bills" value={money(data.totals.paidMinor)} />
          <Stat label="Still owed" value={money(data.totals.balanceMinor)} />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={NotebookTabs}
          title="Nothing purchased in this period"
          description="Posted goods receipts and purchase returns appear here."
        />
      ) : (
        <div className={cn('overflow-x-auto rounded-md border', isFetching && 'opacity-70')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Bill / ref</TableHead>
                <TableHead className="text-right">Goods</TableHead>
                <TableHead className="text-right">Charges</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Owed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.id} className={cn(r.kind === 'RETURN' && 'text-warning')}>
                  <TableCell className="text-sm">
                    {new Date(r.date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={r.kind === 'GRN' ? `/purchase/grn/${r.id}` : '/purchase/returns'}
                      className="font-mono text-sm underline-offset-2 hover:underline"
                    >
                      {r.docNo}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {r.kind === 'GRN' ? 'Bill' : 'Return'} · {r.locationName}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{r.supplierName}</TableCell>
                  <TableCell className="text-sm">
                    {r.supplierInvoiceNo && (
                      <span className="font-mono">{r.supplierInvoiceNo}</span>
                    )}
                    {r.refDocNo && (
                      <span className="block text-xs text-muted-foreground">{r.refDocNo}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(r.goodsMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.otherChargesMinor ? money(r.otherChargesMinor) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {money(r.totalMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.kind === 'GRN' ? money(r.paidMinor) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.balanceMinor ? money(r.balanceMinor) : '—'}
                    {r.kind === 'GRN' && r.dueDate && r.balanceMinor > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        due {r.dueDate.slice(0, 10)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.bySupplier.length > 1 && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>By supplier</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                  <TableHead className="text-right">Owed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bySupplier.map((s) => (
                  <TableRow key={s.supplierPartyId}>
                    <TableCell>{s.supplierName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(s.billedMinor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.returnedMinor ? money(s.returnedMinor) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(s.balanceMinor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('tabular-nums', strong ? 'text-lg font-semibold' : 'text-lg')}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function downloadCsv(d: PurchaseRegisterPayload) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    [
      'Date',
      'Type',
      'Document',
      'Supplier',
      'Bill no.',
      'Ref',
      'Goods',
      'Charges',
      'Total',
      'Paid',
      'Owed',
      'Due',
    ],
    ...d.rows.map((r) => [
      r.date.slice(0, 10),
      r.kind === 'GRN' ? 'Bill' : 'Return',
      r.docNo,
      r.supplierName ?? '',
      r.supplierInvoiceNo ?? '',
      r.refDocNo ?? '',
      fromMinor(r.goodsMinor),
      fromMinor(r.otherChargesMinor),
      fromMinor(r.totalMinor),
      fromMinor(r.paidMinor),
      fromMinor(r.balanceMinor),
      r.dueDate?.slice(0, 10) ?? '',
    ]),
  ].map((row) => row.map(cell).join(','));
  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `purchase-register-${d.from}-to-${d.to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
