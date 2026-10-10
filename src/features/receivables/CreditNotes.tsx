import { FileMinus, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { fieldErrors } from '@/api/client';
import { DataTable } from '@/components/common/DataTable';
import { DealerPicker } from '@/components/common/DealerPicker';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { money } from '@/features/dealers/creditMath';
import { usePermission } from '@/hooks/data/useAuth';
import { useAllocationPreview } from '@/hooks/data/useReceivables';
import { useAllocateCreditNote, useCreditNotes } from '@/hooks/data/useReturns';

import { allocatedMinor, errorsByInvoice, fromPlan, toAllocations } from './allocation';
import { AllocationGrid } from './AllocationGrid';

import type { ApplyState } from './allocation';
import type { GridLabels } from './AllocationGrid';
import type { Column } from '@/components/common/DataTable';
import type { CreditNotePayload, PartyPayload } from '@shared/types';

/**
 * Credit notes (Day 36) — credit on dealers' accounts from goods returned. Each is set against
 * invoices like a receipt: by default the invoice the goods came back from; an open one can be
 * set against any of the dealer's open invoices later.
 */

const CREDIT_LABELS: GridLabels = {
  doc: 'Invoice',
  owes: 'Owes',
  nothingOpen: 'The dealer has no open invoices — the credit stays open.',
  restGoes: 'stays open',
  moneyVerb: 'the credit',
  leftover: 'Still open',
};

export function CreditNotes() {
  const canSpend = usePermission('creditNote:create');
  const [dealer, setDealer] = useState<PartyPayload | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [spending, setSpending] = useState<CreditNotePayload | null>(null);
  const { data, isLoading, isFetching } = useCreditNotes({
    page,
    limit: 25,
    partyId: dealer?.id,
    unallocated: openOnly || undefined,
  });

  const columns: Column<CreditNotePayload>[] = [
    {
      key: 'docNo',
      header: 'Credit note',
      cell: (c) => (
        <div>
          <p className="font-mono text-sm">{c.docNo}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(c.postedAt).toLocaleDateString()}
          </p>
        </div>
      ),
    },
    {
      key: 'dealer',
      header: 'Dealer',
      cell: (c) => (
        <div>
          <p className="font-medium">{c.partyName}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {c.salesReturnDocNo} · from {c.invoiceDocNo}
          </p>
        </div>
      ),
    },
    {
      key: 'against',
      header: 'Set against',
      cell: (c) => (
        <span className="text-sm">
          {c.allocations.length ? c.allocations.map((a) => a.docNo).join(', ') : '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (c) => (
        <div>
          <p className="font-medium">{money(c.amountMinor)}</p>
          {c.unallocatedMinor > 0 && (
            <p className="text-xs text-warning">{money(c.unallocatedMinor)} open</p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (c) =>
        canSpend && c.unallocatedMinor > 0 ? (
          <Button variant="outline" size="sm" onClick={() => setSpending(c)}>
            Set against invoices
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Credit notes"
        icon={FileMinus}
        description="Credit on dealers' accounts for goods returned, and the invoices it settled."
      />
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-80">
          <DealerPicker
            value={dealer}
            onChange={(d) => {
              setDealer(d);
              setPage(1);
            }}
            emptyLabel="All dealers…"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={openOnly}
            onChange={(e) => {
              setOpenOnly(e.target.checked);
              setPage(1);
            }}
          />
          With credit still open
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(c) => c.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        empty={<EmptyState icon={FileMinus} title="No credit notes" />}
      />
      {spending && <SpendDialog note={spending} onClose={() => setSpending(null)} />}
    </div>
  );
}

function SpendDialog({ note, onClose }: { note: CreditNotePayload; onClose: () => void }) {
  const preview = useAllocationPreview(note.partyId, note.unallocatedMinor);
  const invoices = preview.data?.openInvoices ?? [];
  const [touched, setTouched] = useState(false);
  const [userApply, setUserApply] = useState<ApplyState>({});
  const [errors, setErrors] = useState<{
    byInvoice: Record<string, string>;
    general: string[];
  }>({
    byInvoice: {},
    general: [],
  });
  const apply = touched ? userApply : fromPlan(preview.data?.allocations ?? []);
  const allocated = allocatedMinor(invoices, apply);
  const spend = useAllocateCreditNote();

  const submit = () => {
    const { allocations, invoiceIds } = toAllocations(invoices, apply);
    spend.mutate(
      { id: note.id, body: { allocations } },
      {
        onSuccess: onClose,
        onError: (e) => setErrors(errorsByInvoice(fieldErrors(e), invoiceIds)),
      },
    );
  };

  return (
    <Dialog
      open
      onClose={spend.isPending ? () => undefined : onClose}
      title={`Set ${note.docNo} against invoices`}
      description={`${note.partyName} · ${money(note.unallocatedMinor)} open. Nothing new posts to the ledger — the credit is already there.`}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={spend.isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={spend.isPending || allocated === 0 || allocated > note.unallocatedMinor}
          >
            {spend.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Set against {money(allocated)}
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
            amountMinor={note.unallocatedMinor}
            errors={errors.byInvoice}
            labels={CREDIT_LABELS}
            onChange={(next) => {
              setUserApply(next);
              setTouched(true);
              setErrors({ byInvoice: {}, general: [] });
            }}
            onResetToFifo={() => setTouched(false)}
            disabled={spend.isPending}
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
