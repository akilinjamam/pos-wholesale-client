import { Ban, Banknote, CheckCircle2, Landmark, Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusPill } from '@/components/common/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fmtDate } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';
import { usePermission } from '@/hooks/data/useAuth';
import {
  useBounceCheque,
  useCheques,
  useClearCheque,
  useDepositCheque,
} from '@/hooks/data/useReceivables';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

import { toMinor } from '@shared/money';

import type { Column } from '@/components/common/DataTable';
import type { ChequeStatus } from '@shared/enums';
import type { ReceiptPayload } from '@shared/types';

/**
 * The cheque register (Day 30): every cheque taken, where it is, and what to do with it next.
 * Oldest cheque date first — the next ones to bank. Nothing a cheque pays is posted until it
 * clears; a bounce after clearing puts every invoice it paid back to what it owed.
 */

const TABS: { key: ChequeStatus | ''; label: string }[] = [
  { key: 'PENDING', label: 'In hand' },
  { key: 'DEPOSITED', label: 'At the bank' },
  { key: 'CLEARED', label: 'Cleared' },
  { key: 'BOUNCED', label: 'Bounced' },
  { key: '', label: 'All' },
];

const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const DAY = 86_400_000;

type Acting = { kind: 'clear' | 'bounce'; cheque: ReceiptPayload } | null;

export function ChequeRegister() {
  const canAct = usePermission('payment:cheque');
  const [status, setStatus] = useState<ChequeStatus | ''>('PENDING');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [acting, setActing] = useState<Acting>(null);
  const q = useDebouncedValue(text.trim(), 250);
  const { data, isLoading, isFetching } = useCheques({
    page,
    limit: 25,
    q: q || undefined,
    status: status || undefined,
  });
  const deposit = useDepositCheque();

  const columns: Column<ReceiptPayload>[] = [
    {
      key: 'cheque',
      header: 'Cheque',
      cell: (c) => (
        <div>
          <p className="font-mono text-sm">{c.instrument?.chequeNo}</p>
          <p className="text-xs text-muted-foreground">
            {[c.instrument?.bankName, c.instrument?.branch].filter(Boolean).join(', ')}
          </p>
        </div>
      ),
    },
    {
      key: 'party',
      header: 'From',
      cell: (c) => (
        <div>
          <p className="font-medium">{c.partyName}</p>
          <p className="font-mono text-xs text-muted-foreground">{c.docNo}</p>
        </div>
      ),
    },
    {
      key: 'dated',
      header: 'Dated',
      cell: (c) => {
        const dated = c.instrument?.chequeDate;
        const days = dated ? Math.ceil((new Date(dated).getTime() - Date.now()) / DAY) : 0;
        const live = c.instrument?.status === 'PENDING' || c.instrument?.status === 'DEPOSITED';
        return (
          <div className="text-sm">
            {fmtDate(dated)}
            {live && days > 0 && (
              <Badge variant="outline" className="ml-2 py-0">
                in {days}d
              </Badge>
            )}
            {c.instrument?.status === 'PENDING' && days <= 0 && (
              <Badge variant="outline" className="ml-2 border-warning/40 py-0 text-warning">
                bank it
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
      cell: (c) => money(c.amountMinor),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => (
        <div>
          <StatusPill status={c.instrument?.status ?? 'PENDING'} />
          {c.instrument?.status === 'CLEARED' && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fmtDate(c.instrument.clearedAt)}
              {c.unallocatedMinor > 0 && ` · ${money(c.unallocatedMinor)} on account`}
            </p>
          )}
          {c.instrument?.status === 'BOUNCED' && (
            <p className="mt-0.5 max-w-[14rem] text-xs text-destructive">
              {c.instrument.bounceReason}
              {c.instrument.bounceChargeMinor > 0 &&
                ` · charge ${money(c.instrument.bounceChargeMinor)}`}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (c) => {
        const s = c.instrument?.status;
        if (!canAct || s === 'BOUNCED') return null;
        return (
          <div className="flex justify-end gap-1">
            {s === 'PENDING' && (
              <Button
                size="sm"
                variant="outline"
                disabled={deposit.isPending}
                onClick={() =>
                  deposit.mutate(
                    { id: c.id, body: {} },
                    {
                      onSuccess: () =>
                        toast.success(`Cheque ${c.instrument?.chequeNo} deposited`),
                    },
                  )
                }
              >
                <Landmark aria-hidden="true" />
                Deposit
              </Button>
            )}
            {(s === 'PENDING' || s === 'DEPOSITED') && (
              <Button size="sm" onClick={() => setActing({ kind: 'clear', cheque: c })}>
                <CheckCircle2 aria-hidden="true" />
                Cleared
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setActing({ kind: 'bounce', cheque: c })}
            >
              <Ban aria-hidden="true" />
              Bounced
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cheques"
        icon={Banknote}
        description="Cheques taken from dealers — nothing they pay is posted until they clear."
      />
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex gap-1">
          {TABS.map((t) => (
            <Button
              key={t.label}
              role="tab"
              aria-selected={status === t.key}
              variant={status === t.key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                setStatus(t.key);
                setPage(1);
              }}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-64">
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
            placeholder="Cheque no., bank, receipt"
            className="pl-9"
            aria-label="Search cheques"
          />
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(c) => c.id}
        isLoading={isLoading}
        isFetching={isFetching}
        meta={data?.meta}
        onPageChange={setPage}
        empty={<EmptyState icon={Banknote} title="No cheques here" />}
      />
      {acting?.kind === 'clear' && (
        <ClearDialog cheque={acting.cheque} onClose={() => setActing(null)} />
      )}
      {acting?.kind === 'bounce' && (
        <BounceDialog cheque={acting.cheque} onClose={() => setActing(null)} />
      )}
    </div>
  );
}

function ClearDialog({ cheque, onClose }: { cheque: ReceiptPayload; onClose: () => void }) {
  const clear = useClearCheque();
  const [at, setAt] = useState(localNow);
  const [edited, setEdited] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Cheque ${cheque.instrument?.chequeNo} cleared?`}
      description={`${money(cheque.amountMinor)} from ${cheque.partyName} is credited to their account and applied to the invoices chosen when it was taken — capped at what each still owes; the rest stays on account.`}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button
            disabled={clear.isPending}
            onClick={() =>
              clear.mutate(
                {
                  id: cheque.id,
                  body: edited ? { clearedAt: new Date(at).toISOString() } : {},
                },
                {
                  onSuccess: (r) => {
                    toast.success(
                      `${r.receipt.docNo} cleared${r.invoices.length ? ` — ${r.invoices.map((i) => i.docNo).join(', ')}` : ''}`,
                    );
                    onClose();
                  },
                },
              )
            }
          >
            {clear.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Cleared
          </Button>
        </>
      }
    >
      <label className="block space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">
          Cleared on (from the bank statement)
        </span>
        <Input
          type="datetime-local"
          value={at}
          max={localNow()}
          onChange={(e) => {
            setAt(e.target.value);
            setEdited(true);
          }}
        />
      </label>
      {cheque.intendedAllocations.length > 0 && (
        <ul className="mt-3 divide-y rounded-md border text-sm">
          {cheque.intendedAllocations.map((a) => (
            <li key={a.invoiceId} className="flex justify-between px-3 py-1.5">
              <span className="font-mono">{a.docNo}</span>
              <span className="tabular-nums">{money(a.amountMinor)}</span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function BounceDialog({ cheque, onClose }: { cheque: ReceiptPayload; onClose: () => void }) {
  const bounce = useBounceCheque();
  const [reason, setReason] = useState('');
  const [charge, setCharge] = useState('');
  const cleared = cheque.instrument?.status === 'CLEARED';
  const ok = reason.trim().length >= 3;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Cheque ${cheque.instrument?.chequeNo} bounced?`}
      description={
        cleared
          ? `It had cleared: the ${money(cheque.amountMinor)} credit is reversed and every invoice it paid owes again exactly what it owed before.`
          : 'It never cleared, so nothing it paid was posted — only a bank charge, if any, is debited.'
      }
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button
            variant="destructive"
            disabled={!ok || bounce.isPending}
            onClick={() =>
              bounce.mutate(
                {
                  id: cheque.id,
                  body: {
                    reason: reason.trim(),
                    ...(charge && Number(charge) > 0
                      ? { bounceChargeMinor: toMinor(Number(charge)) }
                      : {}),
                  },
                },
                {
                  onSuccess: (r) => {
                    toast.success(
                      `Cheque bounced${r.invoices.length ? ` — ${r.invoices.length} invoice(s) owe again` : ''}`,
                    );
                    onClose();
                  },
                },
              )
            }
          >
            {bounce.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Bounced
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            Why (from the bank's return memo)
          </span>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Insufficient funds"
            data-autofocus
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            Bank charge to pass on (৳, optional)
          </span>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={charge}
            onChange={(e) => setCharge(e.target.value)}
            className={cn('w-40 text-right tabular-nums')}
          />
        </label>
        {cleared && cheque.allocations.some((a) => !a.reversedAt) && (
          <ul className="divide-y rounded-md border">
            {cheque.allocations
              .filter((a) => !a.reversedAt)
              .map((a) => (
                <li
                  key={`${a.invoiceId}-${a.allocatedAt}`}
                  className="flex justify-between px-3 py-1.5"
                >
                  <span>
                    <span className="font-mono">{a.docNo}</span> owes again
                  </span>
                  <span className="tabular-nums">{money(a.amountMinor)}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
