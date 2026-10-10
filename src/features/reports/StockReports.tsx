import { Archive, Warehouse } from 'lucide-react';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { money } from '@/features/dealers/creditMath';
import { LocationFilter } from '@/features/inventory/LocationFilter';
import { useDeadStock, useStockValuation } from '@/hooks/data/useReports';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { ReportShell } from './ReportKit';
import { today } from './reportCsv';

import type { ReportColumn } from './ReportKit';
import type { DeadStockRow, StockValuationRow } from '@shared/types';

const item = (r: { name: string; sku: string; variantLabel: string | null }) => (
  <div>
    <p className="font-medium">{r.name}</p>
    <p className="font-mono text-xs text-muted-foreground">
      {r.sku}
      {r.variantLabel ? ` · ${r.variantLabel}` : ''}
    </p>
  </div>
);
const itemCsv = (r: { name: string; sku: string; variantLabel: string | null }) =>
  `${r.sku} ${r.name}${r.variantLabel ? ` (${r.variantLabel})` : ''}`;

/** Stock valuation (Day 37): what is on the shelves now, at the moving average. */
export function StockValuationScreen() {
  const [locationId, setLocationId] = useState('');
  const [groupBy, setGroupBy] = useState<'product' | 'location'>('product');
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 300);
  const { data, isLoading, isFetching } = useStockValuation({
    locationId: locationId || undefined,
    groupBy,
    q: q || undefined,
  });
  const t = data?.totals;
  const columns: ReportColumn<StockValuationRow>[] = [
    { key: 'item', header: 'Item', cell: item, csv: itemCsv },
    ...(groupBy === 'location'
      ? [
          {
            key: 'loc',
            header: 'Location',
            cell: (r: StockValuationRow) => r.locationName,
            csv: (r: StockValuationRow) => r.locationName,
          },
        ]
      : []),
    {
      key: 'qty',
      header: 'On hand',
      align: 'right',
      cell: (r) => `${r.qtyOnHand.toLocaleString()} ${r.baseUom}`,
      csv: (r) => r.qtyOnHand,
      total: t?.qtyOnHand.toLocaleString(),
      csvTotal: t?.qtyOnHand,
    },
    {
      key: 'reserved',
      header: 'Reserved',
      align: 'right',
      cell: (r) => r.qtyReserved || '—',
      csv: (r) => r.qtyReserved,
    },
    ...(data?.costHidden
      ? []
      : [
          {
            key: 'avg',
            header: 'Avg cost',
            align: 'right' as const,
            cell: (r: StockValuationRow) => money(r.avgCostMinor ?? 0),
            csv: (r: StockValuationRow) => (r.avgCostMinor ?? 0) / 100,
          },
          {
            key: 'value',
            header: 'Value',
            align: 'right' as const,
            cell: (r: StockValuationRow) => (
              <span className="font-medium">{money(r.valueMinor ?? 0)}</span>
            ),
            csv: (r: StockValuationRow) => (r.valueMinor ?? 0) / 100,
            total: t && money(t.valueMinor ?? 0),
            csvTotal: t && (t.valueMinor ?? 0) / 100,
          },
        ]),
  ];
  return (
    <ReportShell
      title="Stock valuation"
      icon={Warehouse}
      description="Everything on the shelves now, valued at each item's moving-average cost."
      subtitle={`As of ${today()}`}
      filters={
        <>
          <LocationFilter value={locationId} onChange={setLocationId} excludeTransit />
          <Select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'product' | 'location')}
            className="w-48"
            aria-label="Group by"
          >
            <option value="product">By item</option>
            <option value="location">By item and location</option>
          </Select>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="SKU or name…"
            className="w-56"
            aria-label="Search items"
          />
        </>
      }
      ties={data?.ties}
      columns={columns}
      rows={data?.rows}
      rowKey={(r) => r.key}
      isLoading={isLoading}
      isFetching={isFetching}
      csvName={`stock-valuation-${today()}`}
      emptyTitle="No stock on hand"
      note={data?.costHidden ? 'Costs and values need the stock:viewCost permission.' : null}
    />
  );
}

/** Dead stock (Day 37): on the shelf, and not sold in N days — or ever. */
export function DeadStockScreen() {
  const [locationId, setLocationId] = useState('');
  const [days, setDays] = useState(90);
  const { data, isLoading, isFetching } = useDeadStock({
    locationId: locationId || undefined,
    days,
  });
  const t = data?.totals;
  const columns: ReportColumn<DeadStockRow>[] = [
    { key: 'item', header: 'Item', cell: item, csv: itemCsv },
    { key: 'loc', header: 'Location', cell: (r) => r.locationName, csv: (r) => r.locationName },
    {
      key: 'qty',
      header: 'On hand',
      align: 'right',
      cell: (r) => `${r.qtyOnHand} ${r.baseUom}`,
      csv: (r) => r.qtyOnHand,
      total: t?.qtyOnHand.toLocaleString(),
      csvTotal: t?.qtyOnHand,
    },
    {
      key: 'last',
      header: 'Last sold',
      align: 'right',
      cell: (r) =>
        r.lastSoldAt ? (
          `${new Date(r.lastSoldAt).toLocaleDateString()} (${r.daysSinceSale}d)`
        ) : (
          <span className="text-destructive">Never</span>
        ),
      csv: (r) => (r.lastSoldAt ? r.lastSoldAt.slice(0, 10) : 'never'),
    },
    ...(data?.costHidden
      ? []
      : [
          {
            key: 'value',
            header: 'Value tied up',
            align: 'right' as const,
            cell: (r: DeadStockRow) => money(r.valueMinor ?? 0),
            csv: (r: DeadStockRow) => (r.valueMinor ?? 0) / 100,
            total: t && money(t.valueMinor ?? 0),
            csvTotal: t && (t.valueMinor ?? 0) / 100,
          },
        ]),
  ];
  return (
    <ReportShell
      title="Dead stock"
      icon={Archive}
      description="Stock that has not sold in a while — the money sitting on the shelf, largest first."
      subtitle={`Not sold in ${days} days · as of ${today()}`}
      filters={
        <>
          <LocationFilter value={locationId} onChange={setLocationId} excludeTransit />
          <Select
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-48"
            aria-label="Not sold in"
          >
            {[30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                Not sold in {d} days
              </option>
            ))}
          </Select>
        </>
      }
      columns={columns}
      rows={data?.rows}
      rowKey={(r) => r.key}
      isLoading={isLoading}
      isFetching={isFetching}
      csvName={`dead-stock-${days}d-${today()}`}
      emptyTitle="Nothing is sitting unsold"
      note={data?.costHidden ? 'Values need the stock:viewCost permission.' : null}
    />
  );
}
