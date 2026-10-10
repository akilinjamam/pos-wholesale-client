import { PackageCheck, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LocationFilter } from '@/features/inventory/LocationFilter';
import { usePermission } from '@/hooks/data/useAuth';
import { useGrns, usePos } from '@/hooks/data/usePurchasing';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn, humanise } from '@/lib/utils';

import { GRN_TONE, money } from './purchaseFormat';

import { GRN_STATUSES } from '@shared/enums';

import type { Column } from '@/components/common/DataTable';
import type { GrnStatus } from '@shared/enums';
import type { GoodsReceiptPayload } from '@shared/types';

/**
 * Goods receipts (Day 34) — what has arrived from suppliers, against a PO or directly. A draft is
 * what is at the door being counted; posted, it is in stock and on the supplier's ledger.
 */
export function GoodsReceipts() {
  const navigate = useNavigate();
  const canReceive = usePermission('grn:create');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | GrnStatus>('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const [choosing, setChoosing] = useState(false);
  const q = useDebouncedValue(search);

  const { data, isLoading, isFetching } = useGrns({
    page,
    limit: 25,
    q: q || undefined,
    status: status || undefined,
    locationId: locationId || undefined,
  });

  const columns: Column<GoodsReceiptPayload>[] = [
    {
      key: 'docNo',
      header: 'Receipt',
      cell: (g) => (
        <div>
          <p className="font-mono text-sm">
            {g.docNo ?? <span className="text-muted-foreground">Draft</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(g.receivedAt).toLocaleDateString()}
          </p>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      cell: (g) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{g.supplierName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {g.poDocNo ? `against ${g.poDocNo}` : 'direct'} · into {g.locationName}
          </p>
        </div>
      ),
    },
    {
      key: 'bill',
      header: 'Bill',
      cell: (g) => <span className="font-mono text-sm">{g.supplierInvoiceNo ?? '—'}</span>,
    },
    {
      key: 'lines',
      header: 'Lines',
      className: 'tabular-nums',
      cell: (g) => (
        <span>
          {g.lines.length}
          {g.lines.some((l) => l.qcStatus === 'DAMAGED') && (
            <span className="ml-1 text-xs text-destructive">(damaged)</span>
          )}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Bill total',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (g) => money(g.grandTotalMinor),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (g) => <StatusPill status={g.status} tone={GRN_TONE[g.status]} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Goods receipts"
        icon={PackageCheck}
        description="Receive stock against a purchase order or directly — with lots, expiry and serials."
        actions={
          canReceive && (
            <Button onClick={() => setChoosing(true)}>
              <Plus aria-hidden="true" />
              Receive goods
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
            placeholder="Receipt or bill number…"
            className="w-60 pl-9"
            aria-label="Search receipts"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | GrnStatus);
            setPage(1);
          }}
          className="w-40"
          aria-label="Status"
        >
          <option value="">Any status</option>
          {GRN_STATUSES.map((s) => (
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
        rowKey={(g) => g.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onRowClick={(g) => navigate(`/purchase/grn/${g.id}`)}
        empty={<EmptyState icon={PackageCheck} title="Nothing received yet" />}
      />
      {choosing && <ChooseSource onClose={() => setChoosing(false)} />}
    </div>
  );
}

/** Against which PO — or none. Only POs that can still be received against are offered. */
function ChooseSource({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search);
  const { data, isLoading } = usePos({ open: true, limit: 20, q: q || undefined });
  const pos = data?.items ?? [];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Receive goods"
      description="Pick the purchase order the delivery is against, or receive without one."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={() => navigate('/purchase/grn/new')}>
            Direct receipt (no PO)
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search open POs…"
          aria-label="Search open purchase orders"
          autoFocus
        />
        <ul className="max-h-80 space-y-1 overflow-auto">
          {isLoading ? (
            <li className="px-2 py-3 text-sm text-muted-foreground">Loading…</li>
          ) : pos.length === 0 ? (
            <li className="px-2 py-3 text-sm text-muted-foreground">
              No open purchase orders{q ? ' match' : ''}.
            </li>
          ) : (
            pos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/purchase/grn/new?poId=${p.id}`)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted',
                  )}
                >
                  <span className="min-w-0">
                    <span className="font-mono">{p.docNo}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.supplierName} · to {p.locationName}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {Math.round(p.receivedRatio * 100)}% received
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Dialog>
  );
}
