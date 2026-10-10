import { Plus, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { money } from '@/features/dealers/creditMath';
import { usePermission } from '@/hooks/data/useAuth';
import { useSalesReturns } from '@/hooks/data/useReturns';
import { humanise } from '@/lib/utils';

import type { Column } from '@/components/common/DataTable';
import type { SalesChannel } from '@shared/enums';
import type { SalesReturnPayload } from '@shared/types';

/** Sales returns (Day 36) — both channels: wholesale returns and counter returns, newest first. */
export function SalesReturns() {
  const navigate = useNavigate();
  const canCreate = usePermission('return:create');
  const [channel, setChannel] = useState<'' | SalesChannel>('WHOLESALE');
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useSalesReturns({
    page,
    limit: 25,
    channel: channel || undefined,
  });

  const columns: Column<SalesReturnPayload>[] = [
    {
      key: 'docNo',
      header: 'Return',
      cell: (r) => (
        <div>
          <p className="font-mono text-sm">{r.docNo}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(r.postedAt).toLocaleString()}
          </p>
        </div>
      ),
    },
    {
      key: 'who',
      header: 'From',
      cell: (r) => (
        <div>
          <p className="font-medium">{r.customerName ?? 'Walk-in'}</p>
          <p className="font-mono text-xs text-muted-foreground">against {r.invoiceDocNo}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      cell: (r) => (
        <div className="space-y-0.5 text-sm">
          {r.lines.map((l, i) => (
            <p key={i}>
              {l.qtyBase} × {l.description}{' '}
              {l.condition === 'DAMAGED' && (
                <span className="text-xs text-destructive">damaged</span>
              )}
            </p>
          ))}
        </div>
      ),
    },
    { key: 'reason', header: 'Reason', cell: (r) => humanise(r.reason) },
    {
      key: 'settlement',
      header: 'Settled as',
      cell: (r) => (
        <div>
          <StatusPill
            status={r.settlement}
            tone={r.settlement === 'CREDIT_NOTE' ? 'info' : 'warning'}
          />
          <p className="font-mono text-xs text-muted-foreground">
            {r.creditNoteDocNo ?? r.refundDocNo ?? ''}
          </p>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Value',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (r) => money(r.grandTotalMinor),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Returns"
        icon={Undo2}
        description="Goods back from dealers and customers — where they went, and how each was settled."
        actions={
          canCreate && (
            <Button onClick={() => navigate('/sales/returns/new')}>
              <Plus aria-hidden="true" />
              New return
            </Button>
          )
        }
      />
      <Select
        value={channel}
        onChange={(e) => {
          setChannel(e.target.value as '' | SalesChannel);
          setPage(1);
        }}
        className="w-48"
        aria-label="Channel"
      >
        <option value="WHOLESALE">Wholesale</option>
        <option value="COUNTER">Counter</option>
        <option value="">Both</option>
      </Select>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        empty={<EmptyState icon={Undo2} title="No returns yet" />}
      />
    </div>
  );
}
