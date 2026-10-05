import { CheckCircle2, Loader2, Printer, Wallet } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { fieldErrors } from '@/api/client';
import { DealerPicker } from '@/components/common/DealerPicker';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { OffScreen } from '@/features/counter/print/PrintDocs';
import { usePrint } from '@/features/counter/print/printHelpers';
import { money } from '@/features/dealers/creditMath';
import { useOrg } from '@/hooks/data/useOrg';
import { useAllocationPreview, usePostReceipt } from '@/hooks/data/useReceivables';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { allocatedMinor, errorsByInvoice, fromPlan, toAllocations } from './allocation';
import { AllocationGrid } from './AllocationGrid';
import { balanceText } from './format';
import { MoneyReceiptDoc } from './print/ReceivablesDocs';

import { MFS_PROVIDERS } from '@shared/enums';
import { toMinor } from '@shared/money';
import { RECEIPT_METHODS } from '@shared/payments';

import type { ApplyState } from './allocation';
import type { MfsProvider } from '@shared/enums';
import type { ReceiptMethod } from '@shared/payments';
import type { PartyPayload, ReceiptResult } from '@shared/types';

/**
 * Taking money from a dealer (Day 29). Who, how much, how — then which invoices it pays.
 *
 * The grid opens on the server's oldest-due-first proposal for the amount typed, and follows the
 * amount until someone edits it; from then on their figures stand ("Oldest first" hands it back).
 * What is not allocated stays on account. Nothing here decides an invoice's balance: the server
 * checks the allocation again against the invoices as they are when the receipt posts.
 */

const METHOD_LABEL: Record<ReceiptMethod, string> = {
  CASH: 'Cash',
  BANK: 'Bank transfer / deposit',
  MFS: 'bKash / Nagad / Rocket',
  CARD: 'Card',
};

/** `YYYY-MM-DDTHH:mm`, local — what a datetime-local input holds. */
const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function ReceiptEntry() {
  const navigate = useNavigate();
  const [dealer, setDealer] = useState<PartyPayload | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ReceiptMethod>('CASH');
  const [paidAt, setPaidAt] = useState(localNow);
  const [paidAtEdited, setPaidAtEdited] = useState(false);
  const [reference, setReference] = useState('');
  const [mfsProvider, setMfsProvider] = useState<MfsProvider>('BKASH');
  const [trxId, setTrxId] = useState('');
  const [sender, setSender] = useState('');
  const [narration, setNarration] = useState('');
  // The grid: the user's figures once touched; until then, the server's proposal.
  const [touched, setTouched] = useState(false);
  const [userApply, setUserApply] = useState<ApplyState>({});
  const [errors, setErrors] = useState<{
    byInvoice: Record<string, string>;
    general: string[];
  }>({
    byInvoice: {},
    general: [],
  });
  const [done, setDone] = useState<ReceiptResult | null>(null);

  const amountMinor = Number(amount) > 0 ? toMinor(Number(amount)) : 0;
  const debounced = useDebouncedValue(amountMinor, 300);
  const preview = useAllocationPreview(dealer?.id ?? null, debounced);
  const invoices =
    dealer && preview.data?.partyId === dealer.id ? preview.data.openInvoices : [];
  const apply = touched ? userApply : fromPlan(preview.data?.allocations ?? []);
  const allocated = allocatedMinor(invoices, apply);

  const post = usePostReceipt();
  const { data: org } = useOrg();
  const printRef = useRef<HTMLDivElement>(null);
  const print = usePrint(printRef, 'A4', `Receipt ${done?.receipt.docNo ?? ''}`);

  const blocker = !dealer
    ? 'Choose the dealer'
    : amountMinor <= 0
      ? 'Enter the amount received'
      : method === 'MFS' && trxId.trim().length < 4
        ? 'Enter the transaction id'
        : allocated > amountMinor
          ? 'Allocated more than was received'
          : null;

  const reset = () => {
    setDealer(null);
    setAmount('');
    setReference('');
    setTrxId('');
    setSender('');
    setNarration('');
    setTouched(false);
    setUserApply({});
    setPaidAt(localNow());
    setPaidAtEdited(false);
    setErrors({ byInvoice: {}, general: [] });
    setDone(null);
  };

  const submit = () => {
    if (!dealer || blocker) return;
    const { allocations, invoiceIds } = toAllocations(invoices, apply);
    post.mutate(
      {
        partyId: dealer.id,
        amountMinor,
        method,
        allocations,
        ...(paidAtEdited ? { paidAt: new Date(paidAt).toISOString() } : {}),
        reference: reference.trim() || null,
        mfs:
          method === 'MFS'
            ? {
                provider: mfsProvider,
                trxId: trxId.trim(),
                senderNumber: sender.trim() || null,
              }
            : null,
        narration: narration.trim() || null,
      },
      {
        onSuccess: (r) => {
          setDone(r);
          toast.success(`${r.receipt.docNo} posted — ${money(r.receipt.amountMinor)}`);
        },
        onError: (e) => setErrors(errorsByInvoice(fieldErrors(e), invoiceIds)),
      },
    );
  };

  if (done) {
    const r = done.receipt;
    return (
      <div className="space-y-5">
        <PageHeader
          title={`Receipt ${r.docNo}`}
          icon={Wallet}
          description={`${r.partyName} · ${money(r.amountMinor)}`}
        />
        <Card className="max-w-2xl">
          <CardContent className="space-y-3 pt-6 text-sm">
            <p className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Posted
            </p>
            <ul className="divide-y rounded-md border">
              {done.invoices.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 px-3 py-2">
                  <span className="font-mono">{i.docNo}</span>
                  <span className="tabular-nums">
                    {i.paymentStatus === 'PAID'
                      ? 'paid in full'
                      : `${money(i.balanceMinor)} still owed`}
                  </span>
                </li>
              ))}
              {r.unallocatedMinor > 0 && (
                <li className="flex justify-between gap-3 px-3 py-2">
                  <span>On account (advance)</span>
                  <span className="tabular-nums">{money(r.unallocatedMinor)}</span>
                </li>
              )}
            </ul>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={print}>
                <Printer aria-hidden="true" /> Print receipt
              </Button>
              <Button variant="outline" onClick={reset}>
                Record another
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate(`/receivables/statement?partyId=${r.partyId}`)}
              >
                Statement
              </Button>
            </div>
          </CardContent>
        </Card>
        <OffScreen>
          <MoneyReceiptDoc ref={printRef} r={done} org={org} />
        </OffScreen>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="New receipt"
        icon={Wallet}
        description="Money from a dealer, set against their invoices."
      />
      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="lg:self-start">
          <CardContent className="space-y-3 pt-6 text-sm">
            <Field label="From">
              <DealerPicker
                value={dealer}
                onChange={(d) => {
                  setDealer(d);
                  setTouched(false);
                  setUserApply({});
                  setErrors({ byInvoice: {}, general: [] });
                }}
              />
            </Field>
            {dealer && (
              <p className="text-xs text-muted-foreground">
                Owes {balanceText(dealer.currentBalanceMinor)}
                {preview.data &&
                  preview.data.existingAdvanceMinor > 0 &&
                  ` · ${money(preview.data.existingAdvanceMinor)} already on account`}
              </p>
            )}
            <Field label="Amount received (৳)">
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-right text-lg tabular-nums"
                aria-label="Amount received"
              />
            </Field>
            <Field label="How">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as ReceiptMethod)}
              >
                {RECEIPT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
            {method === 'MFS' && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Provider">
                  <Select
                    value={mfsProvider}
                    onChange={(e) => setMfsProvider(e.target.value as MfsProvider)}
                  >
                    {MFS_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0) + p.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Transaction id">
                  <Input
                    value={trxId}
                    onChange={(e) => setTrxId(e.target.value.toUpperCase())}
                    className="font-mono"
                  />
                </Field>
                <Field label="Sender number">
                  <Input value={sender} onChange={(e) => setSender(e.target.value)} />
                </Field>
              </div>
            )}
            {(method === 'BANK' || method === 'CARD') && (
              <Field label="Reference">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Deposit slip, transfer id"
                />
              </Field>
            )}
            <Field label="Received on">
              <Input
                type="datetime-local"
                value={paidAt}
                max={localNow()}
                onChange={(e) => {
                  setPaidAt(e.target.value);
                  setPaidAtEdited(true);
                }}
              />
            </Field>
            <Field label="Note">
              <Input value={narration} onChange={(e) => setNarration(e.target.value)} />
            </Field>
            {errors.general.map((m) => (
              <p key={m} role="alert" className="text-xs font-medium text-destructive">
                {m}
              </p>
            ))}
            <Button
              className="w-full"
              disabled={Boolean(blocker) || post.isPending}
              onClick={submit}
              title={blocker ?? undefined}
            >
              {post.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Post receipt
            </Button>
            {blocker && <p className="text-xs text-muted-foreground">{blocker}.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Against</CardTitle>
          </CardHeader>
          <CardContent>
            {!dealer || amountMinor <= 0 ? (
              <p className="text-sm text-muted-foreground">
                Choose the dealer and enter the amount to see their open invoices.
              </p>
            ) : preview.isPending ? (
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground"
                aria-label="Loading"
              />
            ) : (
              <AllocationGrid
                invoices={invoices}
                apply={apply}
                amountMinor={amountMinor}
                errors={errors.byInvoice}
                onChange={(next) => {
                  setUserApply(next);
                  setTouched(true);
                  setErrors({ byInvoice: {}, general: [] });
                }}
                onResetToFifo={() => {
                  setTouched(false);
                  setErrors({ byInvoice: {}, general: [] });
                }}
                disabled={post.isPending}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
