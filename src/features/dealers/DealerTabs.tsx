import { FileText, RotateCcw, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill } from '@/components/common/StatusPill';
import { Card, CardContent } from '@/components/ui/card';
import { InvoicesTable } from '@/features/billing/InvoicesTable';
import { usePermission } from '@/hooks/data/useAuth';
import { useOrders } from '@/hooks/data/useOrders';
import { useSalesReturns } from '@/hooks/data/useReturns';
import { humanise } from '@/lib/utils';

import { money } from './creditMath';

import type { Column } from '@/components/common/DataTable';
import type { Permission } from '@shared/permissions';
import type { SalesReturnPayload, WholesaleOrderPayload } from '@shared/types';

/** The dealer profile's document tabs (Day 36b): their invoices, orders and returns. */

function Gate({
  permission,
  what,
  children,
}: {
  permission: Permission;
  what: string;
  children: React.ReactNode;
}) {
  const allowed = usePermission(permission);
  if (!allowed) {
    return (
      <Card>
        <EmptyState
          icon={FileText}
          title={`The dealer's ${what} are not yours to see`}
          description={`It needs ${permission}.`}
        />
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  );
}

export function DealerInvoicesTab({ partyId }: { partyId: string }) {
  return (
    <Gate permission="invoice:read" what="invoices">
      <InvoicesTable partyId={partyId} />
    </Gate>
  );
}

export function DealerOrdersTab({ partyId }: { partyId: string }) {
  return (
    <Gate permission="order:read" what="orders">
      <DealerOrders partyId={partyId} />
    </Gate>
  );
}

function DealerOrders({ partyId }: { partyId: string }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useOrders({
    page,
    limit: 25,
    dealerPartyId: partyId,
    sort: 'orderDate',
    order: 'desc',
  });
  const columns: Column<WholesaleOrderPayload>[] = [
    {
      key: 'docNo',
      header: 'Order',
      cell: (o) => <span className="font-mono text-sm">{o.docNo ?? 'Draft'}</span>,
    },
    { key: 'date', header: 'Ordered', cell: (o) => new Date(o.orderDate).toLocaleDateString() },
    { key: 'status', header: 'Status', cell: (o) => <StatusPill status={o.status} /> },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (o) => money(o.grandTotalMinor),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={data?.items ?? []}
      rowKey={(o) => o.id}
      isLoading={isLoading}
      isFetching={isFetching}
      meta={data?.meta}
      onPageChange={setPage}
      onRowClick={(o) => navigate(`/sales/orders/${o.id}`)}
      empty={<EmptyState icon={ShoppingCart} title="No orders yet" />}
    />
  );
}

export function DealerReturnsTab({ partyId }: { partyId: string }) {
  return (
    <Gate permission="return:read" what="returns">
      <DealerReturns partyId={partyId} />
    </Gate>
  );
}

function DealerReturns({ partyId }: { partyId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useSalesReturns({ page, limit: 25, partyId });
  const columns: Column<SalesReturnPayload>[] = [
    {
      key: 'docNo',
      header: 'Return',
      cell: (r) => (
        <div>
          <p className="font-mono text-sm">{r.docNo}</p>
          <p className="text-xs text-muted-foreground">against {r.invoiceDocNo}</p>
        </div>
      ),
    },
    { key: 'date', header: 'Date', cell: (r) => new Date(r.postedAt).toLocaleDateString() },
    { key: 'reason', header: 'Reason', cell: (r) => humanise(r.reason) },
    {
      key: 'settled',
      header: 'Settled as',
      cell: (r) => (
        <span className="text-sm">
          {humanise(r.settlement)}{' '}
          <span className="font-mono text-xs text-muted-foreground">
            {r.creditNoteDocNo ?? r.refundDocNo ?? ''}
          </span>
        </span>
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
    <DataTable
      columns={columns}
      rows={data?.items ?? []}
      rowKey={(r) => r.id}
      isLoading={isLoading}
      isFetching={isFetching}
      meta={data?.meta}
      onPageChange={setPage}
      empty={<EmptyState icon={RotateCcw} title="No returns yet" />}
    />
  );
}
