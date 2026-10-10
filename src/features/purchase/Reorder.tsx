import { ClipboardList, PackageSearch, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { usePermission } from '@/hooks/data/useAuth';
import { useReorderSuggestions } from '@/hooks/data/usePurchasing';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

import { money } from './purchaseFormat';

import type { PoSeed } from './poDraft';
import type { ReorderSuggestionPayload } from '@shared/types';

/**
 * Reorder suggestions (Day 34): products below their reorder point, counting what is already on
 * order — so an item ordered last week is not suggested again. Tick what to buy, adjust the
 * quantities, and start a PO with them; the builder asks for powers or colours where the product
 * has variants.
 */
export function Reorder() {
  const navigate = useNavigate();
  const canOrder = usePermission('po:create');
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search);
  const { data, isLoading, isFetching } = useReorderSuggestions({
    locationId: locationId || undefined,
    q: q || undefined,
  });
  const rows = data ?? [];
  const [picked, setPicked] = useState<Record<string, string>>({});

  const isPicked = (r: ReorderSuggestionPayload) => r.productId in picked;
  const toggle = (r: ReorderSuggestionPayload) =>
    setPicked((p) => {
      const next = { ...p };
      if (r.productId in next) delete next[r.productId];
      else next[r.productId] = String(r.suggestedBase);
      return next;
    });
  const chosen = rows.filter(isPicked);
  const suppliers = [...new Set(chosen.map((r) => r.lastSupplierPartyId))];

  const startPo = () => {
    const seed: PoSeed = {
      // One supplier across the ticked rows: start with them. Mixed: the buyer chooses.
      supplierPartyId: suppliers.length === 1 ? suppliers[0]! : null,
      locationId: locationId || null,
      lines: chosen
        .map((r) => ({ productId: r.productId, qtyBase: Number(picked[r.productId]) }))
        .filter((l) => l.qtyBase > 0),
    };
    navigate('/purchase/orders/new', { state: { seed } });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reorder suggestions"
        icon={PackageSearch}
        description="Below the reorder point after counting reserved stock and what is already on order."
        actions={
          canOrder && (
            <Button disabled={chosen.length === 0} onClick={startPo}>
              <ClipboardList aria-hidden="true" />
              Start a PO{chosen.length ? ` (${chosen.length})` : ''}
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU or name…"
            className="w-60 pl-9"
            aria-label="Search products"
          />
        </div>
        <LocationFilter
          value={locationId}
          onChange={setLocationId}
          allLabel="All my locations"
          excludeTransit
        />
        {chosen.length > 0 && suppliers.length > 1 && (
          <p className="text-sm text-warning">
            Ticked items were last bought from {suppliers.length} suppliers — the PO will ask
            which.
          </p>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Nothing to reorder"
          description="Every product with a reorder point is above it, counting what is on order."
        />
      ) : (
        <div className={cn('rounded-md border', isFetching && 'opacity-70')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Pick</span>
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">On order</TableHead>
                <TableHead className="text-right">Position / point</TableHead>
                <TableHead className="text-right">Order</TableHead>
                <TableHead>Last supplier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.productId} className={cn(isPicked(r) && 'bg-muted/40')}>
                  <TableCell>
                    <Checkbox
                      checked={isPicked(r)}
                      onChange={() => toggle(r)}
                      aria-label={`Pick ${r.sku}`}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{r.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {r.sku}
                      {r.hasVariants && ' · variants chosen in the PO'}
                      {r.avgCostMinor !== null && ` · ${money(r.avgCostMinor)}/${r.baseUom}`}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.onHandBase}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.reservedBase || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.onOrderBase || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span
                      className={cn(r.positionBase <= 0 && 'font-semibold text-destructive')}
                    >
                      {r.positionBase}
                    </span>
                    <span className="text-muted-foreground"> / {r.reorderPoint}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      value={picked[r.productId] ?? String(r.suggestedBase)}
                      onChange={(e) =>
                        setPicked((p) => ({ ...p, [r.productId]: e.target.value }))
                      }
                      className="ml-auto w-24 text-right tabular-nums"
                      aria-label={`Quantity to order, ${r.sku}, in ${r.baseUom}`}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.lastSupplierName ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
