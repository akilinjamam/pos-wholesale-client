import { HandCoins, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable } from '@/components/common/DataTable';
import { DealerPicker } from '@/components/common/DealerPicker';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useCan } from '@/hooks/data/useAuth';
import { useAllocateSupplierPayment, useSupplierPayments } from '@/hooks/data/usePurchasing';
import { humanise } from '@/lib/utils';

import { money } from './purchaseFormat';

import type { Column } from '@/components/common/DataTable';
import type { PartyPayload, SupplierPaymentPayload } from '@shared/types';

/**
 * Supplier payments (Day 35) — money paid out (`PAY-`), each with the bills it settled. A payment
 * with an advance left on it can be set against bills that arrived since, oldest due first.
 */
export function SupplierPayments() {
  const navigate = useNavigate();
  const can = useCan();
  const [supplier, setSupplier] = useState<PartyPayload | null>(null);
  const [advancesOnly, setAdvancesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [allocating, setAllocating] = useState<SupplierPaymentPayload | null>(null);
  const allocate = useAllocateSupplierPayment();
  const { data, isLoading, isFetching } = useSupplierPayments({
    page,
    limit: 25,
    partyId: supplier?.id,
    unallocated: advancesOnly || undefined,
  });

  const columns: Column<SupplierPaymentPayload>[] = [
    {
      key: 'docNo',
      header: 'Payment',
      cell: (p) => (
        <div>
          <p className="font-mono text-sm">{p.docNo}</p>
          <p className="text-xs text-muted-foreground">{new Date(p.paidAt).toLocaleString()}</p>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      cell: (p) => <span className="font-medium">{p.partyName}</span>,
    },
    {
      key: 'method',
      header: 'How',
      cell: (p) => (
        <span className="text-sm">
          {humanise(p.method)}
          {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
          {p.mfs && <span className="text-muted-foreground"> · {p.mfs.trxId}</span>}
        </span>
      ),
    },
    {
      key: 'against',
      header: 'Against',
      cell: (p) => (
        <span className="text-sm">
          {p.allocations.length ? p.allocations.map((a) => a.docNo).join(', ') : '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (p) => (
        <div>
          <p className="font-medium">{money(p.amountMinor)}</p>
          {p.unallocatedMinor > 0 && (
            <p className="text-xs text-warning">{money(p.unallocatedMinor)} advance</p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (p) =>
        p.unallocatedMinor > 0 && can('payment:supplierPay') ? (
          <Button variant="outline" size="sm" onClick={() => setAllocating(p)}>
            Set against bills
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Supplier payments"
        icon={HandCoins}
        description="Money paid to suppliers, and which of their bills each payment settled."
        actions={
          can('payment:supplierPay') && (
            <Button onClick={() => navigate('/purchase/payments/new')}>
              <Plus aria-hidden="true" />
              Pay a supplier
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-80">
          <DealerPicker
            role="SUPPLIER"
            value={supplier}
            onChange={(s) => {
              setSupplier(s);
              setPage(1);
            }}
            emptyLabel="All suppliers…"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={advancesOnly}
            onChange={(e) => {
              setAdvancesOnly(e.target.checked);
              setPage(1);
            }}
          />
          With an advance left
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        empty={<EmptyState icon={HandCoins} title="No supplier payments" />}
      />
      {allocating && (
        <ConfirmDialog
          open
          title={`Set ${money(allocating.unallocatedMinor)} against bills?`}
          description={`The advance on ${allocating.docNo} goes against ${allocating.partyName}'s open bills, oldest due first. Nothing new is paid — the ledger already has it.`}
          confirmLabel="Set against bills"
          pending={allocate.isPending}
          onClose={() => setAllocating(null)}
          onConfirm={() =>
            allocate.mutate(
              { id: allocating.id, body: {} },
              { onSuccess: () => setAllocating(null) },
            )
          }
        />
      )}
    </div>
  );
}
