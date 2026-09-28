import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, TriangleAlert, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { getProduct } from '@/api/endpoints/products';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { ProductPicker } from '@/components/common/ProductPicker';
import { StatusPill } from '@/components/common/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { env } from '@/config/env';
import { cn } from '@/lib/utils';
import { usePermission } from '@/hooks/data/useAuth';
import { useBalances, useLedger } from '@/hooks/data/useStock';

import { MOVEMENT_LABEL, MOVEMENT_TONE, signed } from './inventoryFormat';
import { LocationFilter } from './LocationFilter';

import { STOCK_MOVEMENT_TYPES } from '@shared/enums';
import { formatMoney } from '@shared/money';

import type { Column } from '@/components/common/DataTable';
import type { StockMovementType } from '@shared/enums';
import type { StockLedgerPayload } from '@shared/types';

/**
 * Every stock movement, newest first — the audit trail behind every number in inventory.
 *
 * All filters live in the URL, so any screen can link here pre-filtered: a Stock-on-hand row, a
 * document ("what did ADJ-2627-00012 move?"), a serial ("where has this machine been?").
 *
 * Filtered to one product at one location with no date or type filter, the newest row's
 * `balanceAfterBase` is where the whole history ends — and it must equal the on-hand figure the
 * Stock-on-hand screen shows. The strip above the table checks exactly that, so "the ledger
 * explains this number" is visible, not assumed.
 */

const PARAMS = [
  'productId',
  'variantId',
  'locationId',
  'movementType',
  'from',
  'to',
  'refDocNo',
  'serialNo',
] as const;

export function StockLedger() {
  const [params, setParams] = useSearchParams();
  const canViewCost = usePermission('stock:viewCost');

  const get = (k: (typeof PARAMS)[number]) => params.get(k) ?? '';
  const set = (patch: Partial<Record<(typeof PARAMS)[number] | 'page', string>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const productId = get('productId');
  const variantId = get('variantId');
  const locationId = get('locationId');
  const page = Number(params.get('page') ?? 1);

  const { data: product } = useQuery({
    queryKey: ['products', 'detail', productId],
    queryFn: () => getProduct(productId),
    enabled: Boolean(productId),
  });

  const filter = {
    productId: productId || undefined,
    variantId: variantId || undefined,
    locationId: locationId || undefined,
    movementType: (get('movementType') || undefined) as StockMovementType | undefined,
    from: get('from') || undefined,
    to: get('to') || undefined,
    refDocNo: get('refDocNo') || undefined,
    serialNo: get('serialNo') || undefined,
  };
  const { data, isLoading, isFetching } = useLedger({ ...filter, page, limit: 50 });

  // One shelf, whole history: the newest row's running balance must be today's on-hand.
  // A variant product needs its variant named too, or the rows mix several shelves.
  const wholeHistoryOfOneShelf =
    Boolean(productId && locationId && product && (!product.hasVariants || variantId)) &&
    !filter.movementType &&
    !filter.from &&
    !filter.to &&
    !filter.refDocNo &&
    !filter.serialNo;
  const { data: balance } = useBalances({
    productId: productId || undefined,
    variantId: variantId || undefined,
    locationId: locationId || undefined,
    limit: 1,
  });
  const newest = data?.items[0];
  const onHand = balance?.items[0]?.qtyOnHand ?? 0;

  const money = (minor: number) => formatMoney(minor, { symbol: env.currencySymbol });
  const filtered = PARAMS.some((k) => get(k));

  const columns: Column<StockLedgerPayload>[] = [
    {
      key: 'postedAt',
      header: 'When',
      cell: (r) => (
        <div className="whitespace-nowrap text-sm">
          <p>{new Date(r.postedAt).toLocaleDateString()}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(r.postedAt).toLocaleTimeString()}
          </p>
        </div>
      ),
    },
    ...(!productId
      ? [
          {
            key: 'product',
            header: 'Product',
            cell: (r: StockLedgerPayload) => (
              <button
                type="button"
                className="min-w-0 text-left hover:underline"
                onClick={() => set({ productId: r.productId, variantId: r.variantId ?? '' })}
              >
                <p className="truncate font-medium">{r.productName}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {r.sku}
                  {r.variantLabel && ` · ${r.variantLabel}`}
                </p>
              </button>
            ),
          },
        ]
      : []),
    {
      key: 'location',
      header: 'Location',
      cell: (r) => <span className="text-sm">{r.locationCode}</span>,
    },
    {
      key: 'movementType',
      header: 'Movement',
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          <StatusPill
            status={r.movementType}
            tone={MOVEMENT_TONE[r.movementType]}
            label={MOVEMENT_LABEL[r.movementType]}
          />
          {r.reversalOfId && (
            <Badge variant="outline" className="py-0">
              reversal
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'doc',
      header: 'Document',
      cell: (r) =>
        r.refDocNo ? (
          <button
            type="button"
            className="font-mono text-xs hover:underline"
            onClick={() => set({ refDocNo: r.refDocNo! })}
          >
            {r.refDocNo}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{r.refType}</span>
        ),
    },
    {
      key: 'qtyBase',
      header: 'Qty',
      className: 'text-right tabular-nums font-medium',
      headClassName: 'text-right',
      cell: (r) => (
        <span className={r.qtyBase > 0 ? 'text-success' : 'text-destructive'}>
          {signed(r.qtyBase)}
        </span>
      ),
    },
    {
      key: 'balanceAfterBase',
      header: 'Balance',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (r) => r.balanceAfterBase.toLocaleString(),
    },
    {
      key: 'track',
      header: 'Lot / serial',
      cell: (r) =>
        r.serialNo ? (
          <button
            type="button"
            className="font-mono text-xs hover:underline"
            onClick={() => set({ serialNo: r.serialNo! })}
          >
            {r.serialNo}
          </button>
        ) : r.lotId ? (
          <span className="text-xs text-muted-foreground">lot</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    ...(canViewCost
      ? [
          {
            key: 'valueMinor',
            header: 'Value',
            className: 'text-right tabular-nums text-muted-foreground',
            headClassName: 'text-right',
            cell: (r: StockLedgerPayload) => (r.valueMinor != null ? money(r.valueMinor) : '—'),
          },
        ]
      : []),
    {
      key: 'narration',
      header: 'Note',
      cell: (r) => (
        <span className="line-clamp-2 text-xs text-muted-foreground">{r.narration ?? ''}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock ledger"
        icon={BookOpen}
        description="Every movement, never edited — corrections are reversing rows. Newest first."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-72">
          {productId ? (
            <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{product?.name ?? '…'}</span>{' '}
                <span className="font-mono text-xs text-muted-foreground">{product?.sku}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Clear product filter"
                onClick={() => set({ productId: '', variantId: '' })}
              >
                <X />
              </Button>
            </div>
          ) : (
            <ProductPicker
              value={null}
              onChange={(p) => set({ productId: p?.id ?? '' })}
              placeholder="Filter by product…"
            />
          )}
        </div>
        <LocationFilter value={locationId} onChange={(id) => set({ locationId: id })} />
        <Select
          value={get('movementType')}
          onChange={(e) => set({ movementType: e.target.value })}
          className="w-44"
          aria-label="Movement type"
        >
          <option value="">All movements</option>
          {STOCK_MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_LABEL[t]}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={get('from')}
          onChange={(e) => set({ from: e.target.value })}
          className="w-40"
          aria-label="From date"
        />
        <Input
          type="date"
          value={get('to')}
          onChange={(e) => set({ to: e.target.value })}
          className="w-40"
          aria-label="To date"
        />
        {(get('refDocNo') || get('serialNo')) && (
          <Badge variant="secondary" className="gap-1">
            {get('refDocNo') || `Serial ${get('serialNo')}`}
            <button
              type="button"
              aria-label="Clear"
              onClick={() => set({ refDocNo: '', serialNo: '' })}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </Button>
        )}
      </div>

      {wholeHistoryOfOneShelf && newest && page === 1 && (
        <div
          role="status"
          className={cn(
            'flex items-start gap-3 rounded-lg border p-3 text-sm',
            newest.balanceAfterBase === onHand
              ? 'border-success/30 bg-success/5'
              : 'border-destructive/30 bg-destructive/5',
          )}
        >
          {newest.balanceAfterBase === onHand ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
          )}
          <p>
            These {data?.meta.total} movement(s) end at{' '}
            <strong>{newest.balanceAfterBase.toLocaleString()}</strong>; stock on hand here is{' '}
            <strong>{onHand.toLocaleString()}</strong>
            {newest.balanceAfterBase === onHand
              ? ' — the ledger explains the number exactly.'
              : ' — they disagree. Run Reconcile from Stock on hand.'}
          </p>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={(p) => set({ page: String(p) })}
        empty={
          <EmptyState
            icon={BookOpen}
            title={filtered ? 'No movement matches' : 'No movements yet'}
          />
        }
      />
    </div>
  );
}
