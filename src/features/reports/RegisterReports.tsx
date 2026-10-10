import { HandCoins, MonitorSmartphone, Truck } from 'lucide-react';
import { useState } from 'react';

import { StatusPill } from '@/components/common/StatusPill';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { money } from '@/features/dealers/creditMath';
import {
  useCollectionRegister,
  useDispatchRegister,
  useShiftSummary,
} from '@/hooks/data/useReports';
import { cn, humanise } from '@/lib/utils';

import { PeriodFilters, ReportShell } from './ReportKit';
import { usePeriod } from './usePeriod';

import type { ReportColumn } from './ReportKit';
import type { PaymentMethod } from '@shared/enums';
import type {
  CollectionRegisterRow,
  DispatchRegisterRow,
  ShiftSummaryRow,
} from '@shared/types';

const when = (iso: string) => new Date(iso).toLocaleString();

/** Dispatch register (Day 37): every challan that left in the period. */
export function DispatchRegisterScreen() {
  const period = usePeriod();
  const { data, isLoading, isFetching } = useDispatchRegister({
    from: period.from,
    to: period.to,
    locationId: period.locationId || undefined,
  });
  const t = data?.totals;
  const columns: ReportColumn<DispatchRegisterRow>[] = [
    {
      key: 'doc',
      header: 'Challan',
      cell: (r) => <span className="font-mono text-sm">{r.docNo}</span>,
      csv: (r) => r.docNo,
    },
    {
      key: 'at',
      header: 'Dispatched',
      cell: (r) => when(r.dispatchedAt),
      csv: (r) => r.dispatchedAt,
    },
    { key: 'dealer', header: 'Dealer', cell: (r) => r.dealerName, csv: (r) => r.dealerName },
    {
      key: 'order',
      header: 'Order',
      cell: (r) => <span className="font-mono text-xs">{r.orderDocNo}</span>,
      csv: (r) => r.orderDocNo,
    },
    {
      key: 'qty',
      header: 'Units',
      align: 'right',
      cell: (r) => r.qtyBase,
      csv: (r) => r.qtyBase,
      total: t?.qtyBase,
      csvTotal: t?.qtyBase,
    },
    {
      key: 'inv',
      header: 'Invoice',
      cell: (r) => <span className="font-mono text-xs">{r.invoiceDocNo ?? '—'}</span>,
      csv: (r) => r.invoiceDocNo,
    },
    {
      key: 'value',
      header: 'Invoiced',
      align: 'right',
      cell: (r) => (r.invoiceMinor == null ? '—' : money(r.invoiceMinor)),
      csv: (r) => (r.invoiceMinor ?? 0) / 100,
      total: t && money(t.invoiceMinor),
      csvTotal: t && t.invoiceMinor / 100,
    },
    {
      key: 'transport',
      header: 'Transport',
      cell: (r) => <span className="text-xs">{r.transport ?? '—'}</span>,
      csv: (r) => r.transport,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusPill status={r.status} />,
      csv: (r) => r.status,
      total: t && `${t.delivered} delivered`,
    },
  ];
  return (
    <ReportShell
      title="Dispatch register"
      icon={Truck}
      description="Every challan that left the warehouse in the period, with its invoice and transport."
      subtitle={period.subtitle}
      filters={
        <PeriodFilters
          from={period.from}
          to={period.to}
          locationId={period.locationId}
          onChange={period.set}
        />
      }
      ties={data?.ties}
      columns={columns}
      rows={data?.rows}
      rowKey={(r) => r.id}
      isLoading={isLoading}
      isFetching={isFetching}
      csvName={`dispatch-register-${period.from}-to-${period.to}`}
      emptyTitle="Nothing dispatched in this period"
    />
  );
}

/** Collection register (Day 37): dealer receipts in the period, by method. */
export function CollectionRegisterScreen() {
  const period = usePeriod();
  const [method, setMethod] = useState<'' | PaymentMethod>('');
  const { data, isLoading, isFetching } = useCollectionRegister({
    from: period.from,
    to: period.to,
    locationId: period.locationId || undefined,
    method: method || undefined,
  });
  const t = data?.totals;
  const columns: ReportColumn<CollectionRegisterRow>[] = [
    {
      key: 'doc',
      header: 'Receipt',
      cell: (r) => <span className="font-mono text-sm">{r.docNo}</span>,
      csv: (r) => r.docNo,
    },
    { key: 'at', header: 'Received', cell: (r) => when(r.paidAt), csv: (r) => r.paidAt },
    { key: 'party', header: 'From', cell: (r) => r.partyName, csv: (r) => r.partyName },
    {
      key: 'method',
      header: 'Method',
      cell: (r) => (
        <span className="text-sm">
          {humanise(r.method)}
          {r.reference && (
            <span className="font-mono text-xs text-muted-foreground"> · {r.reference}</span>
          )}
          {r.chequeStatus && r.chequeStatus !== 'CLEARED' && (
            <StatusPill status={r.chequeStatus} className="ml-2" />
          )}
        </span>
      ),
      csv: (r) =>
        `${r.method}${r.reference ? ` ${r.reference}` : ''}${r.chequeStatus ? ` (${r.chequeStatus})` : ''}`,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (r) => money(r.amountMinor),
      csv: (r) => r.amountMinor / 100,
      total: t && money(t.amountMinor),
      csvTotal: t && t.amountMinor / 100,
    },
    {
      key: 'onacc',
      header: 'On account',
      align: 'right',
      cell: (r) => (r.unallocatedMinor ? money(r.unallocatedMinor) : '—'),
      csv: (r) => r.unallocatedMinor / 100,
    },
  ];
  return (
    <ReportShell
      title="Collection register"
      icon={HandCoins}
      description="Money received from dealers in the period. Cheques count once they clear."
      subtitle={`${method ? `${humanise(method)} · ` : ''}${period.subtitle}`}
      filters={
        <PeriodFilters
          from={period.from}
          to={period.to}
          locationId={period.locationId}
          onChange={period.set}
        >
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as '' | PaymentMethod)}
            className="w-44"
            aria-label="Method"
          >
            <option value="">Any method</option>
            {['CASH', 'BANK', 'CHEQUE', 'MFS', 'CARD'].map((m) => (
              <option key={m} value={m}>
                {humanise(m)}
              </option>
            ))}
          </Select>
        </PeriodFilters>
      }
      extra={
        data && data.byMethod.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {data.byMethod.map((m) => (
              <Card key={m.method}>
                <CardContent className="space-y-1 pt-5">
                  <p className="text-xs text-muted-foreground">
                    {humanise(m.method)} · {m.count}
                  </p>
                  <p className="text-lg tabular-nums">{money(m.amountMinor)}</p>
                </CardContent>
              </Card>
            ))}
            {data.totals.pendingChequesMinor > 0 && (
              <Card>
                <CardContent className="space-y-1 pt-5">
                  <p className="text-xs text-muted-foreground">Cheques not yet cleared</p>
                  <p className="text-lg tabular-nums text-warning">
                    {money(data.totals.pendingChequesMinor)}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null
      }
      ties={data?.ties}
      columns={columns}
      rows={data?.rows}
      rowKey={(r) => r.id}
      isLoading={isLoading}
      isFetching={isFetching}
      csvName={`collections-${period.from}-to-${period.to}`}
      emptyTitle="Nothing collected in this period"
    />
  );
}

/** POS shift summary (Day 37): every shift closed in the period — takings, returns, variance. */
export function ShiftSummaryScreen() {
  const period = usePeriod();
  const { data, isLoading, isFetching } = useShiftSummary({
    from: period.from,
    to: period.to,
    locationId: period.locationId || undefined,
  });
  const t = data?.totals;
  const columns: ReportColumn<ShiftSummaryRow>[] = [
    {
      key: 'shift',
      header: 'Shift',
      cell: (r) => (
        <div>
          <p className="font-medium">
            {r.locationName} · {r.terminalCode}
          </p>
          <p className="text-xs text-muted-foreground">
            {when(r.openedAt)} → {r.closedAt ? when(r.closedAt) : 'open'}
          </p>
        </div>
      ),
      csv: (r) => `${r.locationName} ${r.terminalCode} ${r.openedAt} to ${r.closedAt ?? ''}`,
    },
    {
      key: 'who',
      header: 'Cashier',
      cell: (r) => r.closedBy ?? r.openedBy,
      csv: (r) => r.closedBy ?? r.openedBy,
    },
    {
      key: 'sales',
      header: 'Sales',
      align: 'right',
      cell: (r) => r.salesCount,
      csv: (r) => r.salesCount,
      total: t?.salesCount,
      csvTotal: t?.salesCount,
    },
    {
      key: 'net',
      header: 'Net',
      align: 'right',
      cell: (r) => money(r.netMinor),
      csv: (r) => r.netMinor / 100,
      total: t && money(t.netMinor),
      csvTotal: t && t.netMinor / 100,
    },
    {
      key: 'returns',
      header: 'Returns',
      align: 'right',
      cell: (r) => (r.returnsMinor ? money(r.returnsMinor) : '—'),
      csv: (r) => r.returnsMinor / 100,
      total: t && money(t.returnsMinor),
      csvTotal: t && t.returnsMinor / 100,
    },
    {
      key: 'expected',
      header: 'Expected cash',
      align: 'right',
      cell: (r) => (r.expectedCashMinor == null ? '—' : money(r.expectedCashMinor)),
      csv: (r) => (r.expectedCashMinor ?? 0) / 100,
    },
    {
      key: 'counted',
      header: 'Counted',
      align: 'right',
      cell: (r) => (r.countedCashMinor == null ? '—' : money(r.countedCashMinor)),
      csv: (r) => (r.countedCashMinor ?? 0) / 100,
    },
    {
      key: 'variance',
      header: 'Variance',
      align: 'right',
      cell: (r) => (
        <span
          className={cn(
            (r.varianceMinor ?? 0) < 0 && 'font-medium text-destructive',
            (r.varianceMinor ?? 0) > 0 && 'text-warning',
          )}
        >
          {r.varianceMinor == null ? '—' : money(r.varianceMinor)}
        </span>
      ),
      csv: (r) => (r.varianceMinor ?? 0) / 100,
      total: t && money(t.varianceMinor),
      csvTotal: t && t.varianceMinor / 100,
    },
  ];
  return (
    <ReportShell
      title="POS shift summary"
      icon={MonitorSmartphone}
      description="Every counter shift closed in the period: what it sold, what came back, and how the drawer counted."
      subtitle={period.subtitle}
      filters={
        <PeriodFilters
          from={period.from}
          to={period.to}
          locationId={period.locationId}
          onChange={period.set}
        />
      }
      ties={data?.ties}
      columns={columns}
      rows={data?.rows}
      rowKey={(r) => r.id}
      isLoading={isLoading}
      isFetching={isFetching}
      csvName={`shifts-${period.from}-to-${period.to}`}
      emptyTitle="No shifts closed in this period"
    />
  );
}
