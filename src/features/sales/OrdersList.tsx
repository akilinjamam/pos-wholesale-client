import { Plus, Search, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { money } from '@/features/dealers/creditMath';
import { LocationFilter } from '@/features/inventory/LocationFilter';
import { usePermission } from '@/hooks/data/useAuth';
import { useOrders } from '@/hooks/data/useOrders';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { humanise } from '@/lib/utils';

import { ORDER_STATUSES } from '@shared/enums';

import type { Column, SortState } from '@/components/common/DataTable';
import type { OrderStatus } from '@shared/enums';
import type { WholesaleOrderPayload } from '@shared/types';

/**
 * Wholesale orders, newest first — the way into the builder and back to any order. The status
 * board with per-state counts and progress bars is Day 26; this is the plain list it will sit on.
 */
export function OrdersList() {
  const navigate = useNavigate();
  const canCreate = usePermission('order:create');
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [locationId, setLocationId] = useState('');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ field: 'orderDate', order: 'desc' });
  const q = useDebouncedValue(text.trim(), 250);

  const { data, isLoading, isFetching } = useOrders({
    page,
    limit: 25,
    q: q || undefined,
    status: status || undefined,
    locationId: locationId || undefined,
    sort: sort.field,
    order: sort.order,
  });

  const columns: Column<WholesaleOrderPayload>[] = [
    {
      key: 'docNo',
      header: 'Order',
      sortable: true,
      cell: (o) => (
        <span className="font-mono text-sm">
          {o.docNo ?? <span className="text-muted-foreground">Draft</span>}
        </span>
      ),
    },
    {
      key: 'dealer',
      header: 'Dealer',
      cell: (o) => <span className="font-medium">{o.dealerName ?? '—'}</span>,
    },
    {
      key: 'orderDate',
      header: 'Ordered',
      sortable: true,
      cell: (o) => new Date(o.orderDate).toLocaleDateString(),
    },
    {
      key: 'requiredDate',
      header: 'Required by',
      sortable: true,
      cell: (o) => (o.requiredDate ? new Date(o.requiredDate).toLocaleDateString() : '—'),
    },
    { key: 'lines', header: 'Lines', className: 'tabular-nums', cell: (o) => o.lines.length },
    {
      key: 'status',
      header: 'Status',
      cell: (o) => <StatusPill status={o.status} />,
    },
    {
      key: 'grandTotalMinor',
      header: 'Total',
      sortable: true,
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (o) => money(o.grandTotalMinor),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Orders"
        icon={ShoppingCart}
        description="Dealer orders, from draft to delivery."
        actions={
          canCreate && (
            <Button onClick={() => navigate('/sales/orders/new')}>
              <Plus aria-hidden="true" />
              New order
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        <div className="relative w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPage(1);
            }}
            placeholder="Order number or note…"
            className="pl-9"
            aria-label="Search orders"
          />
        </div>
        <LocationFilter
          value={locationId}
          onChange={(id) => {
            setLocationId(id);
            setPage(1);
          }}
          allLabel="Any of my locations"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | OrderStatus);
            setPage(1);
          }}
          className="w-48"
          aria-label="Status"
        >
          <option value="">Any status</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(o) => o.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        onRowClick={(o) => navigate(`/sales/orders/${o.id}`)}
        empty={
          <EmptyState
            icon={ShoppingCart}
            title={status || q ? 'No orders match' : 'No orders yet'}
            action={
              canCreate && !status && !q ? (
                <Button onClick={() => navigate('/sales/orders/new')}>
                  <Plus aria-hidden="true" />
                  Take the first order
                </Button>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
