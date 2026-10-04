import { Search, Truck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { fmtDateTime } from '@/features/counter/print/printHelpers';
import { LocationFilter } from '@/features/inventory/LocationFilter';
import { useDispatches } from '@/hooks/data/useDispatches';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { humanise } from '@/lib/utils';

import { DISPATCH_STATUSES } from '@shared/enums';

import type { Column } from '@/components/common/DataTable';
import type { DispatchStatus } from '@shared/enums';
import type { DispatchPayload } from '@shared/types';

/**
 * Every challan, newest first — the dispatch desk's queue (pick lists and packed boxes waiting)
 * and its record (what left, how, and whether it arrived). Challans start from an order: open a
 * confirmed order and press "Start picking".
 */
export function ChallansList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'' | DispatchStatus>('');
  const [locationId, setLocationId] = useState('');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(text.trim(), 250);

  const { data, isLoading, isFetching } = useDispatches({
    page,
    limit: 25,
    q: q || undefined,
    status: status || undefined,
    locationId: locationId || undefined,
  });

  const columns: Column<DispatchPayload>[] = [
    {
      key: 'docNo',
      header: 'Challan',
      cell: (d) => (
        <div>
          <p className="font-mono text-sm">
            {d.docNo ?? (
              <span className="text-muted-foreground">
                {d.status === 'PACKED' ? 'Packed' : 'Pick list'}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">order {d.orderDocNo}</p>
        </div>
      ),
    },
    {
      key: 'dealer',
      header: 'Dealer',
      cell: (d) => <span className="font-medium">{d.dealerName}</span>,
    },
    { key: 'from', header: 'From', cell: (d) => d.locationName },
    {
      key: 'transport',
      header: 'Transport',
      cell: (d) =>
        d.transport ? (
          <div className="text-sm">
            <p>
              {humanise(d.transport.mode)}
              {d.transport.vehicleNo && ` · ${d.transport.vehicleNo}`}
              {d.transport.courierName && ` · ${d.transport.courierName}`}
            </p>
            {(d.transport.trackingNo || d.transport.driverName) && (
              <p className="text-xs text-muted-foreground">
                {[d.transport.driverName, d.transport.trackingNo].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'units',
      header: 'Units',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (d) => d.lines.reduce((s, l) => s + l.qtyBase, 0),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (d) => (
        <div>
          <StatusPill status={d.status} />
          {d.dispatchedAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fmtDateTime(d.deliveredAt ?? d.dispatchedAt)}
            </p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Challans"
        icon={Truck}
        description="Pick, pack, ship and confirm delivery. Start a pick list from a confirmed order."
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
            placeholder="Challan, order or invoice no."
            className="pl-9"
            aria-label="Search challans"
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
            setStatus(e.target.value as '' | DispatchStatus);
            setPage(1);
          }}
          className="w-40"
          aria-label="Status"
        >
          <option value="">Any status</option>
          {DISPATCH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanise(s)}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(d) => d.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onRowClick={(d) => navigate(`/dispatch/challans/${d.id}`)}
        empty={
          <EmptyState
            icon={Truck}
            title={status || q ? 'No challans match' : 'No challans yet'}
            description="Open a confirmed order and press “Start picking”."
          />
        }
      />
    </div>
  );
}
