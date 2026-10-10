import { BarChart3, Percent } from 'lucide-react';
import { useState } from 'react';

import { Select } from '@/components/ui/select';
import { money } from '@/features/dealers/creditMath';
import { useSalesReport } from '@/hooks/data/useReports';

import { PeriodFilters, ReportShell } from './ReportKit';
import { usePeriod } from './usePeriod';

import type { ReportColumn } from './ReportKit';
import type { SalesChannel } from '@shared/enums';
import type { SalesGrouping } from '@shared/reports';
import type { SalesReportRow } from '@shared/types';

const GROUPS: { value: SalesGrouping; label: string; head: string }[] = [
  { value: 'dealer', label: 'By dealer / customer', head: 'Dealer' },
  { value: 'product', label: 'By product', head: 'Product' },
  { value: 'brand', label: 'By brand', head: 'Brand' },
  { value: 'salesperson', label: 'By salesperson', head: 'Salesperson' },
  { value: 'channel', label: 'Channel comparison', head: 'Channel' },
  { value: 'day', label: 'By day', head: 'Day' },
  { value: 'month', label: 'By month', head: 'Month' },
];

/**
 * Sales (Day 37): one report, grouped as asked — dealer, product, brand, salesperson, channel,
 * day or month. Net of returns in the same period. `margin` is the gross-margin view: the same
 * figures by product, with cost and margin first (it needs `report:profit` and `stock:viewCost`).
 */
export function SalesReportScreen({ margin = false }: { margin?: boolean }) {
  const period = usePeriod();
  const [groupBy, setGroupBy] = useState<SalesGrouping>(margin ? 'product' : 'dealer');
  const [channel, setChannel] = useState<'' | SalesChannel>('');
  const { data, isLoading, isFetching } = useSalesReport({
    from: period.from,
    to: period.to,
    locationId: period.locationId || undefined,
    groupBy,
    channel: channel || undefined,
  });
  const t = data?.totals;
  const head = GROUPS.find((g) => g.value === groupBy)!.head;
  const showMargin = !data?.costHidden;

  const columns: ReportColumn<SalesReportRow>[] = [
    {
      key: 'label',
      header: head,
      cell: (r) => (
        <div>
          <p className="font-medium">{r.label}</p>
          {r.sublabel && (
            <p className="font-mono text-xs text-muted-foreground">{r.sublabel}</p>
          )}
        </div>
      ),
      csv: (r) => (r.sublabel ? `${r.label} (${r.sublabel})` : r.label),
    },
    {
      key: 'invoices',
      header: 'Invoices',
      align: 'right',
      cell: (r) => r.invoices,
      csv: (r) => r.invoices,
      total: t?.invoices,
      csvTotal: t?.invoices,
    },
    {
      key: 'qty',
      header: 'Units',
      align: 'right',
      cell: (r) => r.qtyBase.toLocaleString(),
      csv: (r) => r.qtyBase,
      total: t?.qtyBase.toLocaleString(),
      csvTotal: t?.qtyBase,
    },
    ...(margin
      ? []
      : [
          {
            key: 'sales',
            header: 'Sales',
            align: 'right' as const,
            cell: (r: SalesReportRow) => money(r.salesMinor),
            csv: (r: SalesReportRow) => r.salesMinor / 100,
            total: t && money(t.salesMinor),
            csvTotal: t && t.salesMinor / 100,
          },
          {
            key: 'returns',
            header: 'Returns',
            align: 'right' as const,
            cell: (r: SalesReportRow) => (r.returnsMinor ? `−${money(r.returnsMinor)}` : '—'),
            csv: (r: SalesReportRow) => r.returnsMinor / 100,
            total: t && `−${money(t.returnsMinor)}`,
            csvTotal: t && t.returnsMinor / 100,
          },
        ]),
    {
      key: 'net',
      header: 'Net sales',
      align: 'right',
      cell: (r) => <span className="font-medium">{money(r.netMinor)}</span>,
      csv: (r) => r.netMinor / 100,
      total: t && money(t.netMinor),
      csvTotal: t && t.netMinor / 100,
    },
    ...(showMargin
      ? [
          {
            key: 'cost',
            header: 'Cost',
            align: 'right' as const,
            cell: (r: SalesReportRow) => money(r.costMinor ?? 0),
            csv: (r: SalesReportRow) => (r.costMinor ?? 0) / 100,
            total: t && money(t.costMinor ?? 0),
            csvTotal: t && (t.costMinor ?? 0) / 100,
          },
          {
            key: 'margin',
            header: 'Margin',
            align: 'right' as const,
            cell: (r: SalesReportRow) => money(r.marginMinor ?? 0),
            csv: (r: SalesReportRow) => (r.marginMinor ?? 0) / 100,
            total: t && money(t.marginMinor ?? 0),
            csvTotal: t && (t.marginMinor ?? 0) / 100,
          },
          {
            key: 'pct',
            header: 'Margin %',
            align: 'right' as const,
            cell: (r: SalesReportRow) => (r.marginPct == null ? '—' : `${r.marginPct}%`),
            csv: (r: SalesReportRow) => r.marginPct,
            total: t?.marginPct == null ? '—' : `${t.marginPct}%`,
            csvTotal: t?.marginPct ?? null,
          },
        ]
      : []),
  ];

  const rows =
    margin && data
      ? [...data.rows].sort((a, b) => (b.marginMinor ?? 0) - (a.marginMinor ?? 0))
      : data?.rows;

  return (
    <ReportShell
      title={margin ? 'Gross margin' : 'Sales'}
      icon={margin ? Percent : BarChart3}
      description={
        margin
          ? 'Net sales against what the goods cost when they were sold — by product, brand or dealer.'
          : 'Sales net of returns, grouped the way you need them. Channel comparison is one of the groupings.'
      }
      subtitle={`${GROUPS.find((g) => g.value === groupBy)!.label} · ${period.subtitle}`}
      filters={
        <PeriodFilters
          from={period.from}
          to={period.to}
          locationId={period.locationId}
          onChange={period.set}
        >
          <Select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as SalesGrouping)}
            className="w-52"
            aria-label="Group by"
          >
            {GROUPS.filter(
              (g) =>
                !margin ||
                ['product', 'brand', 'dealer', 'salesperson', 'channel'].includes(g.value),
            ).map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
          <Select
            value={channel}
            onChange={(e) => setChannel(e.target.value as '' | SalesChannel)}
            className="w-40"
            aria-label="Channel"
          >
            <option value="">Both channels</option>
            <option value="WHOLESALE">Wholesale</option>
            <option value="COUNTER">Counter</option>
          </Select>
        </PeriodFilters>
      }
      ties={data?.ties}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.key}
      isLoading={isLoading}
      isFetching={isFetching}
      csvName={`${margin ? 'gross-margin' : 'sales'}-${groupBy}-${period.from}-to-${period.to}`}
      emptyTitle="No sales in this period"
      note={
        data?.costHidden
          ? margin
            ? 'Cost and margin need the report:profit and stock:viewCost permissions.'
            : null
          : data && data.uncostedLines > 0
            ? `${data.uncostedLines} line(s) were sold before they had a cost — their margin is overstated.`
            : null
      }
    />
  );
}
