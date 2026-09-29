import { Banknote, CreditCard, Landmark, Loader2, Smartphone, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { money } from './saleHelpers';

import { MFS_PROVIDERS } from '@shared/enums';
import { fromMinor, toMinor } from '@shared/money';

import type { MfsProvider } from '@shared/enums';
import type { PosTender, TenderInput } from '@shared/pos';
import type { LucideIcon } from 'lucide-react';

/**
 * Take the money — split across tenders if need be, all from the keyboard.
 *
 *   C / R / M / B   switch to cash / card / mobile money / bank (typed into the amount box)
 *   Enter           add this tender — or, with the box empty and the bill covered, complete
 *   Esc             back to the cart
 *
 * The amount box starts at what is still due, so an exact cash sale is F10, Enter, Enter. Change
 * comes from cash only; the server applies the same rule and records only what was kept.
 */

const METHODS: { method: PosTender; key: string; label: string; icon: LucideIcon }[] = [
  { method: 'CASH', key: 'c', label: 'Cash', icon: Banknote },
  { method: 'CARD', key: 'r', label: 'Card', icon: CreditCard },
  { method: 'MFS', key: 'm', label: 'bKash / Nagad', icon: Smartphone },
  { method: 'BANK', key: 'b', label: 'Bank', icon: Landmark },
];

export interface PaymentDialogProps {
  totalMinor: number;
  /** CREDIT lets a dealer leave a balance on account; CASH needs the bill covered. */
  paymentMode: 'CASH' | 'CREDIT';
  customerName: string | null;
  pending: boolean;
  error: string | null;
  onComplete: (tenders: TenderInput[]) => void;
  onClose: () => void;
}

export function PaymentDialog({
  totalMinor,
  paymentMode,
  customerName,
  pending,
  error,
  onComplete,
  onClose,
}: PaymentDialogProps) {
  const [tenders, setTenders] = useState<TenderInput[]>([]);
  const [method, setMethod] = useState<PosTender>('CASH');
  const [trxId, setTrxId] = useState('');
  const [provider, setProvider] = useState<MfsProvider>('BKASH');
  const [reference, setReference] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  const paid = tenders.reduce((s, t) => s + t.amountMinor, 0);
  const nonCash = tenders
    .filter((t) => t.method !== 'CASH')
    .reduce((s, t) => s + t.amountMinor, 0);
  const remaining = Math.max(0, totalMinor - paid);
  const change = Math.max(0, paid - totalMinor);
  const [amount, setAmount] = useState(String(fromMinor(totalMinor)));

  const covered = paid >= totalMinor;
  const canComplete =
    (covered || paymentMode === 'CREDIT') && !pending && nonCash <= totalMinor;

  const problem = useMemo(() => {
    if (nonCash > totalMinor)
      return 'Card, mobile and bank payments cannot exceed the total — only cash gives change.';
    return null;
  }, [nonCash, totalMinor]);

  const addTender = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return false;
    if (method === 'MFS' && trxId.trim().length < 4) return false;
    const t: TenderInput = {
      method,
      amountMinor: toMinor(value),
      ...(method === 'MFS' ? { mfs: { provider, trxId: trxId.trim() } } : {}),
      ...(method === 'CARD' || method === 'BANK'
        ? { reference: reference.trim() || null }
        : {}),
    };
    const next = [...tenders, t];
    setTenders(next);
    setTrxId('');
    setReference('');
    const nextPaid = next.reduce((s, x) => s + x.amountMinor, 0);
    setAmount(nextPaid >= totalMinor ? '' : String(fromMinor(totalMinor - nextPaid)));
    setMethod('CASH');
    amountRef.current?.focus();
    return true;
  };

  const onAmountKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const m = METHODS.find((x) => x.key === e.key.toLowerCase());
    if (m && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setMethod(m.method);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (amount.trim() !== '') {
        if (method === 'MFS' && trxId.trim().length < 4) {
          document.getElementById('pos-trx')?.focus();
          return;
        }
        addTender();
      } else if (canComplete) onComplete(tenders);
    }
  };

  return (
    <Dialog
      open
      onClose={pending ? () => undefined : onClose}
      title={`Pay ${money(totalMinor)}`}
      description={
        customerName
          ? `${customerName}${paymentMode === 'CREDIT' ? ' — anything unpaid goes on account' : ''}`
          : 'Walk-in — paid in full'
      }
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Back (Esc)
          </Button>
          <Button onClick={() => onComplete(tenders)} disabled={!canComplete}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {covered
              ? 'Complete sale'
              : paymentMode === 'CREDIT'
                ? `Complete — ${money(remaining)} on account`
                : 'Complete sale'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Payment method">
          {METHODS.map((m) => (
            <button
              key={m.method}
              type="button"
              role="radio"
              aria-checked={method === m.method}
              onClick={() => {
                setMethod(m.method);
                amountRef.current?.focus();
              }}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border p-2 text-xs',
                method === m.method
                  ? 'border-primary bg-primary/5 font-medium'
                  : 'text-muted-foreground',
              )}
            >
              <m.icon className="h-4 w-4" aria-hidden="true" />
              {m.label}
              <kbd className="font-mono text-[10px] uppercase">{m.key}</kbd>
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            ref={amountRef}
            data-autofocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            onKeyDown={onAmountKey}
            className="h-12 text-right text-2xl tabular-nums"
            aria-label={`Amount in ${method.toLowerCase()}`}
          />
          <Button variant="outline" className="h-12" onClick={addTender} disabled={!amount}>
            Add
          </Button>
        </div>

        {method === 'MFS' && (
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
            <Select
              value={provider}
              onChange={(e) => setProvider(e.target.value as MfsProvider)}
              aria-label="Provider"
            >
              {MFS_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Input
              id="pos-trx"
              value={trxId}
              onChange={(e) => setTrxId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTender();
                }
              }}
              placeholder="Transaction ID"
              className="font-mono uppercase"
              aria-label="Transaction ID"
            />
          </div>
        )}
        {(method === 'CARD' || method === 'BANK') && (
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Slip / reference (optional)"
            aria-label="Reference"
          />
        )}

        {tenders.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">
            {tenders.map((t, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-1.5">
                <span>
                  {METHODS.find((m) => m.method === t.method)?.label}
                  {t.mfs && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {t.mfs.trxId}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  {money(t.amountMinor)}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setTenders(tenders.filter((_, j) => j !== i))}
                    aria-label="Remove payment"
                  >
                    <Trash2 />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <dl className="grid grid-cols-2 gap-1 text-sm" aria-live="polite">
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="text-right tabular-nums">{money(paid)}</dd>
          <dt className="text-muted-foreground">{change > 0 ? 'Change' : 'Still due'}</dt>
          <dd
            className={cn(
              'text-right text-lg font-semibold tabular-nums',
              change > 0 && 'text-success',
            )}
          >
            {money(change > 0 ? change : remaining)}
          </dd>
        </dl>

        {(problem || error) && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {problem ?? error}
          </p>
        )}
        {covered && !problem && (
          <p className="text-xs text-muted-foreground">
            Press Enter on the empty amount box to complete.
          </p>
        )}
      </div>
    </Dialog>
  );
}
