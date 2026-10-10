import { ClipboardList, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LocationFilter } from '@/features/inventory/LocationFilter';
import { ProgressBar } from '@/features/sales/ProgressBar';
import { usePermission } from '@/hooks/data/useAuth';
import { usePos } from '@/hooks/data/usePurchasing';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { humanise } from '@/lib/utils';

import { money, PO_TONE } from './purchaseFormat';

import { PO_STATUSES } from '@shared/enums';

import type { Column } from '@/components/common/DataTable';
import type { PoStatus } from '@shared/enums';
import type { PurchaseOrderPayload } from '@shared/types';

/**
 * Purchase orders (Day 34). A draft has no number until it is approved; the bar shows how much of
 * what was ordered has arrived. "Open" is everything that can still be received against.
 */
export function PurchaseOrders() {
  const navigate = useNavigate();
  const canCreate = usePermission('po:create');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | 'OPEN' | PoStatus>('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search);

  const { data, isLoading, isFetching } = usePos({
    page,
    limit: 25,
    q: q || undefined,
    ...(status === 'OPEN' ? { open: true } : status ? { status } : {}),
    locationId: locationId || undefined,
  });

  const columns: Column<PurchaseOrderPayload>[] = [
    {
      key: 'docNo',
      header: 'PO',
      cell: (p) => (
        <div>
          <p className="font-mono text-sm">
            {p.docNo ?? <span className="text-muted-foreground">Draft</span>}
          </p>
          <p className="text-xs text-muted-foreground">{p.orderDate.slice(0, 10)}</p>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.supplierName}</p>
          <p className="truncate text-xs text-muted-foreground">to {p.locationName}</p>
        </div>
      ),
    },
    {
      key: 'expected',
      header: 'Expected',
      cell: (p) => <span className="text-sm">{p.expectedDate?.slice(0, 10) ?? '—'}</span>,
    },
    {
      key: 'received',
      header: 'Received',
      cell: (p) => (
        <ProgressBar label={`${p.lines.length} line(s)`} value={p.receivedRatio} compact />
      ),
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (p) => money(p.grandTotalMinor),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => <StatusPill status={p.status} tone={PO_TONE[p.status]} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase orders"
        icon={ClipboardList}
        description="What we have asked suppliers for, and how much of it has arrived."
        actions={
          canCreate && (
            <Button onClick={() => navigate('/purchase/orders/new')}>
              <Plus aria-hidden="true" />
              New PO
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        <div className="relative">
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
            placeholder="PO number, supplier ref…"
            className="w-60 pl-9"
            aria-label="Search purchase orders"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          className="w-48"
          aria-label="Status"
        >
          <option value="">Any status</option>
          <option value="OPEN">Open (to receive)</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </Select>
        <LocationFilter
          value={locationId}
          onChange={(id) => {
            setLocationId(id);
            setPage(1);
          }}
          excludeTransit
        />
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onRowClick={(p) => navigate(`/purchase/orders/${p.id}`)}
        empty={<EmptyState icon={ClipboardList} title="No purchase orders yet" />}
      />
    </div>
  );
}
