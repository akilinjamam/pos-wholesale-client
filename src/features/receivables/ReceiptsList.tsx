import { Loader2, Plus, Search, Split, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { fieldErrors } from '@/api/client';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fmtDateTime } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';
import { usePermission } from '@/hooks/data/useAuth';
import {
  useAllocateReceipt,
  useAllocationPreview,
  useReceipts,
} from '@/hooks/data/useReceivables';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { humanise } from '@/lib/utils';

import { allocatedMinor, errorsByInvoice, fromPlan, toAllocations } from './allocation';
import { AllocationGrid } from './AllocationGrid';

import type { ApplyState } from './allocation';
import type { Column } from '@/components/common/DataTable';
import type { ReceiptPayload } from '@shared/types';

/**
 * Receipts (Day 29) — and, with `unapplied`, the unapplied-receipts screen: receipts with money
 * still on account, each with an Allocate action that spends it against the dealer's open invoices.
 */
export function ReceiptsList({ unapplied = false }: { unapplied?: boolean }) {
  const navigate = useNavigate();
  const canReceive = usePermission('payment:receipt');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [allocating, setAllocating] = useState<ReceiptPayload | null>(null);
  const q = useDebouncedValue(text.trim(), 250);
  const { data, isLoading, isFetching } = useReceipts({
    page,
    limit: 25,
    q: q || undefined,
    ...(unapplied ? { unallocated: true, sort: 'paidAt', order: 'asc' as const } : {}),
  });

  const columns: Column<ReceiptPayload>[] = [
    {
      key: 'docNo',
      header: 'Receipt',
      cell: (r) => (
        <div>
          <p className="font-mono text-sm">{r.docNo}</p>
          <p className="text-xs text-muted-foreground">{fmtDateTime(r.paidAt)}</p>
        </div>
      ),
    },
    {
      key: 'party',
      header: 'From',
      cell: (r) => (
        <span>
          <span className="font-medium">{r.partyName}</span>{' '}
          <span className="font-mono text-xs text-muted-foreground">{r.partyCode}</span>
        </span>
      ),
    },
    {
      key: 'method',
      header: 'How',
      cell: (r) => (
        <span className="text-sm">
          {r.method === 'ADJUSTMENT' ? 'Opening advance' : humanise(r.method)}
          {(r.reference || r.mfs) && (
            <span className="block text-xs text-muted-foreground">
              {r.mfs?.trxId ?? r.reference}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'against',
      header: 'Against',
      cell: (r) =>
        r.allocations.length ? (
          <span className="text-xs">
            {[...new Set(r.allocations.map((a) => a.docNo))].join(', ')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (r) => money(r.amountMinor),
    },
    {
      key: 'unallocated',
      header: 'On account',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (r) =>
        r.unallocatedMinor > 0 ? (
          <div className="flex items-center justify-end gap-2">
            <span className="font-medium">{money(r.unallocatedMinor)}</span>
            {canReceive && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setAllocating(r);
                }}
              >
                <Split aria-hidden="true" />
                Allocate
              </Button>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={unapplied ? 'Unapplied receipts' : 'Receipts'}
        icon={Wallet}
        description={
          unapplied
            ? 'Money on account, not yet set against an invoice. Oldest first.'
            : 'Money received from dealers, and what it paid.'
        }
        actions={
          canReceive && (
            <Button onClick={() => navigate('/receivables/receipts/new')}>
              <Plus aria-hidden="true" />
              New receipt
            </Button>
          )
        }
      />
      <div className="relative w-72">
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
          placeholder="Receipt no. or reference"
          className="pl-9"
          aria-label="Search receipts"
        />
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        onRowClick={(r) => navigate(`/receivables/statement?partyId=${r.partyId}`)}
        empty={
          <EmptyState
            icon={Wallet}
            title={unapplied ? 'No money on account' : 'No receipts yet'}
            description={unapplied ? 'Every receipt is fully set against invoices.' : undefined}
          />
        }
      />
      {allocating && (
        <AllocateDialog receipt={allocating} onClose={() => setAllocating(null)} />
      )}
    </div>
  );
}

/** Spend (some of) a receipt's advance against the dealer's open invoices. */
function AllocateDialog({
  receipt,
  onClose,
}: {
  receipt: ReceiptPayload;
  onClose: () => void;
}) {
  const preview = useAllocationPreview(receipt.partyId, receipt.unallocatedMinor);
  const allocate = useAllocateReceipt();
  const [touched, setTouched] = useState(false);
  const [userApply, setUserApply] = useState<ApplyState>({});
  const [errors, setErrors] = useState<{
    byInvoice: Record<string, string>;
    general: string[];
  }>({
    byInvoice: {},
    general: [],
  });
  const invoices = preview.data?.openInvoices ?? [];
  const apply = touched ? userApply : fromPlan(preview.data?.allocations ?? []);
  const allocated = allocatedMinor(invoices, apply);

  const submit = () => {
    const { allocations, invoiceIds } = toAllocations(invoices, apply);
    allocate.mutate(
      { id: receipt.id, body: { allocations } },
      {
        onSuccess: (r) => {
          toast.success(
            `${money(r.receipt.allocatedMinor - receipt.allocatedMinor)} of ${receipt.docNo} allocated`,
          );
          onClose();
        },
        onError: (e) => setErrors(errorsByInvoice(fieldErrors(e), invoiceIds)),
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Allocate ${receipt.docNo}`}
      description={`${money(receipt.unallocatedMinor)} of ${receipt.partyName}'s money is on account.`}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              allocate.isPending || allocated === 0 || allocated > receipt.unallocatedMinor
            }
            onClick={submit}
          >
            {allocate.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Allocate {allocated > 0 ? money(allocated) : ''}
          </Button>
        </>
      }
    >
      {preview.isPending ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : (
        <div className="space-y-2">
          <AllocationGrid
            invoices={invoices}
            apply={apply}
            amountMinor={receipt.unallocatedMinor}
            errors={errors.byInvoice}
            onChange={(next) => {
              setUserApply(next);
              setTouched(true);
            }}
            onResetToFifo={() => setTouched(false)}
            disabled={allocate.isPending}
          />
          {errors.general.map((m) => (
            <p key={m} role="alert" className="text-sm font-medium text-destructive">
              {m}
            </p>
          ))}
        </div>
      )}
    </Dialog>
  );
}
