import { CheckCircle2, HandCoins, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { fieldErrors } from '@/api/client';
import { DealerPicker } from '@/components/common/DealerPicker';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  allocatedMinor,
  errorsByInvoice,
  fromPlan,
  toAllocations,
} from '@/features/receivables/allocation';
import { AllocationGrid } from '@/features/receivables/AllocationGrid';
import { balanceText } from '@/features/receivables/format';
import { useParty } from '@/hooks/data/useParties';
import { usePayablesPreview, usePostSupplierPayment } from '@/hooks/data/usePurchasing';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

import { money } from './purchaseFormat';

import { MFS_PROVIDERS } from '@shared/enums';
import { toMinor } from '@shared/money';
import { SUPPLIER_PAYMENT_METHODS } from '@shared/payments';

import type { ApplyState } from '@/features/receivables/allocation';
import type { GridLabels } from '@/features/receivables/AllocationGrid';
import type { MfsProvider } from '@shared/enums';
import type { SupplierPaymentMethod } from '@shared/payments';
import type {
  OpenInvoicePayload,
  OpenPayablePayload,
  PartyPayload,
  SupplierPaymentResult,
} from '@shared/types';

/**
 * Paying a supplier (Day 35) — the receipt screen the other way round. Who, how much, how; then
 * which of their bills (posted goods receipts) it pays, oldest due first unless changed. What is
 * not allocated is an advance to them, set against a later bill.
 */

const METHOD_LABEL: Record<SupplierPaymentMethod, string> = {
  CASH: 'Cash',
  BANK: 'Bank transfer',
  CHEQUE: 'Our cheque',
  MFS: 'bKash / Nagad / Rocket',
};

const BILL_LABELS: GridLabels = {
  doc: 'Bill (receipt)',
  owes: 'We owe',
  nothingOpen: 'No open bills — the whole amount is an advance to the supplier.',
  restGoes: 'is an advance to the supplier',
  moneyVerb: 'paid',
  leftover: 'Advance',
};

/** The shared grid reads invoices; a bill is one by another name. */
const asGridRow = (b: OpenPayablePayload): OpenInvoicePayload => ({
  id: b.id,
  docNo: b.supplierInvoiceNo ? `${b.docNo} · ${b.supplierInvoiceNo}` : b.docNo,
  channel: 'WHOLESALE',
  invoiceDate: b.billDate,
  dueDate: b.dueDate,
  grandTotalMinor: b.grandTotalMinor,
  paidMinor: b.paidMinor,
  creditedMinor: b.creditedMinor,
  balanceMinor: b.balanceMinor,
  daysOverdue: b.daysOverdue,
});

const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function SupplierPaymentEntry() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = useParty('SUPPLIER', params.get('partyId') ?? undefined);
  const [picked, setPicked] = useState<PartyPayload | null | undefined>(undefined);
  const supplier = picked === undefined ? (preset.data ?? null) : picked;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<SupplierPaymentMethod>('BANK');
  const [reference, setReference] = useState('');
  const [mfsProvider, setMfsProvider] = useState<MfsProvider>('BKASH');
  const [trxId, setTrxId] = useState('');
  const [paidAt, setPaidAt] = useState(localNow);
  const [paidAtEdited, setPaidAtEdited] = useState(false);
  const [narration, setNarration] = useState('');
  const [touched, setTouched] = useState(false);
  const [userApply, setUserApply] = useState<ApplyState>({});
  const [errors, setErrors] = useState<{
    byInvoice: Record<string, string>;
    general: string[];
  }>({
    byInvoice: {},
    general: [],
  });
  const [done, setDone] = useState<SupplierPaymentResult | null>(null);

  const amountMinor = Number(amount) > 0 ? toMinor(Number(amount)) : 0;
  const debounced = useDebouncedValue(amountMinor, 300);
  const preview = usePayablesPreview(supplier?.id ?? null, debounced);
  const bills =
    supplier && preview.data?.partyId === supplier.id
      ? preview.data.openPayables.map(asGridRow)
      : [];
  const apply = touched
    ? userApply
    : fromPlan(
        (preview.data?.allocations ?? []).map((a) => ({
          invoiceId: a.grnId,
          docNo: a.docNo,
          amountMinor: a.amountMinor,
        })),
      );
  const allocated = allocatedMinor(bills, apply);
  const post = usePostSupplierPayment();

  const blocker = !supplier
    ? 'Choose the supplier'
    : amountMinor <= 0
      ? 'Enter the amount paid'
      : method === 'CHEQUE' && !reference.trim()
        ? 'Enter the cheque number'
        : method === 'MFS' && trxId.trim().length < 4
          ? 'Enter the transaction id'
          : allocated > amountMinor
            ? 'Allocated more than is being paid'
            : null;

  const clearGrid = () => {
    setTouched(false);
    setUserApply({});
    setErrors({ byInvoice: {}, general: [] });
  };

  const submit = () => {
    if (!supplier || blocker) return;
    const { allocations, invoiceIds } = toAllocations(bills, apply);
    post.mutate(
      {
        partyId: supplier.id,
        amountMinor,
        method,
        allocations: allocations.map((a) => ({
          grnId: a.invoiceId,
          amountMinor: a.amountMinor,
        })),
        ...(paidAtEdited ? { paidAt: new Date(paidAt).toISOString() } : {}),
        reference: reference.trim() || null,
        mfs: method === 'MFS' ? { provider: mfsProvider, trxId: trxId.trim() } : null,
        narration: narration.trim() || null,
      },
      {
        onSuccess: (r) => {
          setDone(r);
          toast.success(`${r.payment.docNo} posted — ${money(r.payment.amountMinor)}`);
        },
        onError: (e) => {
          const fields = fieldErrors(e).map((f) => ({
            ...f,
            path: f.path.replace(/\.grnId$/, '.invoiceId'),
          }));
          setErrors(errorsByInvoice(fields, invoiceIds));
        },
      },
    );
  };

  if (done) {
    const p = done.payment;
    return (
      <div className="space-y-5">
        <PageHeader
          title={`Payment ${p.docNo}`}
          icon={HandCoins}
          description={`${p.partyName} · ${money(p.amountMinor)}`}
        />
        <Card className="max-w-2xl">
          <CardContent className="space-y-3 pt-6 text-sm">
            <p className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Posted
            </p>
            <ul className="divide-y rounded-md border">
              {done.payables.map((b) => (
                <li key={b.id} className="flex justify-between gap-3 px-3 py-2">
                  <span className="font-mono">{b.docNo}</span>
                  <span className="tabular-nums">
                    {b.paymentStatus === 'PAID'
                      ? 'paid in full'
                      : `${money(b.balanceMinor)} still owed`}
                  </span>
                </li>
              ))}
              {p.unallocatedMinor > 0 && (
                <li className="flex justify-between gap-3 px-3 py-2">
                  <span>Advance to the supplier</span>
                  <span className="tabular-nums">{money(p.unallocatedMinor)}</span>
                </li>
              )}
            </ul>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDone(null);
                  setAmount('');
                  setReference('');
                  setTrxId('');
                  setNarration('');
                  setPaidAt(localNow());
                  setPaidAtEdited(false);
                  clearGrid();
                }}
              >
                Record another
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate(`/purchase/statement?partyId=${p.partyId}`)}
              >
                Supplier statement
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pay a supplier"
        icon={HandCoins}
        description="Money to a supplier, set against their bills — the goods receipts they billed."
      />
      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="lg:self-start">
          <CardContent className="space-y-3 pt-6 text-sm">
            <Field label="To">
              <DealerPicker
                role="SUPPLIER"
                value={supplier}
                onChange={(s) => {
                  setPicked(s);
                  clearGrid();
                }}
              />
            </Field>
            {supplier && (
              <p className="text-xs text-muted-foreground">
                {supplier.currentBalanceMinor < 0
                  ? `We owe ${money(-supplier.currentBalanceMinor)}`
                  : `Balance ${balanceText(supplier.currentBalanceMinor)}`}
                {preview.data &&
                  preview.data.existingAdvanceMinor > 0 &&
                  ` · ${money(preview.data.existingAdvanceMinor)} already advanced`}
                {preview.data &&
                  preview.data.unappliedReturnsMinor > 0 &&
                  ` · ${money(preview.data.unappliedReturnsMinor)} in returns not yet set off`}
              </p>
            )}
            <Field label="Amount paid (৳)">
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-right text-lg tabular-nums"
                aria-label="Amount paid"
              />
            </Field>
            <Field label="How">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as SupplierPaymentMethod)}
                aria-label="Payment method"
              >
                {SUPPLIER_PAYMENT_METHODS.map((m) => (
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
              </div>
            )}
            {method !== 'MFS' && method !== 'CASH' && (
              <Field label={method === 'CHEQUE' ? 'Cheque no.' : 'Reference'}>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={method === 'CHEQUE' ? 'e.g. 004512' : 'Transfer id'}
                  aria-label={method === 'CHEQUE' ? 'Cheque number' : 'Reference'}
                />
              </Field>
            )}
            <Field label="Paid on">
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
              Post payment
            </Button>
            {blocker && <p className="text-xs text-muted-foreground">{blocker}.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Against</CardTitle>
          </CardHeader>
          <CardContent>
            {!supplier || amountMinor <= 0 ? (
              <p className="text-sm text-muted-foreground">
                Choose the supplier and enter the amount to see their open bills.
              </p>
            ) : preview.isPending ? (
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground"
                aria-label="Loading"
              />
            ) : (
              <AllocationGrid
                invoices={bills}
                apply={apply}
                amountMinor={amountMinor}
                errors={errors.byInvoice}
                labels={BILL_LABELS}
                onChange={(next) => {
                  setUserApply(next);
                  setTouched(true);
                  setErrors({ byInvoice: {}, general: [] });
                }}
                onResetToFifo={clearGrid}
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
