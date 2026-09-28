import { BookOpen, Cpu, Search } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { humanise } from '@/lib/utils';
import { useSerialHistory, useSerials } from '@/hooks/data/useStock';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { MOVEMENT_LABEL, signed } from './inventoryFormat';
import { LocationFilter } from './LocationFilter';

import { SERIAL_STATUSES } from '@shared/enums';

import type { StatusTone } from '@/components/common/StatusPill';
import type { Column } from '@/components/common/DataTable';
import type { SerialStatus, WarrantyState } from '@shared/enums';
import type { SerialUnitPayload, WarrantyPayload } from '@shared/types';

/**
 * The serial and warranty register — every serialised unit, where it is, and whether its warranty
 * still covers it. Read-only: a unit's status is set by the movements that move it. Click a unit
 * for its whole life, from receipt to sale.
 */

const SERIAL_TONE: Record<SerialStatus, StatusTone> = {
  IN_STOCK: 'success',
  IN_TRANSIT: 'warning',
  RESERVED: 'info',
  SOLD: 'neutral',
  RETURNED: 'neutral',
  SCRAPPED: 'danger',
  IN_SERVICE: 'info',
};

const WARRANTY_TONE: Record<WarrantyState, StatusTone> = {
  NONE: 'neutral',
  NOT_STARTED: 'info',
  ACTIVE: 'success',
  EXPIRED: 'danger',
};

function WarrantyCell({ w }: { w: WarrantyPayload }) {
  if (w.state === 'NONE')
    return <span className="text-xs text-muted-foreground">No warranty</span>;
  return (
    <div className="space-y-0.5">
      <StatusPill
        status={w.state}
        tone={
          w.state === 'ACTIVE' && (w.daysLeft ?? 0) <= 30 ? 'warning' : WARRANTY_TONE[w.state]
        }
        label={w.state === 'NOT_STARTED' ? `${w.months} mo, starts at sale` : humanise(w.state)}
      />
      {w.endsOn && (
        <p className="text-xs text-muted-foreground">
          to {w.endsOn}
          {w.state === 'ACTIVE' && ` · ${w.daysLeft} day(s) left`}
        </p>
      )}
    </div>
  );
}

export function Serials() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | SerialStatus>('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const [openSerial, setOpenSerial] = useState<string | null>(null);
  const q = useDebouncedValue(search);

  const { data, isLoading, isFetching } = useSerials({
    page,
    limit: 50,
    q: q || undefined,
    status: status || undefined,
    locationId: locationId || undefined,
  });

  const columns: Column<SerialUnitPayload>[] = [
    {
      key: 'serialNo',
      header: 'Serial',
      cell: (u) => <span className="font-mono text-sm">{u.serialNo}</span>,
    },
    {
      key: 'product',
      header: 'Product',
      cell: (u) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{u.productName}</p>
          <p className="font-mono text-xs text-muted-foreground">{u.sku}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (u) => (
        <div className="space-y-0.5">
          <StatusPill status={u.status} tone={SERIAL_TONE[u.status]} />
          <p className="text-xs text-muted-foreground">
            {u.locationCode ?? u.soldPartyName ?? ''}
          </p>
        </div>
      ),
    },
    { key: 'warranty', header: 'Warranty', cell: (u) => <WarrantyCell w={u.warranty} /> },
    {
      key: 'lastMovementAt',
      header: 'Last moved',
      cell: (u) => (
        <span className="text-sm">{new Date(u.lastMovementAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Serials & warranty"
        icon={Cpu}
        description="Every serialised unit, where it is, and its warranty. The warranty clock starts at the sale."
      />
      <div className="flex flex-wrap gap-2">
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
            placeholder="Serial number…"
            className="pl-9 font-mono"
            aria-label="Search serials"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | SerialStatus);
            setPage(1);
          }}
          className="w-40"
          aria-label="Status"
        >
          <option value="">Any status</option>
          {SERIAL_STATUSES.map((s) => (
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
        />
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(u) => u.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onRowClick={(u) => setOpenSerial(u.serialNo)}
        empty={
          <EmptyState
            icon={Cpu}
            title="No serialised units"
            description="Units appear here when a serial-tracked product is received."
          />
        }
      />
      <SerialHistoryDialog serialNo={openSerial} onClose={() => setOpenSerial(null)} />
    </div>
  );
}

function SerialHistoryDialog({
  serialNo,
  onClose,
}: {
  serialNo: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data, isLoading } = useSerialHistory(serialNo);
  const u = data?.unit;

  return (
    <Dialog
      open={serialNo !== null}
      onClose={onClose}
      title={`Serial ${serialNo ?? ''}`}
      description={u ? `${u.productName} · ${u.sku}` : undefined}
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() =>
              navigate(`/inventory/ledger?serialNo=${encodeURIComponent(serialNo ?? '')}`)
            }
          >
            <BookOpen aria-hidden="true" />
            In the ledger
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {isLoading || !data || !u ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Status</p>
              <StatusPill status={u.status} tone={SERIAL_TONE[u.status]} />
              <p className="text-sm">
                {u.locationCode
                  ? `at ${u.locationCode}`
                  : u.soldPartyName
                    ? `sold to ${u.soldPartyName}`
                    : ''}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Warranty</p>
              <WarrantyCell w={u.warranty} />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">Received</p>
              <p className="text-sm">{new Date(u.receivedAt).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead>Where</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      {new Date(r.postedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">{MOVEMENT_LABEL[r.movementType]}</TableCell>
                    <TableCell className="text-sm">{r.locationCode}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.refDocNo ?? r.refType}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {signed(r.qtyBase)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Dialog>
  );
}
