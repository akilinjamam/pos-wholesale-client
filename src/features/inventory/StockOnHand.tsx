import { Boxes, Scale, Search, Snowflake } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAppSelector } from '@/app/store';
import { env } from '@/config/env';
import { usePermission } from '@/hooks/data/useAuth';
import { useBalances } from '@/hooks/data/useStock';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { LocationFilter } from './LocationFilter';
import { ReconcileDialog } from './ReconcileDialog';

import { formatMoney } from '@shared/money';

import type { Column, SortState } from '@/components/common/DataTable';
import type { StockBalancePayload } from '@shared/types';

/**
 * What is on hand, where — and why.
 *
 * Every number here is a cached sum of ledger rows, so every row is a link: click it and the
 * Stock ledger opens filtered to exactly that product, variant and location, ending on the same
 * figure. "Why does it say 7?" is answered by reading down that list.
 *
 * Available = on hand − reserved: stock promised to confirmed orders (Day 22) is still on the
 * shelf but no longer free to promise again. Cost and value appear only with `stock:viewCost` —
 * and the server strips them without it, so hiding the column is not the protection.
 */
export function StockOnHand() {
  const navigate = useNavigate();
  const canViewCost = usePermission('stock:viewCost');
  const canReconcile = usePermission('stock:reconcile');
  const activeLocationId = useAppSelector((s) => s.ui.activeLocationId);

  const [locationId, setLocationId] = useState(activeLocationId ?? '');
  const [search, setSearch] = useState('');
  const [showZero, setShowZero] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<SortState | null>(null);
  const [reconcileSession, setReconcileSession] = useState(0);

  const q = useDebouncedValue(search);
  const { data, isLoading, isFetching } = useBalances({
    page,
    limit,
    q: q || undefined,
    locationId: locationId || undefined,
    nonZero: showZero ? undefined : true,
    ...(sort ? { sort: sort.field, order: sort.order } : {}),
  });

  const money = (minor: number) => formatMoney(minor, { symbol: env.currencySymbol });
  const qty = (n: number) => n.toLocaleString();

  const drill = (b: StockBalancePayload) =>
    navigate(
      `/inventory/ledger?${new URLSearchParams({
        productId: b.productId,
        locationId: b.locationId,
        ...(b.variantId ? { variantId: b.variantId } : {}),
      })}`,
    );

  const columns: Column<StockBalancePayload>[] = [
    {
      key: 'product',
      header: 'Product',
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.productName}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{b.sku}</span>
            {b.variantLabel && <span> · {b.variantLabel}</span>}
          </p>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      cell: (b) => (
        <span className="flex items-center gap-1.5 text-sm">
          {b.locationCode}
          {b.frozenByCountId && (
            <Badge
              variant="outline"
              className="gap-1 py-0"
              title="A stock count has frozen this item here"
            >
              <Snowflake className="h-3 w-3" aria-hidden="true" />
              counting
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'qtyOnHand',
      header: 'On hand',
      sortable: true,
      className: 'text-right tabular-nums font-medium',
      headClassName: 'text-right',
      cell: (b) => (
        <span>
          {qty(b.qtyOnHand)}{' '}
          <span className="text-xs font-normal text-muted-foreground">{b.baseUom}</span>
        </span>
      ),
    },
    {
      key: 'qtyReserved',
      header: 'Reserved',
      sortable: true,
      className: 'text-right tabular-nums text-muted-foreground',
      headClassName: 'text-right',
      cell: (b) => (b.qtyReserved ? qty(b.qtyReserved) : '—'),
    },
    {
      key: 'qtyAvailable',
      header: 'Available',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (b) => (
        <span className={b.qtyAvailable < 0 ? 'font-medium text-destructive' : undefined}>
          {qty(b.qtyAvailable)}
        </span>
      ),
    },
    ...(canViewCost
      ? [
          {
            key: 'avgCostMinor',
            header: 'Avg cost',
            className: 'text-right tabular-nums text-muted-foreground',
            headClassName: 'text-right',
            cell: (b: StockBalancePayload) => (b.avgCostMinor ? money(b.avgCostMinor) : '—'),
          },
          {
            key: 'value',
            header: 'Value',
            className: 'text-right tabular-nums',
            headClassName: 'text-right',
            cell: (b: StockBalancePayload) =>
              b.avgCostMinor ? money(b.avgCostMinor * b.qtyOnHand) : '—',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock on hand"
        icon={Boxes}
        description="Click any row to see the ledger movements behind its number."
        actions={
          canReconcile && (
            <Button variant="outline" onClick={() => setReconcileSession((n) => n + 1)}>
              <Scale aria-hidden="true" />
              Reconcile
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search product name or SKU…"
            className="pl-9"
            aria-label="Search stock"
          />
        </div>
        <LocationFilter
          value={locationId}
          onChange={(id) => {
            setLocationId(id);
            setPage(1);
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showZero} onCheckedChange={setShowZero} />
          Show zero stock
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(b) => b.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onLimitChange={(n) => {
          setLimit(n);
          setPage(1);
        }}
        sort={sort}
        onSortChange={setSort}
        onRowClick={drill}
        empty={
          <EmptyState
            icon={Boxes}
            title={q || locationId ? 'Nothing matches' : 'No stock yet'}
            description={
              q || locationId
                ? 'Try another location or search.'
                : 'Stock arrives through opening stock, goods receipts, transfers and adjustments.'
            }
          />
        }
      />

      {reconcileSession > 0 && (
        <ReconcileDialog
          key={reconcileSession}
          open
          onClose={() => setReconcileSession(0)}
          locationId={locationId || undefined}
        />
      )}
    </div>
  );
}
